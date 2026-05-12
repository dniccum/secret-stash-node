import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { KeyManager } from "../../src/managers/KeyManager";
import { SecretStashClient } from "../../src/client/SecretStashClient";
import { DeviceKeyNotRegistered, PrivateKeyNotFound } from "../../src/errors";

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

function createMockClient(overrides: Record<string, unknown> = {}) {
  return {
    getUserKeys: jest.fn().mockResolvedValue(overrides["getUserKeys"] ?? { data: [] }),
    storeDeviceKey: jest.fn().mockResolvedValue(overrides["storeDeviceKey"] ?? {
      data: {
        id: 42,
        label: "Test Device",
        public_key: "pub-key",
        fingerprint: "abc123",
        key_type: "device",
      },
    }),
  } as unknown as SecretStashClient;
}

describe("KeyManager", () => {
  let tempDir: string;
  let keyManager: KeyManager;

  beforeEach(() => {
    tempDir = createTempDir();
    keyManager = new KeyManager(tempDir);
  });

  afterEach(() => {
    cleanupDir(tempDir);
  });

  describe("constructor", () => {
    it("should create the key directory if it does not exist", () => {
      const newDir = path.join(tempDir, "nested", "keys");
      new KeyManager(newDir);
      expect(fs.existsSync(newDir)).toBe(true);
    });
  });

  describe("getKeyPath", () => {
    it("should return the key path", () => {
      expect(keyManager.getKeyPath()).toBe(tempDir);
    });
  });

  describe("hasLocalPrivateKey / loadPrivateKey / savePrivateKey", () => {
    it("should return false when no key exists", () => {
      expect(keyManager.hasLocalPrivateKey()).toBe(false);
    });

    it("should save and load a private key", () => {
      const key = "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----";
      keyManager.savePrivateKey(key);
      expect(keyManager.hasLocalPrivateKey()).toBe(true);
      expect(keyManager.loadPrivateKey()).toBe(key);
    });

    it("should return null when no key file exists", () => {
      expect(keyManager.loadPrivateKey()).toBeNull();
    });
  });

  describe("getPrivateKey", () => {
    it("should throw PrivateKeyNotFound when no key exists", () => {
      expect(() => keyManager.getPrivateKey()).toThrow(PrivateKeyNotFound);
    });

    it("should return the key when it exists", () => {
      keyManager.savePrivateKey("my-key");
      expect(keyManager.getPrivateKey()).toBe("my-key");
    });
  });

  describe("loadDeviceMetadata / saveDeviceMetadata", () => {
    it("should return null when no metadata exists", () => {
      expect(keyManager.loadDeviceMetadata()).toBeNull();
    });

    it("should save and load device metadata", () => {
      const meta = {
        device_key_id: 42,
        label: "Test Device",
        public_key: "pub-key",
        fingerprint: "abc123",
      };
      keyManager.saveDeviceMetadata(meta);
      const loaded = keyManager.loadDeviceMetadata();
      expect(loaded).toEqual(meta);
    });
  });

  describe("getDeviceKeyId", () => {
    it("should throw DeviceKeyNotRegistered when no metadata exists", () => {
      expect(() => keyManager.getDeviceKeyId()).toThrow(DeviceKeyNotRegistered);
    });

    it("should return the device key id", () => {
      keyManager.saveDeviceMetadata({
        device_key_id: 42,
        label: "Test",
        fingerprint: "abc",
      });
      expect(keyManager.getDeviceKeyId()).toBe(42);
    });
  });

  describe("getDevicePublicKey", () => {
    it("should throw DeviceKeyNotRegistered when no metadata exists", () => {
      expect(() => keyManager.getDevicePublicKey()).toThrow(DeviceKeyNotRegistered);
    });

    it("should return the public key", () => {
      keyManager.saveDeviceMetadata({
        device_key_id: 42,
        label: "Test",
        public_key: "my-pub-key",
        fingerprint: "abc",
      });
      expect(keyManager.getDevicePublicKey()).toBe("my-pub-key");
    });
  });

  describe("status", () => {
    it("should report status with no local keys", async () => {
      const client = createMockClient();
      const result = await keyManager.status(client);

      expect(result.hasLocalPrivateKey).toBe(false);
      expect(result.localMetadata).toBeNull();
      expect(result.serverKeyCount).toBe(0);
      expect(result.isRegisteredOnServer).toBe(false);
    });

    it("should report status with local keys and server match", async () => {
      keyManager.savePrivateKey("key");
      keyManager.saveDeviceMetadata({
        device_key_id: 42,
        label: "Test",
        fingerprint: "match-fp",
      });

      const client = createMockClient({
        getUserKeys: {
          data: [
            { id: 42, fingerprint: "match-fp", label: "Test", public_key: "pub", key_type: "device" },
          ],
        },
      });

      const result = await keyManager.status(client);
      expect(result.hasLocalPrivateKey).toBe(true);
      expect(result.localMetadata).not.toBeNull();
      expect(result.serverKeyCount).toBe(1);
      expect(result.isRegisteredOnServer).toBe(true);
    });
  });

  describe("init", () => {
    it("should throw when keys exist and force is false", async () => {
      keyManager.savePrivateKey("existing-key");
      const client = createMockClient();
      await expect(keyManager.init(client)).rejects.toThrow("Device keys already exist locally");
    });

    it("should initialize keys successfully", async () => {
      const client = createMockClient();
      const result = await keyManager.init(client, { label: "My Device" });

      expect(result.deviceKeyId).toBe(42);
      expect(result.isTemporary).toBe(false);
      expect(keyManager.hasLocalPrivateKey()).toBe(true);
      expect(keyManager.loadDeviceMetadata()).not.toBeNull();
    });

    it("should force regenerate keys", async () => {
      keyManager.savePrivateKey("old-key");
      const client = createMockClient();
      const result = await keyManager.init(client, { force: true, label: "New Device" });

      expect(result.deviceKeyId).toBe(42);
      expect(keyManager.hasLocalPrivateKey()).toBe(true);
    });
  });

  describe("init temporary key", () => {
    it("should reject invalid TTL", async () => {
      const client = createMockClient();
      await expect(keyManager.init(client, { temporary: true, ttlMinutes: 2 })).rejects.toThrow("TTL must be between 5 and 60 minutes");
    });

    it("should create temporary key", async () => {
      const client = createMockClient({
        storeDeviceKey: {
          data: {
            id: 99,
            label: "CI/CD Key",
            public_key: "temp-pub",
            fingerprint: "temp-fp",
            key_type: "device",
            expires_at: "2025-01-01T00:00:00Z",
          },
        },
      });

      const result = await keyManager.init(client, { temporary: true, ttlMinutes: 15 });

      expect(result.isTemporary).toBe(true);
      expect(result.deviceKeyId).toBe(99);
      expect(result.keyDirectory).toContain("secret-stash-tmp-");

      cleanupDir(result.keyDirectory);
    });
  });

  describe("sync", () => {
    it("should throw when no local metadata exists", async () => {
      const client = createMockClient();
      await expect(keyManager.sync(client)).rejects.toThrow("No local device record found");
    });

    it("should throw when no server match found", async () => {
      keyManager.saveDeviceMetadata({
        device_key_id: 42,
        label: "Test",
        fingerprint: "no-match",
      });
      const client = createMockClient({
        getUserKeys: { data: [{ id: 1, fingerprint: "different", label: "Other", public_key: "pub", key_type: "device" }] },
      });
      await expect(keyManager.sync(client)).rejects.toThrow("No matching device key found");
    });

    it("should sync successfully", async () => {
      keyManager.saveDeviceMetadata({
        device_key_id: 42,
        label: "Old Label",
        fingerprint: "match-fp",
      });

      const client = createMockClient({
        getUserKeys: {
          data: [
            { id: 100, fingerprint: "match-fp", label: "Updated Label", public_key: "new-pub", key_type: "device" },
          ],
        },
      });

      const result = await keyManager.sync(client);
      expect(result.device_key_id).toBe(100);
      expect(result.label).toBe("Updated Label");
    });
  });

  describe("generateRecoveryKey", () => {
    it("should throw when recovery key exists and force is false", async () => {
      const client = createMockClient({
        getUserKeys: {
          data: [{ id: 1, key_type: "recovery", fingerprint: "rec-fp", label: "Recovery", public_key: "pub" }],
        },
      });
      await expect(keyManager.generateRecoveryKey(client)).rejects.toThrow("A recovery key already exists");
    });

    it("should generate recovery key successfully", async () => {
      const client = createMockClient({
        getUserKeys: { data: [] },
        storeDeviceKey: {
          data: {
            id: 50,
            label: "Recovery Key",
            public_key: "rec-pub",
            fingerprint: "rec-fp",
            key_type: "recovery",
          },
        },
      });

      const result = await keyManager.generateRecoveryKey(client, { outputDir: tempDir });
      expect(result.share).toMatch(/^SSREC1-/);
      expect(result.deviceKeyId).toBe(50);
      expect(fs.existsSync(result.sharePath)).toBe(true);
    });
  });
});
