import crypto from 'crypto';

/**
 * Encryption helper for at-rest credentials stored in the database.
 *
 * Threat model: camvasser's Postgres stores per-tenant connector credentials
 * (e.g. the connection string to a tenant's website database). We want those
 * credentials to be unreadable to anyone with read-only DB access (dashboard,
 * psql, Prisma Studio, DB backups). Only the runtime that has both DB access
 * AND the CONNECTOR_ENC_KEY env var can decrypt them.
 *
 * Algorithm: AES-256-GCM with a random 12-byte IV and 16-byte auth tag.
 * Wire format: base64( iv || tag || ciphertext )
 *
 * The key is a 32-byte random value, base64-encoded in the CONNECTOR_ENC_KEY
 * env var. Generate with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

const ALGO = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey() {
  const raw = process.env.CONNECTOR_ENC_KEY;
  if (!raw) {
    throw new Error('CONNECTOR_ENC_KEY env var is not set');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `CONNECTOR_ENC_KEY must be a base64-encoded ${KEY_BYTES}-byte key, got ${key.length} bytes`
    );
  }
  return key;
}

/**
 * Encrypt an arbitrary JSON-serializable value.
 * Returns a base64 string suitable for storage in a text/jsonb column.
 */
export function encryptJson(value) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/**
 * Decrypt a value produced by encryptJson.
 * Throws if the key is wrong, the ciphertext is corrupted, or the auth tag fails.
 */
export function decryptJson(encoded) {
  const key = getKey();
  const buf = Buffer.from(encoded, 'base64');
  if (buf.length < IV_BYTES + TAG_BYTES) {
    throw new Error('Ciphertext is too short to be valid');
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}
