export { SecretStashClient } from "./client/SecretStashClient";
export { CryptoHelper } from "./crypto/CryptoHelper";
export { ConfigResolver } from "./support/ConfigResolver";
export { VariableUtility } from "./support/VariableUtility";

export { KeyManager } from "./managers/KeyManager";
export type { KeyInitOptions, KeyStatusResult, KeyInitResult, RecoveryKeyResult } from "./managers/KeyManager";

export { VariablesManager } from "./managers/VariablesManager";
export type { ListVariablesResult, PullVariablesResult, PushVariablesResult } from "./managers/VariablesManager";

export { EnvironmentsManager } from "./managers/EnvironmentsManager";
export type { ListEnvironmentsResult, CreateEnvironmentResult } from "./managers/EnvironmentsManager";

export { EnvelopeManager } from "./managers/EnvelopeManager";
export type { RewrapOptions, ResetResult } from "./managers/EnvelopeManager";

export { ApplicationsManager } from "./managers/ApplicationsManager";
export type { ListApplicationsResult } from "./managers/ApplicationsManager";

export * from "./types";
export * from "./errors";
