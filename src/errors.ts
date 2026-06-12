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

export type ValidationCategory =
  | "format"
  | "schema"
  | "business"
  | "municipal-parameter"
  | "remote";

export interface ValidationSource {
  readonly document: string;
  readonly version: string;
  readonly section?: string;
  readonly row?: number;
  readonly url?: string;
}

export interface ValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly category: ValidationCategory;
  readonly message: string;
  readonly officialCode?: string;
  readonly source?: ValidationSource;
}

export class DpsValidationError extends NfseError {
  constructor(readonly issues: readonly ValidationIssue[]) {
    const first = issues[0]?.message ?? "Unknown validation failure";
    const remaining = Math.max(issues.length - 1, 0);
    super(remaining > 0 ? `Invalid DPS: ${first} (+${remaining} more)` : `Invalid DPS: ${first}`);
  }
}

export type XmlParseErrorCode =
  | "document-too-large"
  | "unsafe-xml"
  | "invalid-xml"
  | "unexpected-root"
  | "missing-value"
  | "invalid-value";

export class XmlParseError extends NfseError {
  constructor(
    readonly code: XmlParseErrorCode,
    readonly path: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`XML parse failed at ${path}: ${message}`, options);
  }
}

export type SefinResponseParseErrorCode =
  | "document-too-large"
  | "invalid-json"
  | "nesting-too-deep"
  | "invalid-compressed-document";

export class SefinResponseParseError extends NfseError {
  constructor(
    readonly code: SefinResponseParseErrorCode,
    readonly path: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`SEFIN response parse failed at ${path}: ${message}`, options);
  }
}

export type XmlSignatureErrorCode =
  | "unsupported-document"
  | "existing-signature"
  | "missing-signature"
  | "multiple-signatures"
  | "missing-id"
  | "invalid-reference"
  | "invalid-credentials"
  | "unsupported-algorithm"
  | "certificate-expired"
  | "certificate-untrusted"
  | "signing-failed"
  | "verification-failed";

export class XmlSignatureError extends NfseError {
  constructor(
    readonly code: XmlSignatureErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`XML signature failed: ${message}`, options);
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
