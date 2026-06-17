import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { ConfigResolver } from "../support/ConfigResolver";
import { VariableUtility } from "../support/VariableUtility";

interface AuthSession {
  session_code: string;
  verify_url: string;
  expires_at: string;
  poll_interval: number;
}

interface LoginResult {
  token: string;
  envFilePath: string;
}

export class LoginManager {
  private apiUrl: string;

  constructor() {
    this.apiUrl = ((ConfigResolver.get("api_url") as string) ?? "https://secretstash.cloud").replace(/\/+$/, "");
  }

  async createAuthSession(): Promise<AuthSession> {
    const response = await fetch(`${this.apiUrl}/api/cli/auth/sessions`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to create auth session (HTTP ${response.status}).`);
    }

    const body = await response.json() as { data: AuthSession };
    return body.data;
  }

  async pollForToken(sessionCode: string, expiresAt: string): Promise<string | null> {
    const deadline = new Date(expiresAt).getTime();

    while (Date.now() < deadline) {
      await this.sleep(2000);

      try {
        const response = await fetch(`${this.apiUrl}/api/cli/auth/sessions/${sessionCode}`, {
          method: "GET",
          headers: { "Accept": "application/json" },
        });

        if (!response.ok) {
          continue;
        }

        const body = await response.json() as { data: { status: string; token?: string } };
        const data = body.data;

        if (data.status === "authorized" && data.token) {
          return data.token;
        }

        if (data.status === "expired") {
          return null;
        }
      } catch {
        // continue polling on network errors
      }
    }

    return null;
  }

  storeToken(token: string, envFilePath?: string): string {
    const filePath = envFilePath ?? path.join(process.cwd(), ".env");
    const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";

    const merged = VariableUtility.mergeEnvContent(content, {
      SECRET_STASH_API_TOKEN: token,
    });

    fs.writeFileSync(filePath, merged, "utf-8");
    return filePath;
  }

  hasExistingToken(): boolean {
    const token = ConfigResolver.get("api_token") as string | null;
    return token !== null && token !== undefined && token !== "";
  }

  openBrowser(url: string): void {
    const platform = process.platform;
    let command: string;

    if (platform === "darwin") {
      command = "open";
    } else if (platform === "win32") {
      command = "start";
    } else {
      command = "xdg-open";
    }

    exec(`${command} ${JSON.stringify(url)}`, () => {
      // ignore errors - user can open manually
    });
  }

  async login(options: { noBrowser?: boolean } = {}): Promise<LoginResult> {
    const session = await this.createAuthSession();

    console.log("\nOpening browser to authorize CLI access...\n");
    console.log("  If your browser doesn't open, visit this URL:\n");
    console.log(`  ${session.verify_url}\n`);

    if (!options.noBrowser) {
      this.openBrowser(session.verify_url);
    }

    console.log("Waiting for authorization...");

    const token = await this.pollForToken(session.session_code, session.expires_at);

    if (!token) {
      throw new Error("Authorization timed out. Please try again.");
    }

    const envFilePath = this.storeToken(token);
    return { token, envFilePath };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
