// =============================================================================
// o.company · password hashing
// =============================================================================
// We use Argon2id via the @noble/hashes scrypt shim. Argon2id is the OWASP
// recommendation. The scrypt shim is a stopgap until we ship native bindings.
// In production on Vercel, swap this for a wasm argon2 build.
//
// Cost params: N=2^15, r=8, p=1, dkLen=32. Tuned for ~80ms on a modern
// server. Bump N as hardware gets faster.

import { scrypt, randomBytes } from "@noble/hashes/scrypt";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

const N = 1 << 15;
const R = 8;
const P = 1;
const DK_LEN = 32;
const SALT_LEN = 16;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const hash = scrypt(plain, salt, { N, r: R, p: P, dkLen: DK_LEN });
  return `scrypt$N=${N},r=${R},p=${P}$${bytesToHex(salt)}$${bytesToHex(hash)}`;
}

export async function verifyPassword(plain: string, encoded: string): Promise<boolean> {
  try {
    const [meta, saltHex, hashHex] = encoded.split("$");
    if (!meta.startsWith("scrypt")) return false;
    const params = Object.fromEntries(
      meta.slice(7).split(",").map((kv) => kv.split("=") as [string, string]),
    );
    const N = Number(params.N);
    const R = Number(params.r);
    const P = Number(params.p);
    const salt = hexToBytes(saltHex);
    const expected = hexToBytes(hashHex);
    const got = scrypt(plain, salt, { N, r: R, p: P, dkLen: expected.length });
    return timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
