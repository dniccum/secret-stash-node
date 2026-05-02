import { EnvironmentsManager } from "../../src/managers/EnvironmentsManager";
import { SecretStashClient } from "../../src/client/SecretStashClient";
import { InvalidEnvironmentConfiguration } from "../../src/errors";

function createMockClient(overrides: Record<string, unknown> = {}) {
  return {
    getEnvironments: jest.fn().mockResolvedValue(overrides["getEnvironments"] ?? {
      data: [
        { id: 1, name: "Production", slug: "production", type: "production", variables_count: 5, created_at: "2025-01-01" },
        { id: 2, name: "Staging", slug: "staging", type: "development", variables_count: 3, created_at: "2025-01-02" },
      ],
    }),
    createEnvironment: jest.fn().mockResolvedValue(overrides["createEnvironment"] ?? {
      data: { name: "Test", slug: "test", type: "local" },
    }),
  } as unknown as SecretStashClient;
}

describe("EnvironmentsManager", () => {
  let manager: EnvironmentsManager;

  beforeEach(() => {
    manager = new EnvironmentsManager();
  });

  describe("list", () => {
    it("should list environments", async () => {
      const client = createMockClient();
      const result = await manager.list(client, "app-123");

      expect(result.total).toBe(2);
      expect(result.environments).toHaveLength(2);
      expect(result.environments[0].name).toBe("Production");
      expect(result.environments[1].slug).toBe("staging");
    });

    it("should return empty when no environments", async () => {
      const client = createMockClient({ getEnvironments: { data: [] } });
      const result = await manager.list(client, "app-123");
      expect(result.total).toBe(0);
      expect(result.environments).toHaveLength(0);
    });

    it("should throw when application ID is missing", async () => {
      const client = createMockClient();
      await expect(manager.list(client, "")).rejects.toThrow(InvalidEnvironmentConfiguration);
    });
  });

  describe("create", () => {
    it("should create an environment", async () => {
      const client = createMockClient();
      const result = await manager.create(client, "app-123", "Staging", "staging", "development");

      expect(result.name).toBe("Test");
      expect(result.slug).toBe("test");
      expect((client as unknown as { createEnvironment: jest.Mock }).createEnvironment).toHaveBeenCalledWith(
        "app-123", "Staging", "staging", "development"
      );
    });

    it("should throw when application ID is missing", async () => {
      const client = createMockClient();
      await expect(manager.create(client, "", "Test", "test", "local")).rejects.toThrow(InvalidEnvironmentConfiguration);
    });

    it("should throw when name is missing", async () => {
      const client = createMockClient();
      await expect(manager.create(client, "app-123", "", "test", "local")).rejects.toThrow("Environment name is required");
    });

    it("should throw when slug is missing", async () => {
      const client = createMockClient();
      await expect(manager.create(client, "app-123", "Test", "", "local")).rejects.toThrow("Environment slug is required");
    });

    it("should throw when API returns no data", async () => {
      const client = createMockClient({ createEnvironment: {} });
      await expect(manager.create(client, "app-123", "Test", "test", "local")).rejects.toThrow("Failed to create environment");
    });
  });
});
