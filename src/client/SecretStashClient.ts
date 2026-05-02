import { ConfigResolver } from "../support/ConfigResolver";
import { InvalidApiToken, InvalidEnvironmentConfiguration, MissingApiToken } from "../errors";
import { EnvelopePayload } from "../types";

export interface HttpClient {
  get(url: string, options?: RequestInit): Promise<Response>;
  post(url: string, options?: RequestInit): Promise<Response>;
}

export class SecretStashClient {
  private apiUrl: string;
  private apiToken: string;
  private httpClient: HttpClient | null = null;

  constructor(apiUrl?: string, apiToken?: string) {
    this.apiUrl = apiUrl
      ? apiUrl.replace(/\/+$/, "")
      : (ConfigResolver.get("api_url") as string) ?? "";

    this.apiToken = apiToken
      ? apiToken
      : (ConfigResolver.get("api_token") as string) ?? "";

    if (!this.apiUrl) {
      throw new InvalidEnvironmentConfiguration(
        "API url is not configured. Please set SECRET_STASH_API_URL in your .env file."
      );
    }

    if (!this.apiToken) {
      throw new InvalidEnvironmentConfiguration(
        "API token is not configured. Please set SECRET_STASH_API_TOKEN in your .env file."
      );
    }
  }

  setHttpClient(client: HttpClient): this {
    this.httpClient = client;
    return this;
  }

  private getBaseUrl(): string {
    return `${this.apiUrl.replace(/\/+$/, "")}/api/`;
  }

  private getHeaders(): Record<string, string> {
    if (!this.apiToken) {
      throw new MissingApiToken();
    }

    return {
      "Authorization": `Bearer ${this.apiToken}`,
      "User-Agent": "SecretStash-Node/1.0",
      "Accept": "application/json",
      "Content-Type": "application/json",
    };
  }

  async get(endpoint: string, query: Record<string, string | number> = {}): Promise<Record<string, unknown>> {
    try {
      const url = new URL(endpoint, this.getBaseUrl());
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, String(value));
      }

      const client = this.httpClient;
      let response: Response;
      if (client) {
        response = await client.get(url.toString(), { headers: this.getHeaders() });
      } else {
        response = await fetch(url.toString(), {
          method: "GET",
          headers: this.getHeaders(),
        });
      }

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const body = await response.json();
      return typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
    } catch (e) {
      this.handleException(e);
    }
  }

  async post(endpoint: string, data: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    try {
      const url = new URL(endpoint, this.getBaseUrl());

      const client = this.httpClient;
      let response: Response;
      if (client) {
        response = await client.post(url.toString(), {
          headers: this.getHeaders(),
          body: JSON.stringify(data),
        });
      } else {
        response = await fetch(url.toString(), {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(data),
        });
      }

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const body = await response.json();
      return typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
    } catch (e) {
      this.handleException(e);
    }
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    const statusCode = response.status;

    if (statusCode === 401) {
      throw new InvalidApiToken(undefined, statusCode);
    }

    let message: string;
    try {
      const body = await response.json();
      if (typeof body === "object" && body !== null && "message" in body && typeof (body as Record<string, unknown>).message === "string") {
        message = (body as Record<string, string>).message;
      } else {
        message = `API request failed with status code ${statusCode}.`;
      }
    } catch {
      message = `API request failed with status code ${statusCode}.`;
    }

    throw new Error(message);
  }

  private handleException(e: unknown): never {
    if (e instanceof InvalidApiToken || e instanceof MissingApiToken || e instanceof InvalidEnvironmentConfiguration) {
      throw e;
    }

    if (e instanceof TypeError && (e.message.includes("fetch") || e.message.includes("network"))) {
      throw new Error("Unable to connect to the SecretStash API. Please check your network connection and API URL configuration.");
    }

    if (e instanceof Error) {
      throw e;
    }

    throw new Error("An unexpected API error occurred. Please try again.");
  }

  async getApplications(): Promise<Record<string, unknown>> {
    return this.get("applications");
  }

  async getEnvironments(applicationId: string): Promise<Record<string, unknown>> {
    return this.get(`applications/${applicationId}/environments`);
  }

  async createEnvironment(applicationId: string, name: string, slug: string, type: string): Promise<Record<string, unknown>> {
    return this.post(`applications/${applicationId}/environments`, {
      name,
      slug,
      type,
    });
  }

  async getVariables(applicationId: string, environmentSlug: string): Promise<Record<string, unknown>> {
    return this.get(`applications/${applicationId}/environments/${environmentSlug}`);
  }

  async createVariable(applicationId: string, environmentId: string, name: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.post(`applications/${applicationId}/environments/${environmentId}/variables`, {
      name,
      payload,
    });
  }

  async getUserKeys(): Promise<Record<string, unknown>> {
    return this.get("user/keys");
  }

  async storeDeviceKey(
    label: string,
    publicKey: string,
    keyType = "device",
    metadata: Record<string, unknown> = {},
    isTemporary = false,
    ttlMinutes?: number
  ): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {
      label,
      key_type: keyType,
      public_key: publicKey,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    };

    if (isTemporary) {
      data["is_temporary"] = true;
      data["ttl_minutes"] = ttlMinutes ?? 15;
    }

    return this.post("user/keys", data);
  }

  async getEnvironmentEnvelope(applicationId: string, environmentSlug: string, deviceKeyId: number): Promise<Record<string, unknown>> {
    return this.get(`applications/${applicationId}/environments/${environmentSlug}/envelope`, {
      device_key_id: deviceKeyId,
    });
  }

  async storeEnvironmentEnvelope(applicationId: string, environmentSlug: string, deviceKeyId: number, envelope: EnvelopePayload): Promise<Record<string, unknown>> {
    return this.post(`applications/${applicationId}/environments/${environmentSlug}/envelope`, {
      device_key_id: deviceKeyId,
      envelope,
    });
  }

  async getEnvironmentEnvelopes(applicationId: string, environmentSlug: string): Promise<Record<string, unknown>> {
    return this.get(`applications/${applicationId}/environments/${environmentSlug}/envelopes`);
  }

  async storeBulkEnvironmentEnvelopes(applicationId: string, environmentSlug: string, envelopes: Array<{ device_key_id: number; envelope: EnvelopePayload }>): Promise<Record<string, unknown>> {
    return this.post(`applications/${applicationId}/environments/${environmentSlug}/envelopes`, {
      envelopes,
    });
  }
}
