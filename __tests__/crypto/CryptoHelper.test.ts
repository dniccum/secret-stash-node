import { CryptoHelper } from "../../src/crypto/CryptoHelper";

describe("CryptoHelper", () => {
  describe("base64url encoding/decoding", () => {
    it("should encode and decode round-trip", () => {
      const original = Buffer.from("Hello, World!");
      const encoded = CryptoHelper.base64urlEncode(original);
      const decoded = CryptoHelper.base64urlDecode(encoded);
      expect(decoded).toEqual(original);
    });

    it("should not contain +, /, or = characters", () => {
      const data = Buffer.from([0xff, 0xfe, 0xfd, 0xfc, 0xfb]);
      const encoded = CryptoHelper.base64urlEncode(data);
      expect(encoded).not.toContain("+");
      expect(encoded).not.toContain("/");
      expect(encoded).not.toContain("=");
    });
  });

  describe("AES-GCM encryption/decryption", () => {
    it("should encrypt and decrypt a string", () => {
      const key = CryptoHelper.generateKey();
      const plaintext = "my-secret-value";

      const payload = CryptoHelper.aesGcmEncrypt(plaintext, key);

      expect(payload.v).toBe(1);
      expect(payload.alg).toBe("AES-GCM");
      expect(payload.kdf).toBe("none");
      expect(payload.iter).toBe(0);
      expect(payload.salt).toBeDefined();
      expect(payload.iv).toBeDefined();
      expect(payload.tag).toBeDefined();
      expect(payload.ct).toBeDefined();

      const decrypted = CryptoHelper.aesGcmDecrypt(payload, key);
      expect(decrypted).toBe(plaintext);
    });

    it("should fail to decrypt with wrong key", () => {
      const key1 = CryptoHelper.generateKey();
      const key2 = CryptoHelper.generateKey();
      const plaintext = "my-secret-value";

      const payload = CryptoHelper.aesGcmEncrypt(plaintext, key1);

      expect(() => CryptoHelper.aesGcmDecrypt(payload, key2)).toThrow();
    });

    it("should throw on invalid key length for encrypt", () => {
      const shortKey = Buffer.alloc(16);
      expect(() => CryptoHelper.aesGcmEncrypt("test", shortKey)).toThrow("Key must be 32 bytes");
    });

    it("should throw on invalid key length for decrypt", () => {
      const key = CryptoHelper.generateKey();
      const payload = CryptoHelper.aesGcmEncrypt("test", key);
      const shortKey = Buffer.alloc(16);
      expect(() => CryptoHelper.aesGcmDecrypt(payload, shortKey)).toThrow("Key must be 32 bytes");
    });

    it("should throw on unsupported algorithm", () => {
      const key = CryptoHelper.generateKey();
      const payload = CryptoHelper.aesGcmEncrypt("test", key);
      payload.alg = "AES-CBC";
      expect(() => CryptoHelper.aesGcmDecrypt(payload, key)).toThrow("Unsupported algorithm");
    });

    it("should handle empty string", () => {
      const key = CryptoHelper.generateKey();
      const payload = CryptoHelper.aesGcmEncrypt("", key);
      const decrypted = CryptoHelper.aesGcmDecrypt(payload, key);
      expect(decrypted).toBe("");
    });

    it("should handle unicode strings", () => {
      const key = CryptoHelper.generateKey();
      const plaintext = "Hello 🌍 世界 مرحبا";
      const payload = CryptoHelper.aesGcmEncrypt(plaintext, key);
      const decrypted = CryptoHelper.aesGcmDecrypt(payload, key);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe("generateKey", () => {
    it("should generate a 32-byte key", () => {
      const key = CryptoHelper.generateKey();
      expect(key.length).toBe(32);
    });

    it("should generate unique keys", () => {
      const key1 = CryptoHelper.generateKey();
      const key2 = CryptoHelper.generateKey();
      expect(key1).not.toEqual(key2);
    });
  });

  describe("fingerprint", () => {
    it("should generate a SHA-256 hash of the public key", () => {
      const publicKey = "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----";
      const fp = CryptoHelper.fingerprint(publicKey);
      expect(fp).toHaveLength(64);
      expect(fp).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should be deterministic", () => {
      const publicKey = "test-key";
      const fp1 = CryptoHelper.fingerprint(publicKey);
      const fp2 = CryptoHelper.fingerprint(publicKey);
      expect(fp1).toBe(fp2);
    });
  });

  describe("encodeRecoveryShare", () => {
    it("should produce a string starting with SSREC1-", () => {
      const share = CryptoHelper.encodeRecoveryShare("private-key-pem", "abc123");
      expect(share).toMatch(/^SSREC1-/);
    });

    it("should encode the fingerprint and private key", () => {
      const share = CryptoHelper.encodeRecoveryShare("my-private-key", "my-fingerprint");
      const encoded = share.replace("SSREC1-", "");
      const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
      expect(decoded.v).toBe(1);
      expect(decoded.type).toBe("secret-stash-recovery");
      expect(decoded.alg).toBe("RSA-OAEP");
      expect(decoded.fingerprint).toBe("my-fingerprint");
      const privateKeyDecoded = Buffer.from(decoded.private_key, "base64url").toString("utf8");
      expect(privateKeyDecoded).toBe("my-private-key");
    });
  });

  describe("RSA key pair generation", () => {
    it("should generate valid RSA key pairs", () => {
      const keyPair = CryptoHelper.generateRSAKeyPair();
      expect(keyPair.privateKey).toContain("-----BEGIN PRIVATE KEY-----");
      expect(keyPair.publicKey).toContain("-----BEGIN PUBLIC KEY-----");
    });
  });

  describe("RSA encrypt/decrypt", () => {
    it("should encrypt and decrypt data", () => {
      const keyPair = CryptoHelper.generateRSAKeyPair();
      const original = Buffer.from("Hello, RSA!");

      const encrypted = CryptoHelper.rsaEncrypt(original, keyPair.publicKey);
      const decrypted = CryptoHelper.rsaDecrypt(encrypted, keyPair.privateKey);

      expect(decrypted).toEqual(original);
    });

    it("should fail with wrong private key", () => {
      const keyPair1 = CryptoHelper.generateRSAKeyPair();
      const keyPair2 = CryptoHelper.generateRSAKeyPair();
      const data = Buffer.from("secret data");

      const encrypted = CryptoHelper.rsaEncrypt(data, keyPair1.publicKey);
      expect(() => CryptoHelper.rsaDecrypt(encrypted, keyPair2.privateKey)).toThrow();
    });
  });

  describe("envelope operations", () => {
    it("should create and open an envelope", () => {
      const keyPair = CryptoHelper.generateRSAKeyPair();
      const dek = CryptoHelper.generateKey();

      const envelope = CryptoHelper.createEnvelope(dek, keyPair.publicKey);

      expect(envelope.v).toBe(1);
      expect(envelope.alg).toBe("RSA-OAEP");
      expect(envelope.ct).toBeDefined();

      const decryptedDek = CryptoHelper.openEnvelope(envelope, keyPair.privateKey);
      expect(decryptedDek).toEqual(dek);
    });

    it("should throw on unsupported envelope algorithm", () => {
      const keyPair = CryptoHelper.generateRSAKeyPair();
      expect(() =>
        CryptoHelper.openEnvelope({ v: 1, alg: "UNKNOWN", ct: "test" }, keyPair.privateKey)
      ).toThrow("Unsupported envelope algorithm");
    });
  });

  describe("private key encryption with PBKDF2", () => {
    it("should encrypt and decrypt private key with password", () => {
      const privateKey = "-----BEGIN PRIVATE KEY-----\ntest-key-data\n-----END PRIVATE KEY-----";
      const password = "my-strong-password";

      const encrypted = CryptoHelper.encryptPrivateKey(privateKey, password);

      expect(encrypted.v).toBe(1);
      expect(encrypted.alg).toBe("AES-256-GCM");
      expect(encrypted.kdf).toBe("PBKDF2");
      expect(encrypted.iter).toBe(600000);

      const decrypted = CryptoHelper.decryptPrivateKey(encrypted, password);
      expect(decrypted).toBe(privateKey);
    });

    it("should fail with wrong password", () => {
      const privateKey = "test-key";
      const encrypted = CryptoHelper.encryptPrivateKey(privateKey, "correct-password");
      expect(() => CryptoHelper.decryptPrivateKey(encrypted, "wrong-password")).toThrow();
    });

    it("should throw on unsupported KDF", () => {
      const payload = {
        v: 1,
        alg: "AES-256-GCM",
        kdf: "scrypt",
        iter: 100,
        salt: "abc",
        iv: "def",
        tag: "ghi",
        ct: "jkl",
      };
      expect(() => CryptoHelper.decryptPrivateKey(payload, "password")).toThrow("Unsupported KDF");
    });
  });
});
