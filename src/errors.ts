export class NfseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class InvalidDpsIdError extends NfseError {
  constructor(
    readonly field: string,
    readonly value: string,
    detail: string,
  ) {
    super(`Invalid DPS ID field ${field}="${value}": ${detail}`);
  }
}

export interface ValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export class DpsValidationError extends NfseError {
  constructor(readonly issues: readonly ValidationIssue[]) {
    const first = issues[0]?.message ?? "Unknown validation failure";
    const remaining = Math.max(issues.length - 1, 0);
    super(remaining > 0 ? `Invalid DPS: ${first} (+${remaining} more)` : `Invalid DPS: ${first}`);
  }
}

export interface XsdViolation {
  readonly message: string;
  readonly line?: number;
}

export class XsdValidationError extends NfseError {
  constructor(readonly violations: readonly XsdViolation[]) {
    const first = violations[0]?.message ?? "Unknown XSD violation";
    const remaining = Math.max(violations.length - 1, 0);
    super(
      remaining > 0
        ? `XSD validation failed: ${first} (+${remaining} more)`
        : `XSD validation failed: ${first}`,
    );
  }
}
