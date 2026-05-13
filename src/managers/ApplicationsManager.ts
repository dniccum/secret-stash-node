import { SecretStashClient } from "../client/SecretStashClient";
import { ApplicationData } from "../types";

export interface ListApplicationsResult {
  applications: ApplicationData[];
  total: number;
}

export class ApplicationsManager {
  async list(client: SecretStashClient): Promise<ListApplicationsResult> {
    const response = await client.getApplications();
    const applications = (response["data"] as ApplicationData[]) ?? [];

    return {
      applications,
      total: applications.length,
    };
  }
}
