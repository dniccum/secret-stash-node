import { SecretStashClient } from "../client/SecretStashClient";
import { CryptoHelper } from "../crypto/CryptoHelper";
import { KeyManager } from "./KeyManager";
import {
  AgentData,
  AgentSecretsEnvironment,
  AgentTestResult,
  AgentType,
  AgentUpdateAttributes,
  EnvelopePayload,
  EnvironmentData,
} from "../types";

export interface CreateAgentOptions {
  name: string;
  type: AgentType;
  description?: string | null;
}

export interface CreateAgentResult {
  agent: AgentData;
  /** The agent's API token. Returned exactly once; store it securely. */
  token: string;
}

export interface UpdateAgentResult {
  agent: AgentData;
  /** A freshly issued token when the update reactivated a revoked agent. */
  token: string | null;
}

export interface ProvisionDekResult {
  environmentId: string;
  dekProvisioned: boolean;
}

/**
 * Agent Vault operations.
 *
 * Management methods (list, create, update, syncEnvironments, provisionDek,
 * test, ...) need a client authenticated with a user API token. Resolution
 * methods (listSecrets, getSecret, resolve) need a client authenticated with
 * the agent's own token, as returned by `create`.
 */
export class AgentsManager {
  private static readonly DEK_LENGTH = 32;

  private readonly keyManager: KeyManager;

  constructor(keyManager?: KeyManager) {
    this.keyManager = keyManager ?? new KeyManager();
  }

  async list(client: SecretStashClient): Promise<AgentData[]> {
    const response = await client.getAgents();
    return (response["data"] as AgentData[]) ?? [];
  }

  async get(client: SecretStashClient, agentId: string): Promise<AgentData> {
    this.assertAgentId(agentId);
    return this.unwrapAgent(await client.getAgent(agentId));
  }

  async create(client: SecretStashClient, options: CreateAgentOptions): Promise<CreateAgentResult> {
    if (!options.name) {
      throw new Error("Agent name is required.");
    }

    if (!options.type) {
      throw new Error("Agent type is required.");
    }

    const response = await client.createAgent(options.name, options.type, options.description);
    const token = response["token"];

    if (typeof token !== "string" || token === "") {
      throw new Error("Failed to create agent: no API token was returned.");
    }

    return {
      agent: this.unwrapAgent(response),
      token,
    };
  }

  async update(client: SecretStashClient, agentId: string, attributes: AgentUpdateAttributes): Promise<UpdateAgentResult> {
    this.assertAgentId(agentId);

    const response = await client.updateAgent(agentId, attributes);
    const token = response["token"];

    return {
      agent: this.unwrapAgent(response),
      token: typeof token === "string" ? token : null,
    };
  }

  async delete(client: SecretStashClient, agentId: string): Promise<void> {
    this.assertAgentId(agentId);
    await client.deleteAgent(agentId);
  }

  /**
   * Replace the set of environments the agent may resolve secrets from.
   */
  async syncEnvironments(client: SecretStashClient, agentId: string, environmentIds: string[]): Promise<AgentData> {
    this.assertAgentId(agentId);
    return this.unwrapAgent(await client.syncAgentEnvironments(agentId, environmentIds));
  }

  /**
   * Provision a raw 32-byte environment key (DEK) for an authorized environment.
   */
  async provisionDek(client: SecretStashClient, agentId: string, environmentId: string, dek: Buffer): Promise<ProvisionDekResult> {
    this.assertAgentId(agentId);

    if (!environmentId) {
      throw new Error("An environment ID must be provided.");
    }

    if (dek.length !== AgentsManager.DEK_LENGTH) {
      throw new Error(`The environment key must be ${AgentsManager.DEK_LENGTH} bytes.`);
    }

    const response = await client.provisionAgentDek(agentId, environmentId, dek.toString("base64"));
    const data = (response["data"] as Record<string, unknown> | undefined) ?? {};

    return {
      environmentId: (data["environment_id"] as string) ?? environmentId,
      dekProvisioned: data["dek_provisioned"] === true,
    };
  }

  /**
   * Unwrap this device's envelope for an environment and provision the
   * resulting key for the agent. The environment must already be authorized
   * for the agent via `syncEnvironments`.
   */
  async provisionEnvironmentKey(
    client: SecretStashClient,
    agentId: string,
    applicationId: string,
    environmentSlug: string
  ): Promise<ProvisionDekResult> {
    const environments = (await client.getEnvironments(applicationId))["data"] as EnvironmentData[] | undefined;
    const environment = environments?.find(env => env.slug === environmentSlug);

    if (!environment) {
      throw new Error(`Environment "${environmentSlug}" was not found for this application.`);
    }

    const deviceKeyId = this.keyManager.getDeviceKeyId();
    const response = await client.getEnvironmentEnvelope(applicationId, environmentSlug, deviceKeyId);
    const envelope = (response["data"] as Record<string, unknown> | undefined)?.["envelope"] as EnvelopePayload | undefined;

    if (!envelope) {
      throw new Error("No envelope found for this device. Ask another team member to grant access, or run envelope repair.");
    }

    let dek: Buffer;
    try {
      dek = CryptoHelper.openEnvelope(envelope, this.keyManager.getPrivateKey());
    } catch {
      throw new Error("Unable to decrypt environment key. Verify your device key or run envelope repair if needed.");
    }

    return this.provisionDek(client, agentId, String(environment.id), dek);
  }

  async test(client: SecretStashClient, agentId: string): Promise<AgentTestResult> {
    this.assertAgentId(agentId);

    const response = await client.testAgent(agentId);
    const data = response["data"] as AgentTestResult | undefined;

    if (!data) {
      throw new Error("Failed to test agent.");
    }

    return data;
  }

  /**
   * List the variable names the agent may resolve, grouped by environment.
   * Requires a client authenticated with the agent's token.
   */
  async listSecrets(agentClient: SecretStashClient, agentId: string): Promise<AgentSecretsEnvironment[]> {
    this.assertAgentId(agentId);

    const response = await agentClient.getAgentSecrets(agentId);
    return (response["data"] as AgentSecretsEnvironment[]) ?? [];
  }

  /**
   * Resolve a single secret's plaintext value. Requires a client authenticated
   * with the agent's token.
   */
  async getSecret(agentClient: SecretStashClient, agentId: string, name: string, environment?: string): Promise<string> {
    this.assertAgentId(agentId);

    if (!name) {
      throw new Error("A secret name must be provided.");
    }

    const response = await agentClient.getAgentSecret(agentId, name, environment);
    const data = (response["data"] as Record<string, string> | undefined) ?? {};

    if (!(name in data)) {
      throw new Error(`The secret "${name}" was not returned.`);
    }

    return data[name];
  }

  /**
   * Resolve several secrets at once. The server rejects the whole batch when
   * any name is outside the agent's authorized environments. Requires a client
   * authenticated with the agent's token.
   */
  async resolve(agentClient: SecretStashClient, agentId: string, names: string[], environment?: string): Promise<Record<string, string | null>> {
    this.assertAgentId(agentId);

    if (names.length === 0) {
      throw new Error("At least one secret name must be provided.");
    }

    const response = await agentClient.resolveAgentSecrets(agentId, names, environment);
    return (response["data"] as Record<string, string | null>) ?? {};
  }

  private assertAgentId(agentId: string): void {
    if (!agentId) {
      throw new Error("An agent ID must be provided.");
    }
  }

  private unwrapAgent(response: Record<string, unknown>): AgentData {
    const agent = response["data"] as AgentData | undefined;

    if (!agent) {
      throw new Error("The API did not return an agent.");
    }

    return agent;
  }
}
