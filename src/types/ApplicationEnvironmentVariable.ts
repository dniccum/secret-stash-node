export interface ApplicationEnvironmentVariable {
  id: string;
  name: string;
  payload: AesGcmPayload | null;
  created_at: string | null;
}

export interface AesGcmPayload {
  v: number;
  alg: string;
  kdf: string;
  iter: number;
  salt: string;
  iv: string;
  tag: string;
  ct: string;
}
