import { SecretStashClient } from "../../src/client/SecretStashClient";
import { AgentStatus, AgentType } from "../../src/types";

function createMockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers(),
  } as Response;
}

function createMockHttpClient(body: unknown = { data: {} }, status = 200) {
  const respond = jest.fn(async () => createMockResponse(body, status));
  return {
    get: respond,
    post: jest.fn(async () => createMockResponse(body, status)),
    put: jest.fn(async () => createMockResponse(body, status)),
    patch: jest.fn(async () => createMockResponse(body, status)),
    delete: jest.fn(async () => createMockResponse(body, status)),
  };
}

function calledUrl(mock: jest.Mock): string {
  return mock.mock.calls[0][0] as string;
}

function calledBody(mock: jest.Mock): Record<string, unknown> {
  return JSON.parse((mock.mock.calls[0][1] as RequestInit).body as string);
}

describe("SecretStashClient Agent Vault", () => {
  let client: SecretStashClient;
  let mockHttp: ReturnType<typeof createMockHttpClient>;

  beforeEach(() => {
    client = new SecretStashClient("https://api.test.com", "test-token");
    mockHttp = createMockHttpClient();
    client.setHttpClient(mockHttp);
  });

  describe("versioned routing", () => {
    it("defaults to the v1 API version", () => {
      expect(client.getApiVersion()).toBe("v1");
    });

    it("routes agent endpoints to /api/v1/", async () => {
      await client.getAgents();
      expect(calledUrl(mockHttp.get)).toBe("https://api.test.com/api/v1/agents");
    });

    it("uses the unversioned fallback when apiVersion is null", async () => {
      const fallback = new SecretStashClient("https://api.test.com", "test-token", { apiVersion: null });
      fallback.setHttpClient(mockHttp);

      await fallback.getAgents();
      expect(fallback.getApiVersion()).toBeNull();
      expect(calledUrl(mockHttp.get)).toBe("https://api.test.com/api/agents");
    });

    it("trims trailing slashes from the API URL", async () => {
      const slashed = new SecretStashClient("https://api.test.com///", "test-token");
      slashed.setHttpClient(mockHttp);

      await slashed.getAgents();
      expect(calledUrl(mockHttp.get)).toBe("https://api.test.com/api/v1/agents");
    });

    it("keeps existing endpoints on their unversioned paths", async () => {
      await client.getEnvironments("app-123");
      expect(calledUrl(mockHttp.get)).toBe("https://api.test.com/api/applications/app-123/environments");
    });
  });

  describe("management endpoints", () => {
    it("gets a single agent", async () => {
      await client.getAgent("agent-1");
      expect(calledUrl(mockHttp.get)).toBe("https://api.test.com/api/v1/agents/agent-1");
    });

    it("creates an agent", async () => {
      await client.createAgent("Claude", AgentType.ClaudeCode, "Laptop");
      expect(calledUrl(mockHttp.post)).toBe("https://api.test.com/api/v1/agents");
      expect(calledBody(mockHttp.post)).toEqual({ name: "Claude", type: "claude-code", description: "Laptop" });
    });

    it("sends a null description when none is given", async () => {
      await client.createAgent("Claude", AgentType.Custom);
      expect(calledBody(mockHttp.post)).toEqual({ name: "Claude", type: "custom", description: null });
    });

    it("updates an agent with PATCH", async () => {
      await client.updateAgent("agent-1", { status: AgentStatus.Revoked });
      expect(calledUrl(mockHttp.patch)).toBe("https://api.test.com/api/v1/agents/agent-1");
      expect(calledBody(mockHttp.patch)).toEqual({ status: "revoked" });
    });

    it("deletes an agent with DELETE", async () => {
      await client.deleteAgent("agent-1");
      expect(calledUrl(mockHttp.delete)).toBe("https://api.test.com/api/v1/agents/agent-1");
      expect((mockHttp.delete.mock.calls[0] as unknown[])[1]).not.toHaveProperty("body");
    });

    it("syncs agent environments", async () => {
      await client.syncAgentEnvironments("agent-1", ["env-1", "env-2"]);
      expect(calledUrl(mockHttp.post)).toBe("https://api.test.com/api/v1/agents/agent-1/environments");
      expect(calledBody(mockHttp.post)).toEqual({ environment_ids: ["env-1", "env-2"] });
    });

    it("provisions a DEK with PUT", async () => {
      await client.provisionAgentDek("agent-1", "env-1", "ZGVr");
      expect(calledUrl(mockHttp.put)).toBe("https://api.test.com/api/v1/agents/agent-1/environments/env-1/dek");
      expect(calledBody(mockHttp.put)).toEqual({ dek: "ZGVr" });
    });

    it("tests an agent", async () => {
      await client.testAgent("agent-1");
      expect(calledUrl(mockHttp.post)).toBe("https://api.test.com/api/v1/agents/agent-1/test");
    });
  });

  describe("secret resolution endpoints", () => {
    it("lists an agent's secrets", async () => {
      await client.getAgentSecrets("agent-1");
      expect(calledUrl(mockHttp.get)).toBe("https://api.test.com/api/v1/agents/agent-1/secrets");
    });

    it("gets a single secret, encoding the name and passing the environment", async () => {
      await client.getAgentSecret("agent-1", "DB/PASS", "production");
      expect(calledUrl(mockHttp.get)).toBe("https://api.test.com/api/v1/agents/agent-1/secrets/DB%2FPASS?environment=production");
    });

    it("resolves a batch of secrets", async () => {
      await client.resolveAgentSecrets("agent-1", ["A", "B"], "staging");
      expect(calledUrl(mockHttp.post)).toBe("https://api.test.com/api/v1/agents/agent-1/secrets/resolve");
      expect(calledBody(mockHttp.post)).toEqual({ variables: ["A", "B"], environment: "staging" });
    });

    it("omits the environment from a batch when not given", async () => {
      await client.resolveAgentSecrets("agent-1", ["A"]);
      expect(calledBody(mockHttp.post)).toEqual({ variables: ["A"] });
    });

    it("surfaces the API message when a batch is out of scope", async () => {
      client.setHttpClient(createMockHttpClient({
        message: "One or more requested secrets are not available to this agent.",
        out_of_scope: ["NOPE"],
      }, 403));

      await expect(client.resolveAgentSecrets("agent-1", ["NOPE"]))
        .rejects.toThrow("One or more requested secrets are not available to this agent.");
    });
  });

  describe("custom HTTP clients", () => {
    it("throws a clear error when the client lacks a method", async () => {
      client.setHttpClient({
        get: jest.fn(async () => createMockResponse({})),
        post: jest.fn(async () => createMockResponse({})),
      });

      await expect(client.deleteAgent("agent-1")).rejects.toThrow("does not support DELETE requests");
    });
  });

  describe("fetch transport", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("sends the HTTP method to fetch", async () => {
      const fetchMock = jest.fn(async () => createMockResponse({ data: {} }));
      global.fetch = fetchMock as unknown as typeof fetch;

      const plain = new SecretStashClient("https://api.test.com", "test-token");
      await plain.provisionAgentDek("agent-1", "env-1", "ZGVr");

      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.test.com/api/v1/agents/agent-1/environments/env-1/dek");
      expect(init.method).toBe("PUT");
      expect(JSON.parse(init.body as string)).toEqual({ dek: "ZGVr" });
    });
  });
});
