import { ApplicationsManager } from "../../src/managers/ApplicationsManager";
import { SecretStashClient } from "../../src/client/SecretStashClient";
import { NoApplicationsAvailable } from "../../src/errors";

function createMockClient(overrides: Record<string, unknown> = {}) {
  return {
    getApplications: jest.fn().mockResolvedValue(overrides["getApplications"] ?? {
      data: [
        { id: "app-1", name: "My App", created_at: "2025-01-01" },
        { id: "app-2", name: "Other App", created_at: "2025-01-02" },
      ],
    }),
  } as unknown as SecretStashClient;
}

describe("ApplicationsManager", () => {
  let manager: ApplicationsManager;

  beforeEach(() => {
    manager = new ApplicationsManager();
  });

  describe("list", () => {
    it("should list applications", async () => {
      const client = createMockClient();
      const result = await manager.list(client);

      expect(result.total).toBe(2);
      expect(result.applications).toHaveLength(2);
      expect(result.applications[0].name).toBe("My App");
      expect(result.applications[0].id).toBe("app-1");
      expect(result.applications[1].name).toBe("Other App");
    });

    it("should throw NoApplicationsAvailable when none exist", async () => {
      const client = createMockClient({ getApplications: { data: [] } });
      await expect(manager.list(client)).rejects.toThrow(NoApplicationsAvailable);
    });

    it("should throw NoApplicationsAvailable when data is missing", async () => {
      const client = createMockClient({ getApplications: {} });
      await expect(manager.list(client)).rejects.toThrow(NoApplicationsAvailable);
    });
  });
});
