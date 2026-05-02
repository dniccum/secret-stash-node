import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { EnvelopeManager } from "../../src/managers/EnvelopeManager";
import { KeyManager } from "../../src/managers/KeyManager";
import { SecretStashClient } from "../../src/client/SecretStashClient";
import { CryptoHelper } from "../../src/crypto/CryptoHelper";

function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `secret-stash-test-${crypto.randomBytes(8).toString("hex")}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

describe("EnvelopeManager", () => {
  let tempDir: string;
  let keyManager: KeyManager;
  let envelopeManager: EnvelopeManager;
  let currentKeyPair: { privateKey: string; publicKey: string };
  let oldKeyPair: { privateKey: string; publicKey: string };
  let dek: Buffer;

  beforeEach(() => {
    tempDir = createTempDir();
    keyManager = new KeyManager(tempDir);
    envelopeManager = new EnvelopeManager(keyManager);

    currentKeyPair = CryptoHelper.generateRSAKeyPair();
    oldKeyPair = CryptoHelper.generateRSAKeyPair();
    dek = CryptoHelper.generateKey();

    keyManager.savePrivateKey(currentKeyPair.privateKey);
    keyManager.saveDeviceMetadata({
      device_key_id: 42,
      label: "Current Device",
      public_key: currentKeyPair.publicKey,
      fingerprint: CryptoHelper.fingerprint(currentKeyPair.publicKey),
    });
  });

  afterEach(() => {
    cleanupDir(tempDir);
  });

  describe("rewrap", () => {
    it("should rewrap an envelope from old key to current key", async () => {
      const oldEnvelope = CryptoHelper.createEnvelope(dek, oldKeyPair.publicKey);

      const mockClient = {
        getEnvironmentEnvelope: jest.fn().mockResolvedValue({
          data: { envelope: oldEnvelope },
        }),
        storeEnvironmentEnvelope: jest.fn().mockResolvedValue({}),
      } as unknown as SecretStashClient;

      await envelopeManager.rewrap(mockClient, {
        applicationId: "app-123",
        environmentSlug: "production",
        oldPrivateKey: oldKeyPair.privateKey,
        oldDeviceKeyId: 10,
      });

      expect((mockClient as unknown as { storeEnvironmentEnvelope: jest.Mock }).storeEnvironmentEnvelope).toHaveBeenCalledWith(
        "app-123",
        "production",
        42,
        expect.objectContaining({ v: 1, alg: "RSA-OAEP" })
      );
    });

    it("should throw when no envelope found for old device key", async () => {
      const mockClient = {
        getEnvironmentEnvelope: jest.fn().mockResolvedValue({
          data: { envelope: null },
        }),
      } as unknown as SecretStashClient;

      await expect(
        envelopeManager.rewrap(mockClient, {
          applicationId: "app-123",
          environmentSlug: "production",
          oldPrivateKey: oldKeyPair.privateKey,
          oldDeviceKeyId: 10,
        })
      ).rejects.toThrow("No envelope found for the old device key");
    });

    it("should load old private key from file path", async () => {
      const oldKeyFile = path.join(tempDir, "old_key.pem");
      fs.writeFileSync(oldKeyFile, oldKeyPair.privateKey);

      const oldEnvelope = CryptoHelper.createEnvelope(dek, oldKeyPair.publicKey);

      const mockClient = {
        getEnvironmentEnvelope: jest.fn().mockResolvedValue({
          data: { envelope: oldEnvelope },
        }),
        storeEnvironmentEnvelope: jest.fn().mockResolvedValue({}),
      } as unknown as SecretStashClient;

      await envelopeManager.rewrap(mockClient, {
        applicationId: "app-123",
        environmentSlug: "production",
        oldPrivateKeyPath: oldKeyFile,
        oldDeviceKeyId: 10,
      });

      expect((mockClient as unknown as { storeEnvironmentEnvelope: jest.Mock }).storeEnvironmentEnvelope).toHaveBeenCalled();
    });
  });

  describe("reset", () => {
    it("should reset the environment key for all device keys", async () => {
      const mockClient = {
        getUserKeys: jest.fn().mockResolvedValue({
          data: [
            { id: 1, public_key: currentKeyPair.publicKey, fingerprint: "fp1", label: "D1", key_type: "device" },
          ],
        }),
        storeBulkEnvironmentEnvelopes: jest.fn().mockResolvedValue({}),
      } as unknown as SecretStashClient;

      const result = await envelopeManager.reset(mockClient, "app-123", "production");
      expect(result.envelopeCount).toBe(1);
      expect((mockClient as unknown as { storeBulkEnvironmentEnvelopes: jest.Mock }).storeBulkEnvironmentEnvelopes).toHaveBeenCalled();
    });

    it("should throw when no device keys found", async () => {
      const mockClient = {
        getUserKeys: jest.fn().mockResolvedValue({ data: [] }),
      } as unknown as SecretStashClient;

      await expect(
        envelopeManager.reset(mockClient, "app-123", "production")
      ).rejects.toThrow("No device keys found");
    });
  });

  describe("repair", () => {
    it("should fall back to reset when rewrap fails", async () => {
      const mockClient = {
        getEnvironmentEnvelope: jest.fn().mockResolvedValue({
          data: { envelope: null },
        }),
        getUserKeys: jest.fn().mockResolvedValue({
          data: [
            { id: 1, public_key: currentKeyPair.publicKey, fingerprint: "fp1", label: "D1", key_type: "device" },
          ],
        }),
        storeBulkEnvironmentEnvelopes: jest.fn().mockResolvedValue({}),
      } as unknown as SecretStashClient;

      await envelopeManager.repair(mockClient, {
        applicationId: "app-123",
        environmentSlug: "production",
        oldPrivateKey: oldKeyPair.privateKey,
        oldDeviceKeyId: 10,
      });

      expect((mockClient as unknown as { storeBulkEnvironmentEnvelopes: jest.Mock }).storeBulkEnvironmentEnvelopes).toHaveBeenCalled();
    });
  });
});
