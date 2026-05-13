export class InvalidApiToken extends Error {
  public readonly code: number;
  constructor(message = "The provided API token is invalid. Please check your SECRET_STASH_API_TOKEN in your .env file.", code = 403) {
    super(message);
    this.name = "InvalidApiToken";
    this.code = code;
  }
}

export class MissingApiToken extends Error {
  public readonly code: number;
  constructor(message = "API token is not configured. Please set SECRET_STASH_API_TOKEN in your .env file.", code = 400) {
    super(message);
    this.name = "MissingApiToken";
    this.code = code;
  }
}

export class InvalidEnvironmentConfiguration extends Error {
  constructor(message = "Your environment is not configured correctly. Please check your .env file.") {
    super(message);
    this.name = "InvalidEnvironmentConfiguration";
  }
}

export class NoEnvironmentsFound extends Error {
  public readonly code: number;
  constructor(message = "No environments found.", code = 400) {
    super(message);
    this.name = "NoEnvironmentsFound";
    this.code = code;
  }
}

export class DeviceKeyNotRegistered extends Error {
  public readonly code: number;
  constructor(message = "Device key not registered. Run key init first.", code = 400) {
    super(message);
    this.name = "DeviceKeyNotRegistered";
    this.code = code;
  }
}

export class MetaKeyFailedToSave extends Error {
  public readonly code: number;
  constructor(message = "Failed to save device metadata file.", code = 400) {
    super(message);
    this.name = "MetaKeyFailedToSave";
    this.code = code;
  }
}

export class PrivateKeyFailedToSave extends Error {
  public readonly code: number;
  constructor(message = "Failed to save private key file.", code = 400) {
    super(message);
    this.name = "PrivateKeyFailedToSave";
    this.code = code;
  }
}

export class PrivateKeyNotFound extends Error {
  public readonly code: number;
  constructor(message = "Private key not found. Run key init first.", code = 400) {
    super(message);
    this.name = "PrivateKeyNotFound";
    this.code = code;
  }
}
