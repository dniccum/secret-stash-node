import * as fs from "fs";
import * as os from "os";
import { SecretStashClient } from "../client/SecretStashClient";
import { KeyManager } from "./KeyManager";
import { CryptoHelper } from "../crypto/CryptoHelper";
import { DeviceKeyData, EnvelopePayload } from "../types";

export interface RewrapOptions {
  applicationId: string;
  environmentSlug: string;
  oldPrivateKeyPath?: string;
  oldPrivateKey?: string;
  oldDeviceKeyId: number;
}

export interface ResetResult {
  envelopeCount: number;
}

export class EnvelopeManager {
  private readonly keyManager: KeyManager;

  constructor(keyManager?: KeyManager) {
    this.keyManager = keyManager ?? new KeyManager();
  }

  async rewrap(client: SecretStashClient, options: RewrapOptions): Promise<void> {
    const response = await client.getEnvironmentEnvelope(
      options.applicationId,
      options.environmentSlug,
      options.oldDeviceKeyId
    );

    const data = response["data"] as Record<string, unknown> | undefined;
    const envelope = data?.["envelope"] as EnvelopePayload | undefined;

    if (!envelope) {
      throw new Error("No envelope found for the old device key.");
    }

    const oldPrivateKey = this.resolveOldPrivateKey(options);
    const dek = CryptoHelper.openEnvelope(envelope, oldPrivateKey);

    const currentDeviceKeyId = this.keyManager.getDeviceKeyId();
    const publicKey = this.keyManager.getDevicePublicKey();

    const newEnvelope = CryptoHelper.createEnvelope(dek, publicKey);
    await client.storeEnvironmentEnvelope(
      options.applicationId,
      options.environmentSlug,
      currentDeviceKeyId,
      newEnvelope
    );
  }

  async repair(client: SecretStashClient, options: RewrapOptions): Promise<void> {
    try {
      await this.rewrap(client, options);
    } catch {
      await this.reset(client, options.applicationId, options.environmentSlug);
    }
  }

  async reset(client: SecretStashClient, applicationId: string, environmentSlug: string): Promise<ResetResult> {
    const userKeysResponse = await client.getUserKeys();
    const deviceKeys = (userKeysResponse["data"] as DeviceKeyData[]) ?? [];

    if (deviceKeys.length === 0) {
      throw new Error("No device keys found. Run key init first.");
    }

    const dek = CryptoHelper.generateKey();
    const envelopes = deviceKeys.map(deviceKey => ({
      device_key_id: deviceKey.id,
      envelope: CryptoHelper.createEnvelope(dek, deviceKey.public_key),
    }));

    await client.storeBulkEnvironmentEnvelopes(applicationId, environmentSlug, envelopes);

    return {
      envelopeCount: envelopes.length,
    };
  }

  private resolveOldPrivateKey(options: RewrapOptions): string {
    if (options.oldPrivateKey) {
      return options.oldPrivateKey;
    }

    if (options.oldPrivateKeyPath) {
      const expandedPath = this.expandHomePath(options.oldPrivateKeyPath);
      if (!fs.existsSync(expandedPath)) {
        throw new Error("Old private key file not found.");
      }
      return fs.readFileSync(expandedPath, "utf-8");
    }

    const defaultPath = this.defaultPrivateKeyPath();
    if (!fs.existsSync(defaultPath)) {
      throw new Error("Old private key file not found.");
    }
    return fs.readFileSync(defaultPath, "utf-8");
  }

  private defaultPrivateKeyPath(): string {
    return `${os.homedir()}/.secret-stash/device_private_key.pem`;
  }

  private expandHomePath(filePath: string): string {
    if (!filePath.startsWith("~")) {
      return filePath;
    }
    return os.homedir() + filePath.slice(1);
  }
}
