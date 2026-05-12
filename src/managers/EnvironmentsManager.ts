import { SecretStashClient } from "../client/SecretStashClient";
import { InvalidEnvironmentConfiguration } from "../errors";
import { EnvironmentData } from "../types";

export interface ListEnvironmentsResult {
  environments: EnvironmentData[];
  total: number;
}

export interface CreateEnvironmentResult {
  name: string;
  slug: string;
  type: string;
}

export class EnvironmentsManager {
  async list(client: SecretStashClient, applicationId: string): Promise<ListEnvironmentsResult> {
    if (!applicationId) {
      throw new InvalidEnvironmentConfiguration("An application ID must be provided.");
    }

    const response = await client.getEnvironments(applicationId);
    const environments = (response["data"] as EnvironmentData[]) ?? [];

    return {
      environments,
      total: environments.length,
    };
  }

  async create(
    client: SecretStashClient,
    applicationId: string,
    name: string,
    slug: string,
    type: string
  ): Promise<CreateEnvironmentResult> {
    if (!applicationId) {
      throw new InvalidEnvironmentConfiguration("An application ID must be provided.");
    }

    if (!name) {
      throw new Error("Environment name is required.");
    }

    if (!slug) {
      throw new Error("Environment slug is required.");
    }

    const response = await client.createEnvironment(applicationId, name, slug, type);
    const env = response["data"] as Record<string, unknown> | undefined;

    if (!env) {
      throw new Error("Failed to create environment.");
    }

    return {
      name: env["name"] as string,
      slug: env["slug"] as string,
      type: env["type"] as string,
    };
  }
}
