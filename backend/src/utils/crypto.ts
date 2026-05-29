import crypto from 'crypto';

/**
 * AES-256-GCM encryption for secrets (env vars, tokens, etc.).
 *
 * Key derivation:
 *  - Production: set ENCRYPTION_KEY env var (base64-encoded 32-byte key)
 *  - Development: derives a key from "flame-dev-key" (NEVER ship this)
 *
 * Format: base64(iv[12] + authTag[16] + ciphertext)
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey && envKey.length >= 32) {
    return Buffer.from(envKey, 'base64');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: ENCRYPTION_KEY must be set (base64 32+ bytes) in production. Generate with: openssl rand -base64 32');
  }

  // Dev-only fallback (never use in prod)
  console.warn('⚠ Using DEVELOPMENT encryption key. Set ENCRYPTION_KEY for production.');
  return crypto.scryptSync('flame-dev-key-not-for-production', 'salt', 32);
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();
  const result = Buffer.concat([iv, tag, encrypted]);
  return result.toString('base64');
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const buf = Buffer.from(ciphertext, 'base64');

  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateSecureToken(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

export function generateTOTPSecret(): string {
  return crypto.randomBytes(20).toString('base64');
}

export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase().match(/.{4}/g)!.join('-')
  );
}
