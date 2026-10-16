import { ConfigResolver } from "../support/ConfigResolver";
import { InvalidApiToken, InvalidEnvironmentConfiguration, MissingApiToken } from "../errors";
import { AgentType, AgentUpdateAttributes, EnvelopePayload } from "../types";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpClient {
  get(url: string, options?: RequestInit): Promise<Response>;
  post(url: string, options?: RequestInit): Promise<Response>;
  put?(url: string, options?: RequestInit): Promise<Response>;
  patch?(url: string, options?: RequestInit): Promise<Response>;
  delete?(url: string, options?: RequestInit): Promise<Response>;
}

/**
 * Versions of the SecretStash REST API the client can target.
 */
export type ApiVersion = "v1";

export interface SecretStashClientOptions {
  /**
   * The API version used for versioned endpoints (the Agent Vault). Defaults
   * to "v1", which routes requests to `/api/v1/...`. Pass `null` to use the
   * unversioned `/api/...` fallback that the server serves as its default
   * version (deprecated server-side, kept for older deployments).
   */
  apiVersion?: ApiVersion | null;
}

export class SecretStashClient {
  static readonly DEFAULT_API_VERSION: ApiVersion = "v1";

  private apiUrl: string;
  private apiToken: string;
  private apiVersion: ApiVersion | null;
  private httpClient: HttpClient | null = null;

  constructor(apiUrl?: string, apiToken?: string, options: SecretStashClientOptions = {}) {
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

    this.apiVersion = options.apiVersion === undefined
      ? SecretStashClient.DEFAULT_API_VERSION
      : options.apiVersion;
  }

  getApiVersion(): ApiVersion | null {
    return this.apiVersion;
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
    return this.send("GET", endpoint, { query });
  }

  async post(endpoint: string, data: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return this.send("POST", endpoint, { data });
  }

  async put(endpoint: string, data: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return this.send("PUT", endpoint, { data });
  }

  async patch(endpoint: string, data: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return this.send("PATCH", endpoint, { data });
  }

  async delete(endpoint: string): Promise<Record<string, unknown>> {
    return this.send("DELETE", endpoint);
  }

  private async send(
    method: HttpMethod,
    endpoint: string,
    { query = {}, data }: { query?: Record<string, string | number>; data?: Record<string, unknown> } = {}
  ): Promise<Record<string, unknown>> {
    try {
      const url = new URL(endpoint, this.getBaseUrl());
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, String(value));
      }

      const options: RequestInit = { headers: this.getHeaders() };
      if (data !== undefined) {
        options.body = JSON.stringify(data);
      }

      const response = await this.dispatch(method, url.toString(), options);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const body = await response.json();
      return typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
    } catch (e) {
      this.handleException(e);
    }
  }

  private async dispatch(method: HttpMethod, url: string, options: RequestInit): Promise<Response> {
    const client = this.httpClient;
    if (!client) {
      return fetch(url, { ...options, method });
    }

    const handler = {
      GET: client.get,
      POST: client.post,
      PUT: client.put,
      PATCH: client.patch,
      DELETE: client.delete,
    }[method];

    if (!handler) {
      throw new Error(`The configured HTTP client does not support ${method} requests.`);
    }

    return handler.call(client, url, options);
  }

  /**
   * Prefix an endpoint with the configured API version, e.g. `agents` becomes
   * `v1/agents`. With no version configured the unversioned fallback is used.
   */
  private versioned(endpoint: string): string {
    return this.apiVersion ? `${this.apiVersion}/${endpoint}` : endpoint;
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
    return this.get(`applications/${applicationId}/environments/${environmentSlug}/variables`);
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

  // Agent Vault: management endpoints (authenticated with a user API token)

  async getAgents(): Promise<Record<string, unknown>> {
    return this.get(this.versioned("agents"));
  }

  async getAgent(agentId: string): Promise<Record<string, unknown>> {
    return this.get(this.versioned(`agents/${encodeURIComponent(agentId)}`));
  }

  async createAgent(name: string, type: AgentType, description?: string | null): Promise<Record<string, unknown>> {
    return this.post(this.versioned("agents"), {
      name,
      type,
      description: description ?? null,
    });
  }

  async updateAgent(agentId: string, attributes: AgentUpdateAttributes): Promise<Record<string, unknown>> {
    return this.patch(this.versioned(`agents/${encodeURIComponent(agentId)}`), { ...attributes });
  }

  async deleteAgent(agentId: string): Promise<Record<string, unknown>> {
    return this.delete(this.versioned(`agents/${encodeURIComponent(agentId)}`));
  }

  async syncAgentEnvironments(agentId: string, environmentIds: string[]): Promise<Record<string, unknown>> {
    return this.post(this.versioned(`agents/${encodeURIComponent(agentId)}/environments`), {
      environment_ids: environmentIds,
    });
  }

  async provisionAgentDek(agentId: string, environmentId: string, dek: string): Promise<Record<string, unknown>> {
    return this.put(
      this.versioned(`agents/${encodeURIComponent(agentId)}/environments/${encodeURIComponent(environmentId)}/dek`),
      { dek }
    );
  }

  async testAgent(agentId: string): Promise<Record<string, unknown>> {
    return this.post(this.versioned(`agents/${encodeURIComponent(agentId)}/test`));
  }

  // Agent Vault: secret resolution endpoints (authenticated with the agent's own token)

  async getAgentSecrets(agentId: string): Promise<Record<string, unknown>> {
    return this.get(this.versioned(`agents/${encodeURIComponent(agentId)}/secrets`));
  }

  async getAgentSecret(agentId: string, name: string, environment?: string): Promise<Record<string, unknown>> {
    return this.get(
      this.versioned(`agents/${encodeURIComponent(agentId)}/secrets/${encodeURIComponent(name)}`),
      environment ? { environment } : {}
    );
  }

  async resolveAgentSecrets(agentId: string, variables: string[], environment?: string): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = { variables };
    if (environment) {
      data["environment"] = environment;
    }

    return this.post(this.versioned(`agents/${encodeURIComponent(agentId)}/secrets/resolve`), data);
  }
}
