import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH_BYTES = 32;

function parseKey(rawKey: string): Buffer {
  const asHex = /^[0-9a-fA-F]+$/.test(rawKey) && rawKey.length === KEY_LENGTH_BYTES * 2 ? Buffer.from(rawKey, "hex") : undefined;
  const key = asHex ?? Buffer.from(rawKey, "base64");
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(`ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH_BYTES} bytes (got ${key.length}). Provide 64 hex chars or 32-byte base64.`);
  }
  return key;
}

export class TokenEncryptionService {
  private readonly key: Buffer;

  constructor(rawKey: string) {
    this.key = parseKey(rawKey);
  }

  encrypt(plainText: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
  }

  decrypt(encoded: string): string {
    const raw = Buffer.from(encoded, "base64");
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
    const ciphertext = raw.subarray(IV_LENGTH + 16);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }
}
