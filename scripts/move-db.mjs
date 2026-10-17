// Copies every row from the current database (DIRECT_URL) into a new, empty one
// (NEW_DIRECT_URL) that already has the schema (prisma migrate deploy).
// Read-only on the old database. Refuses to write into a database that has data.
// Prints table names and row counts only — never connection strings.
import "dotenv/config";
import pg from "pg";

// Keep dates and JSON exactly as stored (raw text), so nothing is re-interpreted.
for (const oid of [1082, 1114, 1184, 114, 3802]) pg.types.setTypeParser(oid, (v) => v);

const OLD = process.env.DIRECT_URL;
const NEW = process.env.NEW_DIRECT_URL;
if (!OLD || !NEW) throw new Error("DIRECT_URL and NEW_DIRECT_URL must both be set in .env");
if (OLD === NEW) throw new Error("Old and new database are the same — nothing to do.");

const src = new pg.Client({ connectionString: OLD });
const dst = new pg.Client({ connectionString: NEW });
await src.connect();
await dst.connect();

const tablesQ = `select table_name from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> '_prisma_migrations'`;
const tables = (await src.query(tablesQ)).rows.map((r) => r.table_name);
const dstTables = new Set((await dst.query(tablesQ)).rows.map((r) => r.table_name));
const missing = tables.filter((t) => !dstTables.has(t));
if (missing.length) throw new Error(`New database is missing tables: ${missing.join(", ")}. Run prisma migrate deploy on it first.`);

for (const t of tables) {
  const { rows } = await dst.query(`select count(*)::int as n from "${t}"`);
  if (rows[0].n > 0) throw new Error(`New database already has data in "${t}". Stopping so nothing is overwritten.`);
}

// Order tables so every referenced table is copied before the tables that point to it.
const fks = (
  await src.query(`select tc.table_name as child, ccu.table_name as parent
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`)
).rows;
const order = [];
const done = new Set();
const visit = (t, stack = new Set()) => {
  if (done.has(t)) return;
  if (stack.has(t)) return; // self-reference: rows are inserted in id order within the table
  stack.add(t);
  for (const f of fks) if (f.child === t && f.parent !== t) visit(f.parent, stack);
  done.add(t);
  order.push(t);
};
tables.forEach((t) => visit(t));

const BATCH = 200;
await dst.query("begin");
try {
  for (const t of order) {
    const cols = (
      await src.query(`select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`, [t])
    ).rows.map((r) => r.column_name);
    const { rows } = await src.query(`select ${cols.map((c) => `"${c}"`).join(", ")} from "${t}"`);
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const params = [];
      const values = chunk.map((row) => `(${cols.map((c) => { params.push(row[c]); return `$${params.length}`; }).join(", ")})`);
      await dst.query(`insert into "${t}" (${cols.map((c) => `"${c}"`).join(", ")}) values ${values.join(", ")}`, params);
    }
    console.log(`${t}: ${rows.length} row(s) copied`);
  }

  // Auto-increment counters (e.g. support ticket numbers) continue from the copied data.
  const seqs = (
    await dst.query(`select table_name, column_name, pg_get_serial_sequence('"' || table_name || '"', column_name) as seq
      from information_schema.columns where table_schema='public' and column_default like 'nextval%'`)
  ).rows;
  for (const s of seqs) {
    await dst.query(`select setval($1, coalesce((select max("${s.column_name}") from "${s.table_name}"), 0) + 1, false)`, [s.seq]);
  }

  // Verify before committing: every table must have exactly the same number of rows.
  for (const t of order) {
    const a = (await src.query(`select count(*)::int as n from "${t}"`)).rows[0].n;
    const b = (await dst.query(`select count(*)::int as n from "${t}"`)).rows[0].n;
    if (a !== b) throw new Error(`Row count mismatch in "${t}": old ${a}, new ${b}`);
  }
  await dst.query("commit");
  console.log(`\nDone. ${order.length} tables copied and verified (row counts match). The old database was not changed.`);
} catch (e) {
  await dst.query("rollback");
  console.error(`\nNothing was saved in the new database: ${e.message}`);
  process.exitCode = 1;
} finally {
  await src.end();
  await dst.end();
}
