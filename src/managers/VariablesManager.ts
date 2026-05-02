import * as fs from "fs";
import { SecretStashClient } from "../client/SecretStashClient";
import { KeyManager } from "./KeyManager";
import { CryptoHelper } from "../crypto/CryptoHelper";
import { VariableUtility } from "../support/VariableUtility";
import { ConfigResolver } from "../support/ConfigResolver";
import { ApplicationEnvironmentVariable, AesGcmPayload, EnvironmentData, DeviceKeyData, EnvelopePayload } from "../types";
import { NoEnvironmentsFound } from "../errors";

export interface ListVariablesResult {
  variables: Array<{
    id: string;
    name: string;
    maskedValue: string;
    created_at: string | null;
  }>;
  total: number;
}

export interface PullVariablesResult {
  filePath: string;
  variableCount: number;
}

export interface PushVariablesResult {
  created: number;
  failed: number;
}

export class VariablesManager {
  private readonly keyManager: KeyManager;
  private readonly variableUtility: VariableUtility;

  constructor(keyManager?: KeyManager) {
    this.keyManager = keyManager ?? new KeyManager();
    this.variableUtility = new VariableUtility(ConfigResolver.ignoredVariables());
  }

  async list(client: SecretStashClient, applicationId: string, environmentSlug: string): Promise<ListVariablesResult> {
    await this.fetchAndValidateEnvironments(client, applicationId, environmentSlug);

    const key = await this.getEnvironmentKey(applicationId, environmentSlug, client, false);
    const variables = await this.getVariablesForEnvironment(client, applicationId, environmentSlug);

    const rows = variables.map((variable) => {
      let decryptedValue = "[Error decrypting]";
      try {
        if (variable.payload === null) {
          decryptedValue = "[No value]";
        } else {
          decryptedValue = CryptoHelper.aesGcmDecrypt(variable.payload, key);
        }
      } catch {
        // Keep the error message
      }

      return {
        id: variable.id,
        name: variable.name,
        maskedValue: "•".repeat(Math.min(decryptedValue.length, 20)),
        created_at: variable.created_at,
      };
    });

    return {
      variables: rows,
      total: variables.length,
    };
  }

  async pull(client: SecretStashClient, applicationId: string, environmentSlug: string, filePath = ".env"): Promise<PullVariablesResult> {
    await this.fetchAndValidateEnvironments(client, applicationId, environmentSlug);

    const key = await this.getEnvironmentKey(applicationId, environmentSlug, client, false);
    const variables = await this.getVariablesForEnvironment(client, applicationId, environmentSlug);

    const decryptedVariables: Record<string, string> = {};
    const ignored = ConfigResolver.ignoredVariables();

    for (const variable of variables) {
      try {
        const name = variable.name;
        if (VariableUtility.isIgnoredVariable(name, ignored)) {
          continue;
        }

        const payload = variable.payload;
        if (payload === null) {
          decryptedVariables[name] = "";
          continue;
        }

        const decryptedValue = CryptoHelper.aesGcmDecrypt(payload, key);
        decryptedVariables[name] = decryptedValue;
      } catch {
        // Failed to decrypt variable, skip it
      }
    }

    const existingContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
    const mergedContent = VariableUtility.mergeEnvContent(existingContent, decryptedVariables);
    fs.writeFileSync(filePath, mergedContent);

    return {
      filePath,
      variableCount: Object.keys(decryptedVariables).length,
    };
  }

  async push(client: SecretStashClient, applicationId: string, environmentSlug: string, filePath = ".env"): Promise<PushVariablesResult> {
    const environments = await client.getEnvironments(applicationId);
    const envData = (environments["data"] as EnvironmentData[]) ?? [];

    for (const env of envData) {
      if (env.slug === environmentSlug && env.type === "testing") {
        throw new Error("This is a testing environment and may only be manipulated within the SecretStash application.");
      }
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    let variables = VariableUtility.parseEnvContent(content);
    variables = this.variableUtility.filter(variables);

    if (Object.keys(variables).length === 0) {
      throw new Error("No variables found in file.");
    }

    const environmentExists = this.environmentExists(envData, environmentSlug);

    if (!environmentExists) {
      const slug = environmentSlug;
      const name = slug.charAt(0).toUpperCase() + slug.slice(1);
      await client.createEnvironment(applicationId, name, slug, "local");
    }

    const key = await this.getEnvironmentKey(applicationId, environmentSlug, client, true);

    let created = 0;
    let failed = 0;

    for (const [name, value] of Object.entries(variables)) {
      try {
        const payload = CryptoHelper.aesGcmEncrypt(String(value), key);
        await client.createVariable(applicationId, environmentSlug, name, payload as unknown as Record<string, unknown>);
        created++;
      } catch {
        failed++;
      }
    }

    return { created, failed };
  }

  private async fetchAndValidateEnvironments(client: SecretStashClient, applicationId: string, environmentSlug: string): Promise<EnvironmentData[]> {
    const response = await client.getEnvironments(applicationId);
    const envData = (response["data"] as EnvironmentData[]) ?? [];

    if (envData.length === 0) {
      throw new NoEnvironmentsFound(`No environments found for application ID ${applicationId}.`);
    }

    if (!this.environmentExists(envData, environmentSlug)) {
      const slugList = envData.map(env => `${env.name} (${env.slug})`);
      throw new NoEnvironmentsFound(
        `The "${environmentSlug}" environment does not exist for this application. Available environments: ${slugList.join(", ")}`
      );
    }

    return envData;
  }

  private environmentExists(envData: EnvironmentData[], environmentSlug: string): boolean {
    if (envData.length === 0) {
      return false;
    }
    return envData.some(env => env.slug === environmentSlug);
  }

  private async getVariablesForEnvironment(client: SecretStashClient, applicationId: string, environmentSlug: string): Promise<ApplicationEnvironmentVariable[]> {
    const response = await client.getVariables(applicationId, environmentSlug);
    const variables = (response["data"] as Array<Record<string, unknown>>) ?? [];

    if (variables.length === 0) {
      return [];
    }

    return variables.map(v => ({
      id: v["id"] as string,
      name: v["name"] as string,
      payload: (v["payload"] as AesGcmPayload) ?? null,
      created_at: (v["created_at"] as string) ?? null,
    }));
  }

  private async getEnvironmentKey(applicationId: string, environmentSlug: string, client: SecretStashClient, createIfMissing: boolean): Promise<Buffer> {
    const deviceKeyId = this.keyManager.getDeviceKeyId();

    const response = await client.getEnvironmentEnvelope(applicationId, environmentSlug, deviceKeyId);
    const data = response["data"] as Record<string, unknown> | undefined;
    const envelope = data?.["envelope"] as EnvelopePayload | undefined;

    if (envelope) {
      const privateKey = this.keyManager.getPrivateKey();
      try {
        return CryptoHelper.openEnvelope(envelope, privateKey);
      } catch {
        throw new Error("Unable to decrypt environment key. Verify your device key or run envelope repair if needed.");
      }
    }

    if (!createIfMissing) {
      throw new Error("No envelope found for this device. Ask another team member to grant access, or run envelope repair.");
    }

    const dek = CryptoHelper.generateKey();

    const userKeysResponse = await client.getUserKeys();
    const deviceKeys = (userKeysResponse["data"] as DeviceKeyData[]) ?? [];

    if (deviceKeys.length === 0) {
      throw new Error("No device keys found. Run key init first.");
    }

    const envelopes = deviceKeys.map(deviceKey => ({
      device_key_id: deviceKey.id,
      envelope: CryptoHelper.createEnvelope(dek, deviceKey.public_key),
    }));

    await client.storeBulkEnvironmentEnvelopes(applicationId, environmentSlug, envelopes);

    return dek;
  }
}
