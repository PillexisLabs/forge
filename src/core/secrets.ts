import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from './env';

// Encrypts integration secrets (IMAP passwords, API tokens) before they go
// into the database. The key comes from AUTH_SECRET, so a database copy alone
// does not reveal them. Format: v1.<iv>.<tag>.<ciphertext>, base64url.

function key(): Buffer {
  const secret = env.authSecret();
  if (!secret) throw new Error('AUTH_SECRET is required to store integration secrets.');
  return createHash('sha256').update(`forge-secrets:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function decryptSecret(stored: string | null): string | null {
  if (!stored) return null;
  const [version, iv, tag, data] = stored.split('.');
  if (version !== 'v1' || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function newToken(): string {
  return `fk_${randomBytes(24).toString('base64url')}`;
}
