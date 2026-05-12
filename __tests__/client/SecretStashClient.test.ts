import { SecretStashClient } from "../../src/client/SecretStashClient";
import { InvalidApiToken, InvalidEnvironmentConfiguration } from "../../src/errors";
import { ConfigResolver } from "../../src/support/ConfigResolver";

function createMockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers(),
  } as Response;
}

function createMockHttpClient(responses: Map<string, { body: unknown; status?: number }> = new Map()) {
  return {
    get: jest.fn(async (url: string) => {
      for (const [pattern, resp] of responses) {
        if (url.includes(pattern)) {
          return createMockResponse(resp.body, resp.status ?? 200);
        }
      }
      return createMockResponse({});
    }),
    post: jest.fn(async (url: string) => {
      for (const [pattern, resp] of responses) {
        if (url.includes(pattern)) {
          return createMockResponse(resp.body, resp.status ?? 200);
        }
      }
      return createMockResponse({});
    }),
  };
}

describe("SecretStashClient", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    ConfigResolver.clearCache();
  });

  afterAll(() => {
    process.env = originalEnv;
    ConfigResolver.clearCache();
  });

  describe("constructor", () => {
    it("should use default API URL when empty string is provided", () => {
      process.env["SECRET_STASH_API_URL"] = "";
      // Empty string falls back to ConfigResolver default (https://secretstash.cloud)
      const client = new SecretStashClient("", "token");
      expect(client).toBeDefined();
    });

    it("should throw when API token is missing", () => {
      expect(() => new SecretStashClient("https://api.test.com")).toThrow(InvalidEnvironmentConfiguration);
    });

    it("should fall back to ConfigResolver for empty string apiToken", () => {
      process.env["SECRET_STASH_API_TOKEN"] = "env-token";
      // Empty string falls back to ConfigResolver, same as apiUrl behavior
      const client = new SecretStashClient("https://api.test.com", "");
      expect(client).toBeDefined();
    });

    it("should create client with explicit parameters", () => {
      const client = new SecretStashClient("https://api.test.com", "test-token");
      expect(client).toBeDefined();
    });
  });

  describe("get", () => {
    it("should make GET requests", async () => {
      const client = new SecretStashClient("https://api.test.com", "test-token");
      const mockHttp = createMockHttpClient(new Map([
        ["applications", { body: { data: [{ id: 1, name: "Test App" }] } }],
      ]));
      client.setHttpClient(mockHttp);

      const result = await client.getApplications();
      expect(mockHttp.get).toHaveBeenCalled();
      expect(result).toEqual({ data: [{ id: 1, name: "Test App" }] });
    });

    it("should include query parameters", async () => {
      const client = new SecretStashClient("https://api.test.com", "test-token");
      const mockHttp = createMockHttpClient(new Map([
        ["envelope", { body: { data: { envelope: {} } } }],
      ]));
      client.setHttpClient(mockHttp);

      await client.getEnvironmentEnvelope("app-123", "production", 42);
      const calledUrl = mockHttp.get.mock.calls[0][0] as string;
      expect(calledUrl).toContain("device_key_id=42");
    });
  });

  describe("post", () => {
    it("should make POST requests", async () => {
      const client = new SecretStashClient("https://api.test.com", "test-token");
      const mockHttp = createMockHttpClient(new Map([
        ["environments", { body: { data: { name: "Prod", slug: "production", type: "production" } } }],
      ]));
      client.setHttpClient(mockHttp);

      const result = await client.createEnvironment("app-123", "Prod", "production", "production");
      expect(mockHttp.post).toHaveBeenCalled();
      expect(result).toHaveProperty("data");
    });
  });

  describe("error handling", () => {
    it("should throw InvalidApiToken on 401", async () => {
      const client = new SecretStashClient("https://api.test.com", "bad-token");
      const mockHttp = createMockHttpClient(new Map([
        ["applications", { body: { message: "Unauthorized" }, status: 401 }],
      ]));
      client.setHttpClient(mockHttp);

      await expect(client.getApplications()).rejects.toThrow(InvalidApiToken);
    });

    it("should throw Error with API message on other errors", async () => {
      const client = new SecretStashClient("https://api.test.com", "test-token");
      const mockHttp = createMockHttpClient(new Map([
        ["applications", { body: { message: "Not found" }, status: 404 }],
      ]));
      client.setHttpClient(mockHttp);

      await expect(client.getApplications()).rejects.toThrow("Not found");
    });
  });

  describe("API methods", () => {
    let client: SecretStashClient;
    let mockHttp: ReturnType<typeof createMockHttpClient>;

    beforeEach(() => {
      client = new SecretStashClient("https://api.test.com", "test-token");
      mockHttp = createMockHttpClient(new Map([
        ["applications", { body: { data: [] } }],
        ["environments", { body: { data: [] } }],
        ["variables", { body: { data: [] } }],
        ["user/keys", { body: { data: [] } }],
        ["envelope", { body: { data: {} } }],
        ["envelopes", { body: { data: [] } }],
      ]));
      client.setHttpClient(mockHttp);
    });

    it("should call getApplications", async () => {
      await client.getApplications();
      expect(mockHttp.get).toHaveBeenCalled();
    });

    it("should call getEnvironments", async () => {
      await client.getEnvironments("app-123");
      expect(mockHttp.get).toHaveBeenCalled();
    });

    it("should call createEnvironment", async () => {
      await client.createEnvironment("app-123", "Prod", "production", "production");
      expect(mockHttp.post).toHaveBeenCalled();
    });

    it("should call getVariables", async () => {
      await client.getVariables("app-123", "production");
      expect(mockHttp.get).toHaveBeenCalled();
    });

    it("should call createVariable", async () => {
      await client.createVariable("app-123", "production", "DB_HOST", { ct: "encrypted" });
      expect(mockHttp.post).toHaveBeenCalled();
    });

    it("should call getUserKeys", async () => {
      await client.getUserKeys();
      expect(mockHttp.get).toHaveBeenCalled();
    });

    it("should call storeDeviceKey", async () => {
      await client.storeDeviceKey("My Device", "public-key", "device", {});
      expect(mockHttp.post).toHaveBeenCalled();
    });

    it("should call storeDeviceKey with temporary options", async () => {
      await client.storeDeviceKey("Temp Key", "pub-key", "device", {}, true, 30);
      expect(mockHttp.post).toHaveBeenCalled();
    });

    it("should call getEnvironmentEnvelope", async () => {
      await client.getEnvironmentEnvelope("app-123", "production", 42);
      expect(mockHttp.get).toHaveBeenCalled();
    });

    it("should call storeEnvironmentEnvelope", async () => {
      await client.storeEnvironmentEnvelope("app-123", "production", 42, { v: 1, alg: "RSA-OAEP", ct: "test" });
      expect(mockHttp.post).toHaveBeenCalled();
    });

    it("should call getEnvironmentEnvelopes", async () => {
      await client.getEnvironmentEnvelopes("app-123", "production");
      expect(mockHttp.get).toHaveBeenCalled();
    });

    it("should call storeBulkEnvironmentEnvelopes", async () => {
      await client.storeBulkEnvironmentEnvelopes("app-123", "production", [
        { device_key_id: 1, envelope: { v: 1, alg: "RSA-OAEP", ct: "test" } },
      ]);
      expect(mockHttp.post).toHaveBeenCalled();
    });
  });
});
