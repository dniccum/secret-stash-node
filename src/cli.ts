#!/usr/bin/env node

import { Command, InvalidArgumentError } from "commander";
import { SecretStashClient } from "./client/SecretStashClient";
import { ConfigResolver } from "./support/ConfigResolver";
import { KeyManager } from "./managers/KeyManager";
import { VariablesManager } from "./managers/VariablesManager";
import { EnvironmentsManager } from "./managers/EnvironmentsManager";
import { EnvelopeManager } from "./managers/EnvelopeManager";
import { ApplicationsManager } from "./managers/ApplicationsManager";

const program = new Command();

program
  .name("secret-stash")
  .description("CLI for interacting with the SecretStash REST API")
  .version("0.1.0")
  .option("-a, --application <id>", "Application ID (overrides SECRET_STASH_APPLICATION_ID)");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createClient(): SecretStashClient {
  return new SecretStashClient();
}

function resolveApplicationId(cmd: Command): string {
  const root = cmd.optsWithGlobals();
  const id = root.application ?? (ConfigResolver.get("application_id") as string | null);
  if (!id) {
    console.error("Error: No application ID provided. Use --application <id> or set SECRET_STASH_APPLICATION_ID.");
    process.exit(1);
  }
  return id;
}

function handleError(error: unknown): never {
  const message = error instanceof Error ? error.message : "An unexpected error occurred.";
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseIntStrict(value: string): number {
  const n = parseInt(value, 10);
  if (isNaN(n)) {
    throw new InvalidArgumentError(`Expected a number, got: ${value}`);
  }
  return n;
}

// ---------------------------------------------------------------------------
// key
// ---------------------------------------------------------------------------

const key = program.command("key").description("Manage device keys");

key
  .command("init")
  .description("Initialize device keys")
  .option("-l, --label <label>", "Label for the device key")
  .option("-f, --force", "Force regeneration of existing keys")
  .option("-t, --temporary", "Create a temporary key for CI/CD")
  .option("--ttl <minutes>", "TTL in minutes for temporary keys", parseIntStrict)
  .action(async (opts) => {
    try {
      const client = createClient();
      const keyManager = new KeyManager();
      const result = await keyManager.init(client, {
        label: opts.label,
        force: opts.force,
        temporary: opts.temporary,
        ttlMinutes: opts.ttl,
      });

      console.log("Device key initialized successfully.");
      console.log(`  Key ID:      ${result.deviceKeyId}`);
      console.log(`  Label:       ${result.label}`);
      console.log(`  Fingerprint: ${result.fingerprint}`);
      console.log(`  Directory:   ${result.keyDirectory}`);
      if (result.isTemporary) {
        console.log(`  Temporary:   yes (expires ${result.expiresAt ?? "unknown"})`);
      }
    } catch (e) {
      handleError(e);
    }
  });

key
  .command("status")
  .description("Check device key status")
  .action(async () => {
    try {
      const client = createClient();
      const keyManager = new KeyManager();
      const status = await keyManager.status(client);

      console.log("Device key status:");
      console.log(`  Local private key: ${status.hasLocalPrivateKey ? "found" : "not found"}`);
      console.log(`  Server keys:       ${status.serverKeyCount}`);
      console.log(`  Registered:        ${status.isRegisteredOnServer ? "yes" : "no"}`);
      if (status.localMetadata) {
        console.log(`  Key ID:            ${status.localMetadata.device_key_id}`);
        console.log(`  Label:             ${status.localMetadata.label}`);
        console.log(`  Fingerprint:       ${status.localMetadata.fingerprint}`);
      }
    } catch (e) {
      handleError(e);
    }
  });

key
  .command("sync")
  .description("Sync device registration from server")
  .action(async () => {
    try {
      const client = createClient();
      const keyManager = new KeyManager();
      const meta = await keyManager.sync(client);

      console.log("Device key synced successfully.");
      console.log(`  Key ID:      ${meta.device_key_id}`);
      console.log(`  Label:       ${meta.label}`);
      console.log(`  Fingerprint: ${meta.fingerprint}`);
    } catch (e) {
      handleError(e);
    }
  });

key
  .command("recovery")
  .description("Generate a recovery key")
  .option("-o, --output-dir <dir>", "Output directory for the recovery share")
  .option("-f, --force", "Replace existing recovery key")
  .action(async (opts) => {
    try {
      const client = createClient();
      const keyManager = new KeyManager();
      const result = await keyManager.generateRecoveryKey(client, {
        outputDir: opts.outputDir,
        force: opts.force,
      });

      console.log("Recovery key generated.");
      console.log(`  Key ID:     ${result.deviceKeyId}`);
      console.log(`  Share file: ${result.sharePath}`);
    } catch (e) {
      handleError(e);
    }
  });

// ---------------------------------------------------------------------------
// variables
// ---------------------------------------------------------------------------

const variables = program.command("variables").description("Manage environment variables");

variables
  .command("list")
  .description("List variables (masked)")
  .requiredOption("-e, --environment <slug>", "Environment slug")
  .action(async (opts, cmd) => {
    try {
      const client = createClient();
      const applicationId = resolveApplicationId(cmd);
      const manager = new VariablesManager();
      const result = await manager.list(client, applicationId, opts.environment);

      if (result.total === 0) {
        console.log("No variables found.");
        return;
      }

      console.log(`Variables (${result.total}):\n`);
      for (const v of result.variables) {
        console.log(`  ${v.name} = ${v.maskedValue}`);
      }
    } catch (e) {
      handleError(e);
    }
  });

variables
  .command("pull")
  .description("Pull variables into a local .env file")
  .requiredOption("-e, --environment <slug>", "Environment slug")
  .option("-f, --file <path>", "Path to .env file", ".env")
  .action(async (opts, cmd) => {
    try {
      const client = createClient();
      const applicationId = resolveApplicationId(cmd);
      const manager = new VariablesManager();
      const result = await manager.pull(client, applicationId, opts.environment, opts.file);

      console.log(`Pulled ${result.variableCount} variable(s) into ${result.filePath}`);
    } catch (e) {
      handleError(e);
    }
  });

variables
  .command("push")
  .description("Push local .env variables to SecretStash")
  .requiredOption("-e, --environment <slug>", "Environment slug")
  .option("-f, --file <path>", "Path to .env file", ".env")
  .action(async (opts, cmd) => {
    try {
      const client = createClient();
      const applicationId = resolveApplicationId(cmd);
      const manager = new VariablesManager();
      const result = await manager.push(client, applicationId, opts.environment, opts.file);

      console.log(`Pushed ${result.created} variable(s). Failed: ${result.failed}`);
    } catch (e) {
      handleError(e);
    }
  });

// ---------------------------------------------------------------------------
// environments
// ---------------------------------------------------------------------------

const environments = program.command("environments").description("Manage environments");

environments
  .command("list")
  .description("List environments for an application")
  .action(async (_opts, cmd) => {
    try {
      const client = createClient();
      const applicationId = resolveApplicationId(cmd);
      const manager = new EnvironmentsManager();
      const result = await manager.list(client, applicationId);

      if (result.total === 0) {
        console.log("No environments found.");
        return;
      }

      console.log(`Environments (${result.total}):\n`);
      for (const env of result.environments) {
        console.log(`  ${env.name} (${env.slug}) — ${env.type}`);
      }
    } catch (e) {
      handleError(e);
    }
  });

environments
  .command("create")
  .description("Create a new environment")
  .requiredOption("-n, --name <name>", "Environment name")
  .requiredOption("-s, --slug <slug>", "Environment slug")
  .requiredOption("-t, --type <type>", "Environment type (e.g. development, staging, production)")
  .action(async (opts, cmd) => {
    try {
      const client = createClient();
      const applicationId = resolveApplicationId(cmd);
      const manager = new EnvironmentsManager();
      const result = await manager.create(client, applicationId, opts.name, opts.slug, opts.type);

      console.log(`Environment created: ${result.name} (${result.slug}) — ${result.type}`);
    } catch (e) {
      handleError(e);
    }
  });

// ---------------------------------------------------------------------------
// envelope
// ---------------------------------------------------------------------------

const envelope = program.command("envelope").description("Manage encryption envelopes");

envelope
  .command("rewrap")
  .description("Rewrap an envelope from an old key to the current device key")
  .requiredOption("-e, --environment <slug>", "Environment slug")
  .requiredOption("--old-key-path <path>", "Path to the old private key file")
  .requiredOption("--old-device-key-id <id>", "Old device key ID", parseIntStrict)
  .action(async (opts, cmd) => {
    try {
      const client = createClient();
      const applicationId = resolveApplicationId(cmd);
      const manager = new EnvelopeManager();
      await manager.rewrap(client, {
        applicationId,
        environmentSlug: opts.environment,
        oldPrivateKeyPath: opts.oldKeyPath,
        oldDeviceKeyId: opts.oldDeviceKeyId,
      });

      console.log("Envelope rewrapped successfully.");
    } catch (e) {
      handleError(e);
    }
  });

envelope
  .command("reset")
  .description("Reset the environment key (creates new DEK for all device keys)")
  .requiredOption("-e, --environment <slug>", "Environment slug")
  .action(async (opts, cmd) => {
    try {
      const client = createClient();
      const applicationId = resolveApplicationId(cmd);
      const manager = new EnvelopeManager();
      const result = await manager.reset(client, applicationId, opts.environment);

      console.log(`Envelope reset. ${result.envelopeCount} envelope(s) created.`);
    } catch (e) {
      handleError(e);
    }
  });

envelope
  .command("repair")
  .description("Attempt rewrap, fall back to reset")
  .requiredOption("-e, --environment <slug>", "Environment slug")
  .requiredOption("--old-key-path <path>", "Path to the old private key file")
  .requiredOption("--old-device-key-id <id>", "Old device key ID", parseIntStrict)
  .action(async (opts, cmd) => {
    try {
      const client = createClient();
      const applicationId = resolveApplicationId(cmd);
      const manager = new EnvelopeManager();
      await manager.repair(client, {
        applicationId,
        environmentSlug: opts.environment,
        oldPrivateKeyPath: opts.oldKeyPath,
        oldDeviceKeyId: opts.oldDeviceKeyId,
      });

      console.log("Envelope repaired successfully.");
    } catch (e) {
      handleError(e);
    }
  });

// ---------------------------------------------------------------------------
// applications
// ---------------------------------------------------------------------------

const applications = program.command("applications").description("Manage applications");

applications
  .command("list")
  .description("List available applications")
  .action(async () => {
    try {
      const client = createClient();
      const manager = new ApplicationsManager();
      const result = await manager.list(client);

      console.log(`Applications (${result.total}):\n`);
      for (const app of result.applications) {
        console.log(`  ${app.name} (${app.id})`);
      }
    } catch (e) {
      handleError(e);
    }
  });

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

program.parse();
