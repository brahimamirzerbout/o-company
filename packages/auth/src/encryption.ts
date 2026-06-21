// =============================================================================
// @o/auth/encryption — column-level encryption
// =============================================================================
// AES-256-GCM column-level encryption for sensitive fields. The
// `ENCRYPTION_KEY` env var is the source of truth for the encryption
// key. NEVER log the key. NEVER write it to disk unencrypted.
//
// What this encrypts:
//   - contacts.email
//   - contacts.notes
//   - people.email
//   - Any other field the caller passes in
//
// What this DOES NOT encrypt:
//   - Anything in the audit log (audit log is append-only and
//     must be readable for compliance. The event payloads may
//     contain encrypted blobs; the audit row itself is not.)
//   - Anything in the public schema
//   - Anything encrypted by the DB itself (e.g. column-level
//     encryption at the Postgres level, which is a separate concern)
//
// Format: base64( iv (12 bytes) || authTag (16 bytes) || ciphertext )
// This is the standard JWE-ish format for AES-GCM.
//
// The key is 32 bytes (256 bits). We hash the env var with SHA-256 to
// get a deterministic 32-byte key. This means a passphrase-style env
// var also works.
//
// Performance: AES-GCM is fast. ~1 microsecond per encrypt/decrypt
// on modern hardware. The DB stays the bottleneck. Don't encrypt
// 100k rows in a tight loop; batch by ID.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;       // GCM standard
const TAG_LEN = 16;      // GCM standard

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is not set. Sensitive columns cannot be encrypted at rest. See SETUP.md step 4.");
  }
  // Hash the key to get a deterministic 32-byte buffer. This means
  // a passphrase-style key works as well as a hex key.
  return createHash("sha256").update(raw, "utf8").digest();
}

/** Encrypt a string. Returns a base64-encoded blob. */
export function encrypt(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined) return null;
  if (plaintext === "") return "";
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/** Decrypt a base64-encoded blob. Returns the original string. */
export function decrypt(blob: string | null | undefined): string | null {
  if (blob === null || blob === undefined) return null;
  if (blob === "") return "";
  const key = getKey();
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error("Encrypted blob is too short to be valid");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Encrypt an object. Returns a base64-encoded JSON blob. */
export function encryptJson<T>(obj: T): string | null {
  if (obj === null || obj === undefined) return null;
  return encrypt(JSON.stringify(obj));
}

/** Decrypt a base64-encoded JSON blob. */
export function decryptJson<T>(blob: string | null | undefined): T | null {
  const str = decrypt(blob);
  if (str === null || str === "") return null;
  return JSON.parse(str) as T;
}

/** Check if a string looks like an encrypted blob (base64 of the right length). */
export function isEncrypted(s: string | null | undefined): boolean {
  if (!s) return false;
  if (s.length < 24) return false;  // minimum length for IV + TAG + some bytes
  return /^[A-Za-z0-9+/=]+$/.test(s);
}
