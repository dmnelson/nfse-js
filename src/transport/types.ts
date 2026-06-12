import type { JsonValue, ParsedSefinResponse } from "../parsing/types.js";

export type SefinEnvironment = "restricted-production" | "production";

export interface SefinEndpoints {
  readonly sefin: string;
  readonly adnContributor: string;
  readonly municipalParameters: string;
}

export type SefinOperation =
  | "submit-dps"
  | "get-nfse"
  | "get-dps-access-key"
  | "has-nfse-for-dps"
  | "register-event"
  | "get-events"
  | "get-event-type"
  | "get-event"
  | "get-adn-document"
  | "get-adn-events"
  | "get-municipal-convention"
  | "get-municipal-service"
  | "get-municipal-contributor"
  | "custom";

export type SefinHttpMethod = "GET" | "HEAD" | "POST";

export interface SefinHttpRequest {
  readonly operation: SefinOperation;
  readonly method: SefinHttpMethod;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: Uint8Array;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface SefinHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
  readonly url: string;
}

export interface SefinHttpTransport {
  request(request: SefinHttpRequest): Promise<SefinHttpResponse>;
}

export interface SefinTlsOptions {
  readonly ca?: string | Uint8Array | readonly (string | Uint8Array)[];
  readonly cert?: string | Uint8Array;
  readonly key?: string | Uint8Array;
  readonly pfx?: string | Uint8Array;
  readonly passphrase?: string;
  readonly rejectUnauthorized?: boolean;
  readonly servername?: string;
}

export interface NodeHttpTransportOptions {
  readonly tls?: SefinTlsOptions;
  readonly maxResponseBytes?: number;
  readonly userAgent?: string;
}

export interface SefinRetryOptions {
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly statuses?: readonly number[];
}

export interface SefinLogEvent {
  readonly phase: "request" | "response" | "retry" | "error";
  readonly operation: SefinOperation;
  readonly method: SefinHttpMethod;
  readonly attempt: number;
  readonly durationMs?: number;
  readonly status?: number;
  readonly errorCode?: string;
}

export interface SefinClientOptions {
  readonly transport: SefinHttpTransport;
  readonly environment?: SefinEnvironment;
  readonly endpoints?: Partial<SefinEndpoints>;
  readonly timeoutMs?: number;
  readonly retry?: SefinRetryOptions;
  readonly logger?: (event: SefinLogEvent) => void;
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

export interface SefinCallOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface SefinRequestPayload {
  readonly body: string | Uint8Array;
  readonly contentType: string;
}

export interface SefinResponseMetadata {
  readonly operation: SefinOperation;
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly url: string;
}

export interface SefinDocumentResponse extends SefinResponseMetadata {
  readonly payload: ParsedSefinResponse;
}

export interface SefinValueResponse extends SefinResponseMetadata {
  readonly value: JsonValue | string | null;
}

export interface SefinExistenceResponse extends SefinResponseMetadata {
  readonly exists: boolean;
}
