import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { AgentsManager } from "../../src/managers/AgentsManager";
import { KeyManager } from "../../src/managers/KeyManager";
import { SecretStashClient } from "../../src/client/SecretStashClient";
import { CryptoHelper } from "../../src/crypto/CryptoHelper";
import { AgentType } from "../../src/types";

const agent = {
  id: "agent-1",
  name: "Claude",
  description: null,
  type: "claude-code",
  status: "active",
  last_tested_at: null,
  last_test_status: "untested",
  created_at: "2026-01-01T00:00:00+00:00",
  updated_at: "2026-01-01T00:00:00+00:00",
};

function mockClient(methods: Record<string, unknown>): SecretStashClient {
  const client: Record<string, jest.Mock> = {};
  for (const [name, value] of Object.entries(methods)) {
    client[name] = jest.fn().mockResolvedValue(value);
  }
  return client as unknown as SecretStashClient;
}

function mocked(client: SecretStashClient, method: string): jest.Mock {
  return (client as unknown as Record<string, jest.Mock>)[method];
}

describe("AgentsManager", () => {
  let tempDir: string;
  let keyManager: KeyManager;
  let manager: AgentsManager;
  let keyPair: { privateKey: string; publicKey: string };

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `secret-stash-test-${crypto.randomBytes(8).toString("hex")}`);
    fs.mkdirSync(tempDir, { recursive: true });
    keyManager = new KeyManager(tempDir);
    manager = new AgentsManager(keyManager);

    keyPair = CryptoHelper.generateRSAKeyPair();
    keyManager.savePrivateKey(keyPair.privateKey);
    keyManager.saveDeviceMetadata({
      device_key_id: 42,
      label: "Test Device",
      public_key: keyPair.publicKey,
      fingerprint: CryptoHelper.fingerprint(keyPair.publicKey),
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("list / get", () => {
    it("lists agents", async () => {
      const client = mockClient({ getAgents: { data: [agent] } });
      expect(await manager.list(client)).toEqual([agent]);
    });

    it("returns an empty list when there is no data", async () => {
      const client = mockClient({ getAgents: {} });
      expect(await manager.list(client)).toEqual([]);
    });

    it("gets an agent", async () => {
      const client = mockClient({ getAgent: { data: agent } });
      expect(await manager.get(client, "agent-1")).toEqual(agent);
    });

    it("requires an agent ID", async () => {
      const client = mockClient({ getAgent: { data: agent } });
      await expect(manager.get(client, "")).rejects.toThrow("An agent ID must be provided.");
    });
  });

  describe("create", () => {
    it("returns the agent and its one-time token", async () => {
      const client = mockClient({ createAgent: { data: agent, token: "1|plain" } });
      const result = await manager.create(client, { name: "Claude", type: AgentType.ClaudeCode });

      expect(result).toEqual({ agent, token: "1|plain" });
      expect(mocked(client, "createAgent")).toHaveBeenCalledWith("Claude", "claude-code", undefined);
    });

    it("throws when no token is returned", async () => {
      const client = mockClient({ createAgent: { data: agent } });
      await expect(manager.create(client, { name: "Claude", type: AgentType.Custom }))
        .rejects.toThrow("no API token was returned");
    });

    it("requires a name", async () => {
      const client = mockClient({});
      await expect(manager.create(client, { name: "", type: AgentType.Custom })).rejects.toThrow("Agent name is required.");
    });
  });

  describe("update / delete", () => {
    it("returns a new token when the update issues one", async () => {
      const client = mockClient({ updateAgent: { data: agent, token: "2|fresh" } });
      expect(await manager.update(client, "agent-1", { name: "New" })).toEqual({ agent, token: "2|fresh" });
    });

    it("returns a null token for a plain update", async () => {
      const client = mockClient({ updateAgent: { data: agent } });
      expect((await manager.update(client, "agent-1", { name: "New" })).token).toBeNull();
    });

    it("deletes an agent", async () => {
      const client = mockClient({ deleteAgent: { message: "Agent deleted successfully." } });
      await manager.delete(client, "agent-1");
      expect(mocked(client, "deleteAgent")).toHaveBeenCalledWith("agent-1");
    });
  });

  describe("environments and DEKs", () => {
    it("syncs environments", async () => {
      const client = mockClient({ syncAgentEnvironments: { data: agent } });
      await manager.syncEnvironments(client, "agent-1", ["env-1"]);
      expect(mocked(client, "syncAgentEnvironments")).toHaveBeenCalledWith("agent-1", ["env-1"]);
    });

    it("provisions a DEK as base64", async () => {
      const dek = CryptoHelper.generateKey();
      const client = mockClient({ provisionAgentDek: { data: { environment_id: "env-1", dek_provisioned: true } } });

      const result = await manager.provisionDek(client, "agent-1", "env-1", dek);

      expect(result).toEqual({ environmentId: "env-1", dekProvisioned: true });
      expect(mocked(client, "provisionAgentDek")).toHaveBeenCalledWith("agent-1", "env-1", dek.toString("base64"));
    });

    it("rejects a DEK that is not 32 bytes", async () => {
      const client = mockClient({});
      await expect(manager.provisionDek(client, "agent-1", "env-1", Buffer.alloc(16)))
        .rejects.toThrow("must be 32 bytes");
    });

    it("unwraps this device's envelope and provisions the key", async () => {
      const dek = CryptoHelper.generateKey();
      const client = mockClient({
        getEnvironments: { data: [{ id: "env-uuid", name: "Production", slug: "production", type: "production" }] },
        getEnvironmentEnvelope: { data: { envelope: CryptoHelper.createEnvelope(dek, keyPair.publicKey) } },
        provisionAgentDek: { data: { environment_id: "env-uuid", dek_provisioned: true } },
      });

      const result = await manager.provisionEnvironmentKey(client, "agent-1", "app-1", "production");

      expect(result.dekProvisioned).toBe(true);
      expect(mocked(client, "getEnvironmentEnvelope")).toHaveBeenCalledWith("app-1", "production", 42);
      expect(mocked(client, "provisionAgentDek")).toHaveBeenCalledWith("agent-1", "env-uuid", dek.toString("base64"));
    });

    it("fails when the environment slug is unknown", async () => {
      const client = mockClient({ getEnvironments: { data: [] } });
      await expect(manager.provisionEnvironmentKey(client, "agent-1", "app-1", "production"))
        .rejects.toThrow("Environment \"production\" was not found");
    });

    it("fails when this device has no envelope", async () => {
      const client = mockClient({
        getEnvironments: { data: [{ id: "env-uuid", slug: "production" }] },
        getEnvironmentEnvelope: { data: null },
      });
      await expect(manager.provisionEnvironmentKey(client, "agent-1", "app-1", "production"))
        .rejects.toThrow("No envelope found for this device.");
    });
  });

  describe("test", () => {
    it("returns diagnostics", async () => {
      const data = { status: "pass", checks: [{ name: "agent_active", passed: true, message: "The agent is active." }] };
      const client = mockClient({ testAgent: { data } });
      expect(await manager.test(client, "agent-1")).toEqual(data);
    });
  });

  describe("secret resolution", () => {
    it("lists resolvable secrets", async () => {
      const data = [{ environment: { id: "e", name: "Prod", slug: "prod" }, dek_provisioned: true, variables: [{ name: "A" }] }];
      const client = mockClient({ getAgentSecrets: { data } });
      expect(await manager.listSecrets(client, "agent-1")).toEqual(data);
    });

    it("resolves a single secret", async () => {
      const client = mockClient({ getAgentSecret: { data: { DB_PASSWORD: "hunter2" } } });
      expect(await manager.getSecret(client, "agent-1", "DB_PASSWORD", "production")).toBe("hunter2");
      expect(mocked(client, "getAgentSecret")).toHaveBeenCalledWith("agent-1", "DB_PASSWORD", "production");
    });

    it("throws when the secret is missing from the response", async () => {
      const client = mockClient({ getAgentSecret: { data: {} } });
      await expect(manager.getSecret(client, "agent-1", "DB_PASSWORD")).rejects.toThrow("The secret \"DB_PASSWORD\" was not returned.");
    });

    it("does not treat inherited properties as returned secrets", async () => {
      const client = mockClient({ getAgentSecret: { data: {} } });
      await expect(manager.getSecret(client, "agent-1", "toString")).rejects.toThrow("The secret \"toString\" was not returned.");
    });

    it("resolves a batch", async () => {
      const client = mockClient({ resolveAgentSecrets: { data: { A: "1", B: null } } });
      expect(await manager.resolve(client, "agent-1", ["A", "B"])).toEqual({ A: "1", B: null });
    });

    it("requires at least one name", async () => {
      const client = mockClient({});
      await expect(manager.resolve(client, "agent-1", [])).rejects.toThrow("At least one secret name must be provided.");
    });
  });
});
