export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class TenantAccessDeniedError extends DomainError {
  constructor(message = "You do not have access to this organization.") {
    super("TENANT_ACCESS_DENIED", message, 403);
  }
}

export class NotFoundDomainError extends DomainError {
  constructor(entity: string) {
    super("NOT_FOUND", `${entity} not found.`, 404);
  }
}

export class InsufficientPermissionError extends DomainError {
  constructor(capability: string) {
    super("INSUFFICIENT_PERMISSION", `You do not have the '${capability}' permission in this organization.`, 403);
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super("INVALID_CREDENTIALS", "Invalid email or password.", 401);
  }
}

export class SessionRequiredError extends DomainError {
  constructor() {
    super("SESSION_REQUIRED", "Authentication required.", 401);
  }
}

export class InvalidOrExpiredTokenError extends DomainError {
  constructor(kind = "token") {
    super("INVALID_OR_EXPIRED_TOKEN", `This ${kind} is invalid or has expired.`, 400);
  }
}

export class ConflictDomainError extends DomainError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}

export class RateLimitedError extends DomainError {
  constructor() {
    super("RATE_LIMITED", "Too many attempts. Please try again later.", 429);
  }
}
