import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { VariablesManager } from "../../src/managers/VariablesManager";
import { KeyManager } from "../../src/managers/KeyManager";
import { SecretStashClient } from "../../src/client/SecretStashClient";
import { CryptoHelper } from "../../src/crypto/CryptoHelper";
import { NoEnvironmentsFound } from "../../src/errors";

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

describe("VariablesManager", () => {
  let tempDir: string;
  let keyManager: KeyManager;
  let variablesManager: VariablesManager;
  let keyPair: { privateKey: string; publicKey: string };
  let dek: Buffer;

  beforeEach(() => {
    tempDir = createTempDir();
    keyManager = new KeyManager(tempDir);
    variablesManager = new VariablesManager(keyManager);

    keyPair = CryptoHelper.generateRSAKeyPair();
    dek = CryptoHelper.generateKey();

    keyManager.savePrivateKey(keyPair.privateKey);
    keyManager.saveDeviceMetadata({
      device_key_id: 42,
      label: "Test Device",
      public_key: keyPair.publicKey,
      fingerprint: CryptoHelper.fingerprint(keyPair.publicKey),
    });
  });

  afterEach(() => {
    cleanupDir(tempDir);
  });

  function createEncryptedPayload(value: string) {
    return CryptoHelper.aesGcmEncrypt(value, dek);
  }

  function createEnvelope() {
    return CryptoHelper.createEnvelope(dek, keyPair.publicKey);
  }

  function createMockClient(envData: Record<string, unknown>[] = [], variables: Record<string, unknown>[] = []) {
    return {
      getEnvironments: jest.fn().mockResolvedValue({
        data: envData.length > 0 ? envData : [{ id: 1, name: "Production", slug: "production", type: "production", created_at: "2025-01-01" }],
      }),
      getVariables: jest.fn().mockResolvedValue({
        data: variables,
      }),
      getEnvironmentEnvelope: jest.fn().mockResolvedValue({
        data: { envelope: createEnvelope() },
      }),
      getUserKeys: jest.fn().mockResolvedValue({
        data: [{ id: 42, public_key: keyPair.publicKey, fingerprint: "fp", key_type: "device" }],
      }),
      storeBulkEnvironmentEnvelopes: jest.fn().mockResolvedValue({}),
      createVariable: jest.fn().mockResolvedValue({ data: {} }),
      createEnvironment: jest.fn().mockResolvedValue({ data: { name: "Local", slug: "local", type: "local" } }),
    } as unknown as SecretStashClient;
  }

  describe("list", () => {
    it("should list variables with masked values", async () => {
      const client = createMockClient([], [
        { id: "1", name: "DB_HOST", payload: createEncryptedPayload("localhost"), created_at: "2025-01-01" },
        { id: "2", name: "DB_PORT", payload: createEncryptedPayload("3306"), created_at: "2025-01-01" },
      ]);

      const result = await variablesManager.list(client, "app-123", "production");
      expect(result.total).toBe(2);
      expect(result.variables).toHaveLength(2);
      expect(result.variables[0].name).toBe("DB_HOST");
      expect(result.variables[0].maskedValue).toMatch(/^•+$/);
    });

    it("should handle variables with null payload", async () => {
      const client = createMockClient([], [
        { id: "1", name: "EMPTY_VAR", payload: null, created_at: "2025-01-01" },
      ]);

      const result = await variablesManager.list(client, "app-123", "production");
      expect(result.variables[0].maskedValue).toMatch(/^•+$/);
    });

    it("should throw when environment does not exist", async () => {
      const client = createMockClient([
        { id: 1, name: "Production", slug: "production", type: "production", created_at: "2025-01-01" },
      ]);

      await expect(variablesManager.list(client, "app-123", "staging")).rejects.toThrow(NoEnvironmentsFound);
    });

    it("should throw when no environments exist", async () => {
      const client = {
        getEnvironments: jest.fn().mockResolvedValue({ data: [] }),
      } as unknown as SecretStashClient;

      await expect(variablesManager.list(client, "app-123", "production")).rejects.toThrow(NoEnvironmentsFound);
    });

    it("should throw when no envelope exists for device (not create new DEK)", async () => {
      const client = {
        getEnvironments: jest.fn().mockResolvedValue({
          data: [{ id: 1, name: "Production", slug: "production", type: "production", created_at: "2025-01-01" }],
        }),
        getEnvironmentEnvelope: jest.fn().mockResolvedValue({ data: { envelope: null } }),
      } as unknown as SecretStashClient;

      await expect(variablesManager.list(client, "app-123", "production")).rejects.toThrow("No envelope found for this device");
    });
  });

  describe("pull", () => {
    it("should pull and merge variables into a file", async () => {
      const envFile = path.join(tempDir, ".env");
      fs.writeFileSync(envFile, "EXISTING_VAR=keep\n");

      const client = createMockClient([], [
        { id: "1", name: "DB_HOST", payload: createEncryptedPayload("localhost"), created_at: "2025-01-01" },
        { id: "2", name: "DB_PORT", payload: createEncryptedPayload("3306"), created_at: "2025-01-01" },
      ]);

      const result = await variablesManager.pull(client, "app-123", "production", envFile);
      expect(result.variableCount).toBe(2);

      const content = fs.readFileSync(envFile, "utf-8");
      expect(content).toContain("EXISTING_VAR=keep");
      expect(content).toContain("DB_HOST=localhost");
      expect(content).toContain("DB_PORT=3306");
    });

    it("should create the file if it does not exist", async () => {
      const envFile = path.join(tempDir, ".env.new");

      const client = createMockClient([], [
        { id: "1", name: "DB_HOST", payload: createEncryptedPayload("localhost"), created_at: "2025-01-01" },
      ]);

      await variablesManager.pull(client, "app-123", "production", envFile);
      expect(fs.existsSync(envFile)).toBe(true);
      const content = fs.readFileSync(envFile, "utf-8");
      expect(content).toContain("DB_HOST=localhost");
    });

    it("should skip ignored variables", async () => {
      const envFile = path.join(tempDir, ".env");
      const client = createMockClient([], [
        { id: "1", name: "DB_HOST", payload: createEncryptedPayload("localhost"), created_at: "2025-01-01" },
        { id: "2", name: "APP_KEY", payload: createEncryptedPayload("base64:abc"), created_at: "2025-01-01" },
        { id: "3", name: "SECRET_STASH_TOKEN", payload: createEncryptedPayload("token"), created_at: "2025-01-01" },
      ]);

      const result = await variablesManager.pull(client, "app-123", "production", envFile);
      expect(result.variableCount).toBe(1);
      const content = fs.readFileSync(envFile, "utf-8");
      expect(content).toContain("DB_HOST=localhost");
      expect(content).not.toContain("APP_KEY");
      expect(content).not.toContain("SECRET_STASH_TOKEN");
    });
  });

  describe("push", () => {
    it("should push variables from .env file", async () => {
      const envFile = path.join(tempDir, ".env");
      fs.writeFileSync(envFile, "DB_HOST=localhost\nDB_PORT=3306\n");

      const client = createMockClient();
      const result = await variablesManager.push(client, "app-123", "production", envFile);

      expect(result.created).toBe(2);
      expect(result.failed).toBe(0);
    });

    it("should throw when file not found", async () => {
      const client = createMockClient();
      await expect(
        variablesManager.push(client, "app-123", "production", "/nonexistent/.env")
      ).rejects.toThrow("File not found");
    });

    it("should throw on testing environment", async () => {
      const envFile = path.join(tempDir, ".env");
      fs.writeFileSync(envFile, "DB_HOST=localhost\n");

      const client = createMockClient([
        { id: 1, name: "Testing", slug: "testing", type: "testing", created_at: "2025-01-01" },
      ]);

      await expect(
        variablesManager.push(client, "app-123", "testing", envFile)
      ).rejects.toThrow("testing environment");
    });

    it("should throw when no variables found in file", async () => {
      const envFile = path.join(tempDir, ".env");
      fs.writeFileSync(envFile, "# Only comments\n\n");

      const client = createMockClient();
      await expect(
        variablesManager.push(client, "app-123", "production", envFile)
      ).rejects.toThrow("No variables found");
    });

    it("should filter out ignored variables on push", async () => {
      const envFile = path.join(tempDir, ".env");
      fs.writeFileSync(envFile, "DB_HOST=localhost\nAPP_KEY=secret\nSECRET_STASH_TOKEN=token\n");

      const client = createMockClient();
      const result = await variablesManager.push(client, "app-123", "production", envFile);
      expect(result.created).toBe(1);
    });

    it("should create environment if it does not exist", async () => {
      const envFile = path.join(tempDir, ".env");
      fs.writeFileSync(envFile, "DB_HOST=localhost\n");

      const mockClient = createMockClient([
        { id: 1, name: "Production", slug: "production", type: "production", created_at: "2025-01-01" },
      ]);

      await variablesManager.push(mockClient, "app-123", "staging", envFile);
      expect((mockClient as unknown as { createEnvironment: jest.Mock }).createEnvironment).toHaveBeenCalledWith(
        "app-123", "Staging", "staging", "local"
      );
    });
  });
});
