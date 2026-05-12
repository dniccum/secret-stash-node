export { RSAKeyPair } from "./RSAKeyPair";
export { ApplicationEnvironmentVariable, AesGcmPayload } from "./ApplicationEnvironmentVariable";
export { EnvironmentType } from "./EnvironmentType";

export interface DeviceMetadata {
  device_key_id: number;
  label: string;
  public_key?: string;
  fingerprint: string;
  is_temporary?: boolean;
  expires_at?: string | null;
}

export interface EnvelopePayload {
  v: number;
  alg: string;
  ct: string;
}

export interface ApiResponse<T = Record<string, unknown>> {
  data?: T;
  message?: string;
}

export interface DeviceKeyData {
  id: number;
  label: string;
  public_key: string;
  fingerprint: string;
  key_type: string;
  expires_at?: string | null;
}

export interface EnvironmentData {
  id: number;
  name: string;
  slug: string;
  type: string;
  variables_count?: number;
  created_at: string;
}

export interface VariableData {
  id: string;
  name: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}
