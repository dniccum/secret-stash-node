import { ConfigResolver } from "../../src/support/ConfigResolver";

describe("ConfigResolver", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    ConfigResolver.clearCache();
  });

  afterAll(() => {
    process.env = originalEnv;
    ConfigResolver.clearCache();
  });

  describe("get", () => {
    it("should read from environment variables", () => {
      process.env["SECRET_STASH_API_TOKEN"] = "env-token";
      expect(ConfigResolver.get("api_token")).toBe("env-token");
    });

    it("should return default for api_url", () => {
      delete process.env["SECRET_STASH_API_URL"];
      expect(ConfigResolver.get("api_url")).toBe("https://secretstash.cloud");
    });

    it("should return provided default when key not found", () => {
      expect(ConfigResolver.get("nonexistent_key", "fallback")).toBe("fallback");
    });

    it("should return null for unknown key with no default", () => {
      expect(ConfigResolver.get("totally_unknown")).toBeNull();
    });

    it("should prefer environment variables over defaults", () => {
      process.env["SECRET_STASH_API_URL"] = "https://custom.api.com";
      expect(ConfigResolver.get("api_url")).toBe("https://custom.api.com");
    });

    it("should ignore empty environment variables", () => {
      process.env["SECRET_STASH_API_TOKEN"] = "";
      expect(ConfigResolver.get("api_token")).toBeNull();
    });
  });

  describe("ignoredVariables", () => {
    it("should return default ignored variables", () => {
      const ignored = ConfigResolver.ignoredVariables();
      expect(ignored).toContain("APP_KEY");
      expect(ignored).toContain("APP_ENV");
    });
  });

  describe("isRunningTests", () => {
    it("should return true when JEST_WORKER_ID is set", () => {
      process.env["JEST_WORKER_ID"] = "1";
      expect(ConfigResolver.isRunningTests()).toBe(true);
    });

    it("should return true when NODE_ENV is test", () => {
      process.env["NODE_ENV"] = "test";
      expect(ConfigResolver.isRunningTests()).toBe(true);
    });
  });

  describe("clearCache", () => {
    it("should clear the dotenv cache", () => {
      process.env["SECRET_STASH_API_TOKEN"] = "cached-token";
      ConfigResolver.get("api_token");
      ConfigResolver.clearCache();
      process.env["SECRET_STASH_API_TOKEN"] = "new-token";
      expect(ConfigResolver.get("api_token")).toBe("new-token");
    });
  });
});
