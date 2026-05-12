import { SecretStashClient } from "../client/SecretStashClient";
import { ApplicationData } from "../types";
import { NoApplicationsAvailable } from "../errors";

export interface ListApplicationsResult {
  applications: ApplicationData[];
  total: number;
}

export class ApplicationsManager {
  async list(client: SecretStashClient): Promise<ListApplicationsResult> {
    const response = await client.getApplications();
    const applications = (response["data"] as ApplicationData[]) ?? [];

    if (applications.length === 0) {
      throw new NoApplicationsAvailable();
    }

    return {
      applications,
      total: applications.length,
    };
  }
}
