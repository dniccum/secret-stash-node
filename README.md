![SecretStash](og-image.png)

# SecretStash Node Package

A Node.js/TypeScript package for interacting with the [SecretStash](https://secretstash.cloud) REST API. This package is modeled after the [SecretStash CLI](https://github.com/dniccum/secret-stash-cli) project and allows you to manage your environment variables programmatically with full zero-knowledge encryption support.

## Requirements

- Node.js 18 or higher
- A SecretStash API Key

## Installation

Install the package via npm:

```bash
npm install @dniccum/secret-stash-node --save
```

> **Important**: This package creates a `~/.secret-stash` directory on your machine (or the path specified by the `SECRET_STASH_KEY_DIR` environment variable). Ensure this folder is secure as it contains sensitive keys.

## Configuration

Add the following environment variables to your application's `.env` file:

```dotenv
SECRET_STASH_API_TOKEN=your_api_token_here
SECRET_STASH_APPLICATION_ID=your_application_id_here
```

- **API Key**: Create a token in SecretStash in the "Tokens" tab of your profile settings.
- **Application ID**: Create or access an application in SecretStash and retrieve its ID from the dashboard.

## Usage

### Key Management

```typescript
import { SecretStashClient, KeyManager } from "@dniccum/secret-stash-node";

const client = new SecretStashClient();
const keyManager = new KeyManager();

// Initialize device keys
const result = await keyManager.init(client, { label: "My Device" });

// Check device key status
const status = await keyManager.status(client);

// Sync device registration from server
await keyManager.sync(client);

// Generate a recovery key
const recovery = await keyManager.generateRecoveryKey(client, { outputDir: "./recovery" });

// Initialize temporary key for CI/CD
const tempResult = await keyManager.init(client, {
  temporary: true,
  ttlMinutes: 15,
  label: "CI Runner",
});
```

### Variables Management

```typescript
import { SecretStashClient, VariablesManager } from "@dniccum/secret-stash-node";

const client = new SecretStashClient();
const variablesManager = new VariablesManager();

// List variables (masked)
const listResult = await variablesManager.list(client, "app-id", "production");

// Pull variables into local .env file
const pullResult = await variablesManager.pull(client, "app-id", "production", ".env");

// Push local .env variables to SecretStash
const pushResult = await variablesManager.push(client, "app-id", "production", ".env");
```

### Environment Management

```typescript
import { SecretStashClient, EnvironmentsManager } from "@dniccum/secret-stash-node";

const client = new SecretStashClient();
const environmentsManager = new EnvironmentsManager();

// List environments
const envs = await environmentsManager.list(client, "app-id");

// Create a new environment
const newEnv = await environmentsManager.create(client, "app-id", "Staging", "staging", "development");
```

### Envelope Management

```typescript
import { SecretStashClient, EnvelopeManager } from "@dniccum/secret-stash-node";

const client = new SecretStashClient();
const envelopeManager = new EnvelopeManager();

// Rewrap an envelope from old key to current device key
await envelopeManager.rewrap(client, {
  applicationId: "app-id",
  environmentSlug: "production",
  oldPrivateKeyPath: "~/.secret-stash/old_device_private_key.pem",
  oldDeviceKeyId: 123,
});

// Reset environment key (creates new DEK for all device keys)
await envelopeManager.reset(client, "app-id", "production");

// Repair: attempt rewrap, fall back to reset
await envelopeManager.repair(client, {
  applicationId: "app-id",
  environmentSlug: "production",
  oldPrivateKey: "-----BEGIN PRIVATE KEY-----...",
  oldDeviceKeyId: 123,
});
```

### Cryptographic Utilities

```typescript
import { CryptoHelper } from "@dniccum/secret-stash-node";

// Generate RSA-4096 key pair
const keyPair = CryptoHelper.generateRSAKeyPair();

// Generate AES-256 data encryption key
const dek = CryptoHelper.generateKey();

// Encrypt/decrypt with AES-GCM
const payload = CryptoHelper.aesGcmEncrypt("my-secret", dek);
const decrypted = CryptoHelper.aesGcmDecrypt(payload, dek);

// Create/open envelopes
const envelope = CryptoHelper.createEnvelope(dek, keyPair.publicKey);
const recoveredDek = CryptoHelper.openEnvelope(envelope, keyPair.privateKey);

// Fingerprint a public key
const fingerprint = CryptoHelper.fingerprint(keyPair.publicKey);
```

## Testing

Run the tests with:

```bash
npm test
```

## Contributing

Please see [CONTRIBUTING](CONTRIBUTING.md) for details.

## Credits

- [Doug Niccum](https://github.com/dniccum)
- [All Contributors](../../contributors)

## License

The MIT License (MIT). Please see [License File](LICENSE.md) for more information.
