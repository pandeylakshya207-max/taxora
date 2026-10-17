// Measures how long the database takes to answer from this computer.
// Usage: node scripts/db-ping.mjs   (reads DATABASE_URL from .env; prints timings only, never the URL)
import "dotenv/config";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
let t = performance.now();
await client.connect();
console.log(`connect (includes waking the database if it was asleep): ${Math.round(performance.now() - t)} ms`);
const times = [];
for (let i = 0; i < 5; i++) {
  t = performance.now();
  await client.query("select 1");
  times.push(Math.round(performance.now() - t));
}
console.log(`5 simple queries: ${times.join(", ")} ms`);
const { rows } = await client.query("select inet_server_addr()::text as server");
console.log(`database region host answered: ${rows[0].server ?? "unknown"}`);
await client.end();
