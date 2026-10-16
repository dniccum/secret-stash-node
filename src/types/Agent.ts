export enum AgentType {
  ClaudeCode = "claude-code",
  Cursor = "cursor",
  Codex = "codex",
  OpenAi = "openai",
  Custom = "custom",
}

export enum AgentStatus {
  Active = "active",
  Revoked = "revoked",
}

export enum AgentTestStatus {
  Pass = "pass",
  Fail = "fail",
  Untested = "untested",
}

export interface AgentEnvironmentData {
  id: string;
  name: string;
  slug: string;
  dek_provisioned: boolean;
}

export interface AgentData {
  id: string;
  name: string;
  description: string | null;
  type: AgentType;
  status: AgentStatus;
  last_tested_at: string | null;
  last_test_status: AgentTestStatus;
  environments?: AgentEnvironmentData[];
  environments_count?: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface AgentUpdateAttributes {
  name?: string;
  description?: string | null;
  type?: AgentType;
  status?: AgentStatus;
}

export interface AgentSecretsEnvironment {
  environment: {
    id: string;
    name: string;
    slug: string;
  };
  dek_provisioned: boolean;
  variables: Array<{ name: string }>;
}

export interface AgentDiagnosticCheck {
  name: string;
  passed: boolean;
  message: string;
}

export interface AgentTestResult {
  status: AgentTestStatus.Pass | AgentTestStatus.Fail;
  checks: AgentDiagnosticCheck[];
}
