import * as fs from "fs";
import * as path from "path";
import { VariableUtility } from "./VariableUtility";

const ENV_MAP: Record<string, string> = {
  api_token: "SECRET_STASH_API_TOKEN",
  api_url: "SECRET_STASH_API_URL",
  application_id: "SECRET_STASH_APPLICATION_ID",
  key_dir: "SECRET_STASH_KEY_DIR",
  app_env: "APP_ENV",
};

const DEFAULTS: Record<string, unknown> = {
  api_url: "https://secretstash.cloud",
  ignored_variables: ["APP_KEY", "APP_ENV"],
};

let dotenvCache: Record<string, string> | null = null;

export class ConfigResolver {
  static get(key: string, defaultValue: unknown = null): unknown {
    const envKey = ENV_MAP[key] ?? null;

    if (envKey) {
      const envValue = process.env[envKey];
      if (envValue !== undefined && envValue !== "") {
        return envValue;
      }
    }

    if (envKey) {
      const dotenv = ConfigResolver.loadDotenv();
      if (dotenv[envKey] !== undefined && dotenv[envKey] !== "") {
        return dotenv[envKey];
      }
    }

    return DEFAULTS[key] ?? defaultValue;
  }

  static ignoredVariables(): string[] {
    const value = DEFAULTS["ignored_variables"];
    return Array.isArray(value) ? value as string[] : [];
  }

  static isRunningTests(): boolean {
    return process.env["NODE_ENV"] === "test"
      || process.env["JEST_WORKER_ID"] !== undefined;
  }

  static clearCache(): void {
    dotenvCache = null;
  }

  private static loadDotenv(): Record<string, string> {
    if (dotenvCache !== null) {
      return dotenvCache;
    }

    dotenvCache = {};

    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) {
      return dotenvCache;
    }

    const content = fs.readFileSync(envPath, "utf-8");
    dotenvCache = VariableUtility.parseEnvContent(content);

    return dotenvCache;
  }
}
