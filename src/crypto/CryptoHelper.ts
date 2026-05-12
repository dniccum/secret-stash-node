import * as crypto from "crypto";
import { RSAKeyPair } from "../types/RSAKeyPair";
import { AesGcmPayload, EnvelopePayload } from "../types";

export class CryptoHelper {
  static base64urlEncode(data: Buffer): string {
    return data.toString("base64url");
  }

  static base64urlDecode(data: string): Buffer {
    return Buffer.from(data, "base64url");
  }

  static aesGcmEncrypt(plaintext: string, key: Buffer): AesGcmPayload {
    if (key.length !== 32) {
      throw new Error("Key must be 32 bytes (256 bits)");
    }

    const iv = crypto.randomBytes(12);
    const salt = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      v: 1,
      alg: "AES-GCM",
      kdf: "none",
      iter: 0,
      salt: CryptoHelper.base64urlEncode(salt),
      iv: CryptoHelper.base64urlEncode(iv),
      tag: CryptoHelper.base64urlEncode(tag),
      ct: CryptoHelper.base64urlEncode(encrypted),
    };
  }

  static aesGcmDecrypt(payload: AesGcmPayload, key: Buffer): string {
    if (key.length !== 32) {
      throw new Error("Key must be 32 bytes (256 bits)");
    }

    if (!payload.alg || payload.alg !== "AES-GCM") {
      throw new Error("Unsupported algorithm");
    }

    const iv = CryptoHelper.base64urlDecode(payload.iv);
    const tag = CryptoHelper.base64urlDecode(payload.tag);
    const ciphertext = CryptoHelper.base64urlDecode(payload.ct);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }

  static generateKey(): Buffer {
    return crypto.randomBytes(32);
  }

  static fingerprint(publicKey: string): string {
    return crypto.createHash("sha256").update(publicKey).digest("hex");
  }

  static encodeRecoveryShare(privateKey: string, fingerprint: string): string {
    const payload = {
      v: 1,
      type: "secret-stash-recovery",
      alg: "RSA-OAEP",
      fingerprint,
      private_key: CryptoHelper.base64urlEncode(Buffer.from(privateKey, "utf8")),
    };

    return "SSREC1-" + CryptoHelper.base64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  }

  static generateRSAKeyPair(): RSAKeyPair {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
      },
    });

    return { privateKey, publicKey };
  }

  static encryptPrivateKey(privateKey: string, password: string): AesGcmPayload {
    const salt = crypto.randomBytes(16);
    const iterations = 600000;

    const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", derivedKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(privateKey, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      v: 1,
      alg: "AES-256-GCM",
      kdf: "PBKDF2",
      iter: iterations,
      salt: CryptoHelper.base64urlEncode(salt),
      iv: CryptoHelper.base64urlEncode(iv),
      tag: CryptoHelper.base64urlEncode(tag),
      ct: CryptoHelper.base64urlEncode(encrypted),
    };
  }

  static decryptPrivateKey(payload: AesGcmPayload, password: string): string {
    if (!payload.kdf || payload.kdf !== "PBKDF2") {
      throw new Error("Unsupported KDF");
    }

    const salt = CryptoHelper.base64urlDecode(payload.salt);
    const iterations = payload.iter;

    const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");

    const iv = CryptoHelper.base64urlDecode(payload.iv);
    const tag = CryptoHelper.base64urlDecode(payload.tag);
    const ciphertext = CryptoHelper.base64urlDecode(payload.ct);

    const decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }

  static rsaEncrypt(data: Buffer, publicKey: string): Buffer {
    return crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha1",
      },
      data
    );
  }

  static rsaDecrypt(encryptedData: Buffer, privateKey: string): Buffer {
    return crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha1",
      },
      encryptedData
    );
  }

  static createEnvelope(dek: Buffer, publicKey: string): EnvelopePayload {
    const encryptedDEK = CryptoHelper.rsaEncrypt(dek, publicKey);

    return {
      v: 1,
      alg: "RSA-OAEP",
      ct: CryptoHelper.base64urlEncode(encryptedDEK),
    };
  }

  static openEnvelope(envelope: EnvelopePayload, privateKey: string): Buffer {
    if (!envelope.alg || envelope.alg !== "RSA-OAEP") {
      throw new Error("Unsupported envelope algorithm");
    }

    const encryptedDEK = CryptoHelper.base64urlDecode(envelope.ct);

    return CryptoHelper.rsaDecrypt(encryptedDEK, privateKey);
  }
}
