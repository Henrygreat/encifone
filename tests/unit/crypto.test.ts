import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, SecretDecryptionError } from "@/lib/crypto";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a plaintext secret", () => {
    const plaintext = "sk-ant-super-secret-key-12345";
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV), but both decrypt correctly", () => {
    const plaintext = "same-secret";
    const first = encryptSecret(plaintext);
    const second = encryptSecret(plaintext);
    expect(first).not.toBe(second);
    expect(decryptSecret(first)).toBe(plaintext);
    expect(decryptSecret(second)).toBe(plaintext);
  });

  it("rejects a tampered ciphertext rather than returning garbage", () => {
    const encrypted = encryptSecret("do-not-tamper");
    const [iv, authTag, ciphertext] = encrypted.split(":");
    const tampered = [iv, authTag, ciphertext.slice(0, -2) + "ff"].join(":");
    expect(() => decryptSecret(tampered)).toThrow(SecretDecryptionError);
  });

  it("rejects a malformed stored value", () => {
    expect(() => decryptSecret("not-the-right-shape")).toThrow(SecretDecryptionError);
  });
});
