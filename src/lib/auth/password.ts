import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

/**
 * Password hashing with Node's built-in scrypt (memory-hard, no extra dependency).
 * Stored format: scrypt$N$r$p$<salt base64>$<hash base64>
 * Parameters are stored with the hash so they can be raised later without
 * breaking existing passwords.
 */

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 64;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCb(password, salt, KEY_LEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A real hash of a random password, used so unknown emails take as long as known ones. */
let dummyHash: Promise<string> | null = null;
export function getDummyHash() {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}
