import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { CryptoHelper } from "../crypto/CryptoHelper";
import { SecretStashClient } from "../client/SecretStashClient";
import { ConfigResolver } from "../support/ConfigResolver";
import { DeviceMetadata, DeviceKeyData } from "../types";
import {
  DeviceKeyNotRegistered,
  MetaKeyFailedToSave,
  PrivateKeyFailedToSave,
  PrivateKeyNotFound,
} from "../errors";

export interface KeyInitOptions {
  label?: string;
  force?: boolean;
  temporary?: boolean;
  ttlMinutes?: number;
}

export interface KeyStatusResult {
  hasLocalPrivateKey: boolean;
  localMetadata: DeviceMetadata | null;
  serverKeyCount: number;
  isRegisteredOnServer: boolean;
}

export interface KeyInitResult {
  deviceKeyId: number;
  label: string;
  fingerprint: string;
  keyDirectory: string;
  isTemporary: boolean;
  expiresAt?: string | null;
}

export interface RecoveryKeyResult {
  share: string;
  sharePath: string;
  deviceKeyId: number;
}

export class KeyManager {
  private readonly keyPath: string;
  private readonly privateKeyFile: string;
  private readonly deviceMetaFile: string;

  constructor(keyDir?: string) {
    if (keyDir) {
      this.keyPath = keyDir;
    } else {
      const customDir = ConfigResolver.get("key_dir") as string | null;
      this.keyPath = (!ConfigResolver.isRunningTests() && customDir)
        ? customDir
        : this.defaultPrivateKeyDirectory();
    }

    this.privateKeyFile = path.join(this.keyPath, "device_private_key.pem");
    this.deviceMetaFile = path.join(this.keyPath, "device.json");

    if (!fs.existsSync(this.keyPath)) {
      fs.mkdirSync(this.keyPath, { recursive: true, mode: 0o700 });
    }
  }

  getKeyPath(): string {
    return this.keyPath;
  }

  private defaultPrivateKeyDirectory(): string {
    let homeDir = os.homedir();
    if (ConfigResolver.isRunningTests()) {
      homeDir = os.tmpdir();
    }
    return path.join(homeDir, ".secret-stash");
  }

  async status(client: SecretStashClient): Promise<KeyStatusResult> {
    const localPrivateKey = this.loadPrivateKey();
    const localMeta = this.loadDeviceMetadata();

    let serverKeyCount = 0;
    let isRegisteredOnServer = false;

    try {
      const response = await client.getUserKeys();
      const serverKeys = (response["data"] as DeviceKeyData[]) ?? [];
      serverKeyCount = serverKeys.length;

      if (localMeta?.fingerprint) {
        const match = serverKeys.find(k => k.fingerprint === localMeta.fingerprint);
        isRegisteredOnServer = !!match;
      }
    } catch {
      // Unable to check server keys
    }

    return {
      hasLocalPrivateKey: !!localPrivateKey,
      localMetadata: localMeta,
      serverKeyCount,
      isRegisteredOnServer,
    };
  }

  async init(client: SecretStashClient, options: KeyInitOptions = {}): Promise<KeyInitResult> {
    if (options.temporary) {
      return this.initializeTemporaryKey(client, options);
    }

    if (this.hasLocalPrivateKey() && !options.force) {
      throw new Error("Device keys already exist locally. Use force option to regenerate.");
    }

    const label = options.label ?? os.hostname() ?? "My Device";

    const keyPair = CryptoHelper.generateRSAKeyPair();

    this.savePrivateKey(keyPair.privateKey);

    const metadata: Record<string, unknown> = {
      label,
      hostname: os.hostname() || null,
      platform: process.platform,
    };

    const response = await client.storeDeviceKey(label, keyPair.publicKey, "device", metadata);
    const deviceKey = (response["data"] as DeviceKeyData) ?? null;

    if (!deviceKey?.id) {
      throw new PrivateKeyFailedToSave("Failed to register device key.");
    }

    this.saveDeviceMetadata({
      device_key_id: deviceKey.id,
      label: deviceKey.label ?? label,
      public_key: deviceKey.public_key ?? keyPair.publicKey,
      fingerprint: deviceKey.fingerprint ?? CryptoHelper.fingerprint(keyPair.publicKey),
    });

    return {
      deviceKeyId: deviceKey.id,
      label: deviceKey.label ?? label,
      fingerprint: deviceKey.fingerprint ?? CryptoHelper.fingerprint(keyPair.publicKey),
      keyDirectory: this.keyPath,
      isTemporary: false,
    };
  }

  async sync(client: SecretStashClient): Promise<DeviceMetadata> {
    const localMeta = this.loadDeviceMetadata();
    if (!localMeta) {
      throw new DeviceKeyNotRegistered("No local device record found. Run key init first.");
    }

    const fingerprint = localMeta.fingerprint;
    if (!fingerprint) {
      throw new DeviceKeyNotRegistered("Local device record missing fingerprint.");
    }

    const response = await client.getUserKeys();
    const serverKeys = (response["data"] as DeviceKeyData[]) ?? [];
    const match = serverKeys.find(k => k.fingerprint === fingerprint);

    if (!match) {
      throw new DeviceKeyNotRegistered("No matching device key found on the server. Run key init to register.");
    }

    const updatedMeta: DeviceMetadata = {
      device_key_id: match.id,
      label: match.label ?? localMeta.label ?? "Device",
      public_key: match.public_key ?? localMeta.public_key,
      fingerprint: match.fingerprint ?? fingerprint,
    };

    this.saveDeviceMetadata(updatedMeta);

    return updatedMeta;
  }

  async generateRecoveryKey(client: SecretStashClient, options: { copies?: number; outputDir?: string; force?: boolean } = {}): Promise<RecoveryKeyResult> {
    const response = await client.getUserKeys();
    const serverKeys = (response["data"] as DeviceKeyData[]) ?? [];
    const existingRecovery = serverKeys.find(k => k.key_type === "recovery");

    if (existingRecovery && !options.force) {
      throw new Error("A recovery key already exists. Use force option to replace.");
    }

    const keyPair = CryptoHelper.generateRSAKeyPair();
    const fingerprint = CryptoHelper.fingerprint(keyPair.publicKey);
    const share = CryptoHelper.encodeRecoveryShare(keyPair.privateKey, fingerprint);

    const storeResponse = await client.storeDeviceKey("Recovery Key", keyPair.publicKey, "recovery");
    const deviceKey = (storeResponse["data"] as DeviceKeyData) ?? null;

    if (!deviceKey?.id) {
      throw new PrivateKeyFailedToSave("Failed to register recovery key.");
    }

    const outputDir = options.outputDir ?? this.keyPath;
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
    }

    const sharePath = path.join(outputDir, `secret-stash-recovery-${fingerprint}.txt`);
    fs.writeFileSync(sharePath, share, { mode: 0o600 });

    return {
      share,
      sharePath,
      deviceKeyId: deviceKey.id,
    };
  }

  getPrivateKey(): string {
    const privateKey = this.loadPrivateKey();
    if (!privateKey) {
      throw new PrivateKeyNotFound();
    }
    return privateKey;
  }

  getDeviceKeyId(): number {
    const metadata = this.loadDeviceMetadata();
    if (!metadata?.device_key_id) {
      throw new DeviceKeyNotRegistered();
    }
    return metadata.device_key_id;
  }

  getDevicePublicKey(): string {
    const metadata = this.loadDeviceMetadata();
    if (!metadata?.public_key) {
      throw new DeviceKeyNotRegistered("Device public key not found. Run key init first.");
    }
    return metadata.public_key;
  }

  hasLocalPrivateKey(): boolean {
    return fs.existsSync(this.privateKeyFile);
  }

  loadPrivateKey(): string | null {
    if (!fs.existsSync(this.privateKeyFile)) {
      return null;
    }
    try {
      return fs.readFileSync(this.privateKeyFile, "utf-8");
    } catch {
      return null;
    }
  }

  savePrivateKey(privateKey: string): void {
    try {
      fs.writeFileSync(this.privateKeyFile, privateKey, { mode: 0o600 });
    } catch {
      throw new PrivateKeyFailedToSave();
    }
  }

  loadDeviceMetadata(): DeviceMetadata | null {
    if (!fs.existsSync(this.deviceMetaFile)) {
      return null;
    }
    try {
      const content = fs.readFileSync(this.deviceMetaFile, "utf-8");
      const meta = JSON.parse(content);
      return typeof meta === "object" && meta !== null ? meta as DeviceMetadata : null;
    } catch {
      return null;
    }
  }

  saveDeviceMetadata(metadata: DeviceMetadata): void {
    try {
      const content = JSON.stringify(metadata, null, 2);
      fs.writeFileSync(this.deviceMetaFile, content, { mode: 0o600 });
    } catch {
      throw new MetaKeyFailedToSave();
    }
  }

  private async initializeTemporaryKey(client: SecretStashClient, options: KeyInitOptions): Promise<KeyInitResult> {
    const ttl = options.ttlMinutes ?? 15;
    if (ttl < 5 || ttl > 60) {
      throw new Error("TTL must be between 5 and 60 minutes.");
    }

    const label = options.label ?? `CI/CD Temporary Key (${os.hostname() || "Unknown Host"})`;

    const keyPair = CryptoHelper.generateRSAKeyPair();

    const tempDir = this.createTempKeyDirectory();
    const tempPrivateKeyFile = path.join(tempDir, "device_private_key.pem");
    const tempDeviceMetaFile = path.join(tempDir, "device.json");

    try {
      fs.writeFileSync(tempPrivateKeyFile, keyPair.privateKey, { mode: 0o600 });
    } catch {
      throw new PrivateKeyFailedToSave("Failed to save temporary private key file.");
    }

    const metadata: Record<string, unknown> = {
      label,
      hostname: os.hostname() || null,
      platform: process.platform,
      temporary: true,
      ttl_minutes: ttl,
    };

    try {
      const response = await client.storeDeviceKey(label, keyPair.publicKey, "device", metadata, true, ttl);
      const deviceKey = (response["data"] as DeviceKeyData) ?? null;

      if (!deviceKey?.id) {
        throw new Error("Failed to register temporary device key.");
      }

      const deviceMeta: DeviceMetadata = {
        device_key_id: deviceKey.id,
        label: deviceKey.label ?? label,
        public_key: deviceKey.public_key ?? keyPair.publicKey,
        fingerprint: deviceKey.fingerprint ?? CryptoHelper.fingerprint(keyPair.publicKey),
        is_temporary: true,
        expires_at: deviceKey.expires_at ?? null,
      };

      fs.writeFileSync(tempDeviceMetaFile, JSON.stringify(deviceMeta, null, 2), { mode: 0o600 });

      return {
        deviceKeyId: deviceKey.id,
        label: deviceKey.label ?? label,
        fingerprint: deviceKey.fingerprint ?? CryptoHelper.fingerprint(keyPair.publicKey),
        keyDirectory: tempDir,
        isTemporary: true,
        expiresAt: deviceKey.expires_at ?? null,
      };
    } catch (e) {
      try {
        fs.unlinkSync(tempDeviceMetaFile);
      } catch { /* ignore */ }
      try {
        fs.unlinkSync(tempPrivateKeyFile);
      } catch { /* ignore */ }
      try {
        fs.rmdirSync(tempDir);
      } catch { /* ignore */ }
      throw e;
    }
  }

  private createTempKeyDirectory(): string {
    const tempDir = path.join(os.tmpdir(), `secret-stash-tmp-${crypto.randomBytes(8).toString("hex")}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true, mode: 0o700 });
    }
    return tempDir;
  }
}
