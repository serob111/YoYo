import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { TokenEncryptionService } from "../token-encryption";

const testKeyHex = randomBytes(32).toString("hex");

describe("TokenEncryptionService", () => {
  it("round-trips a plaintext value", () => {
    const service = new TokenEncryptionService(testKeyHex);
    const plain = "IGAAsomeAccessTokenValue1234567890";
    const encrypted = service.encrypt(plain);
    expect(encrypted).not.toContain(plain);
    expect(service.decrypt(encrypted)).toBe(plain);
  });

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    const service = new TokenEncryptionService(testKeyHex);
    const a = service.encrypt("same-value");
    const b = service.encrypt("same-value");
    expect(a).not.toEqual(b);
  });

  it("fails to decrypt with the wrong key", () => {
    const service = new TokenEncryptionService(testKeyHex);
    const other = new TokenEncryptionService(randomBytes(32).toString("hex"));
    const encrypted = service.encrypt("secret");
    expect(() => other.decrypt(encrypted)).toThrow();
  });

  it("rejects a key of the wrong length", () => {
    expect(() => new TokenEncryptionService("too-short")).toThrow();
  });

  it("accepts a base64-encoded 32-byte key", () => {
    const base64Key = randomBytes(32).toString("base64");
    const service = new TokenEncryptionService(base64Key);
    expect(service.decrypt(service.encrypt("x"))).toBe("x");
  });
});
