import { Buffer } from "node:buffer";
import { SefinResponseParseError, SefinTransportError } from "../errors.js";
import { parseSefinDocumentResponse } from "../parsing/sefin-response.js";
import type { JsonValue } from "../parsing/types.js";
import { appendEndpointPath, resolveSefinEndpoints } from "./endpoints.js";
import { jsonRequestPayload, xmlRequestPayload } from "./payloads.js";
import type {
  SefinCallOptions,
  SefinClientOptions,
  SefinDocumentResponse,
  SefinEndpoints,
  SefinExistenceResponse,
  SefinHttpMethod,
  SefinHttpRequest,
  SefinHttpResponse,
  SefinLogEvent,
  SefinOperation,
  SefinRequestPayload,
  SefinResponseMetadata,
  SefinValueResponse,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_STATUSES = [408, 425, 429, 500, 502, 503, 504] as const;

export interface SefinClient {
  submitDps(
    xmlOrPayload: string | SefinRequestPayload,
    options?: SefinCallOptions,
  ): Promise<SefinDocumentResponse>;
  getNfse(accessKey: string, options?: SefinCallOptions): Promise<SefinDocumentResponse>;
  getDpsAccessKey(dpsId: string, options?: SefinCallOptions): Promise<SefinValueResponse>;
  hasNfseForDps(dpsId: string, options?: SefinCallOptions): Promise<SefinExistenceResponse>;
  registerEvent(
    accessKey: string,
    payload: JsonValue | SefinRequestPayload,
    options?: SefinCallOptions,
  ): Promise<SefinDocumentResponse>;
  getEvents(accessKey: string, options?: SefinCallOptions): Promise<SefinDocumentResponse>;
  getEventsByType(
    accessKey: string,
    eventType: string,
    options?: SefinCallOptions,
  ): Promise<SefinDocumentResponse>;
  getEvent(
    accessKey: string,
    eventType: string,
    sequence: string | number,
    options?: SefinCallOptions,
  ): Promise<SefinDocumentResponse>;
  getAdnDocument(nsu: string, options?: SefinCallOptions): Promise<SefinDocumentResponse>;
  getAdnEvents(accessKey: string, options?: SefinCallOptions): Promise<SefinDocumentResponse>;
  request(request: SefinHttpRequest): Promise<SefinHttpResponse>;
}

export function createSefinClient(options: SefinClientOptions): SefinClient {
  const environment = options.environment ?? "restricted-production";
  const endpoints = resolveSefinEndpoints(environment, options.endpoints);
  const retry = normalizeRetryOptions(options);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  assertPositiveInteger(timeoutMs, "timeoutMs");

  const execute = (request: SefinHttpRequest): Promise<SefinHttpResponse> =>
    executeWithRetry(request, options, retry);

  return {
    submitDps(xmlOrPayload, callOptions) {
      const payload =
        typeof xmlOrPayload === "string" ? xmlRequestPayload(xmlOrPayload) : xmlOrPayload;
      return documentRequest(
        execute,
        endpoints,
        "submit-dps",
        "POST",
        "nfse",
        payload,
        callOptions,
        timeoutMs,
      );
    },
    getNfse(accessKey, callOptions) {
      return documentRequest(
        execute,
        endpoints,
        "get-nfse",
        "GET",
        `nfse/${pathSegment(accessKey, "accessKey")}`,
        undefined,
        callOptions,
        timeoutMs,
      );
    },
    getDpsAccessKey(dpsId, callOptions) {
      return valueRequest(
        execute,
        endpoints,
        "get-dps-access-key",
        "GET",
        `dps/${pathSegment(dpsId, "dpsId")}`,
        callOptions,
        timeoutMs,
      );
    },
    async hasNfseForDps(dpsId, callOptions) {
      const response = await execute(
        createRequest(
          endpoints.sefin,
          "has-nfse-for-dps",
          "HEAD",
          `dps/${pathSegment(dpsId, "dpsId")}`,
          undefined,
          callOptions,
          timeoutMs,
        ),
      );
      if (response.status >= 400 && response.status !== 404) {
        throw new SefinTransportError(
          "http-error",
          `DPS existence query returned HTTP ${response.status}`,
          { operation: "has-nfse-for-dps", status: response.status },
        );
      }
      return {
        ...metadata("has-nfse-for-dps", response),
        exists: response.status >= 200 && response.status < 300,
      };
    },
    registerEvent(accessKey, value, callOptions) {
      const payload = isRequestPayload(value) ? value : jsonRequestPayload(value);
      return documentRequest(
        execute,
        endpoints,
        "register-event",
        "POST",
        `nfse/${pathSegment(accessKey, "accessKey")}/eventos`,
        payload,
        callOptions,
        timeoutMs,
      );
    },
    getEvents(accessKey, callOptions) {
      return documentRequest(
        execute,
        endpoints,
        "get-events",
        "GET",
        `nfse/${pathSegment(accessKey, "accessKey")}/eventos`,
        undefined,
        callOptions,
        timeoutMs,
      );
    },
    getEventsByType(accessKey, eventType, callOptions) {
      return documentRequest(
        execute,
        endpoints,
        "get-event-type",
        "GET",
        `nfse/${pathSegment(accessKey, "accessKey")}/eventos/${pathSegment(eventType, "eventType")}`,
        undefined,
        callOptions,
        timeoutMs,
      );
    },
    getEvent(accessKey, eventType, sequence, callOptions) {
      return documentRequest(
        execute,
        endpoints,
        "get-event",
        "GET",
        `nfse/${pathSegment(accessKey, "accessKey")}/eventos/${pathSegment(eventType, "eventType")}/${pathSegment(String(sequence), "sequence")}`,
        undefined,
        callOptions,
        timeoutMs,
      );
    },
    getAdnDocument(nsu, callOptions) {
      return documentRequest(
        execute,
        endpoints,
        "get-adn-document",
        "GET",
        `DFe/${pathSegment(nsu, "nsu")}`,
        undefined,
        callOptions,
        timeoutMs,
        endpoints.adnContributor,
      );
    },
    getAdnEvents(accessKey, callOptions) {
      return documentRequest(
        execute,
        endpoints,
        "get-adn-events",
        "GET",
        `NFSe/${pathSegment(accessKey, "accessKey")}/Eventos`,
        undefined,
        callOptions,
        timeoutMs,
        endpoints.adnContributor,
      );
    },
    request: execute,
  };
}

interface NormalizedRetryOptions {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly statuses: ReadonlySet<number>;
}

async function executeWithRetry(
  request: SefinHttpRequest,
  options: SefinClientOptions,
  retry: NormalizedRetryOptions,
): Promise<SefinHttpResponse> {
  const retryableMethod = request.method === "GET" || request.method === "HEAD";
  const maxAttempts = retryableMethod ? retry.maxAttempts : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const started = Date.now();
    log(options, {
      phase: "request",
      operation: request.operation,
      method: request.method,
      attempt,
    });
    try {
      const response = await options.transport.request(request);
      const durationMs = Date.now() - started;
      if (
        attempt < maxAttempts &&
        retry.statuses.has(response.status) &&
        !request.signal?.aborted
      ) {
        const delay = retryDelay(attempt, retry, response.headers["retry-after"]);
        log(options, {
          phase: "retry",
          operation: request.operation,
          method: request.method,
          attempt,
          durationMs,
          status: response.status,
        });
        await sleep(options, delay, request.signal);
        continue;
      }
      log(options, {
        phase: "response",
        operation: request.operation,
        method: request.method,
        attempt,
        durationMs,
        status: response.status,
      });
      return response;
    } catch (error) {
      const normalized = normalizeTransportError(request, attempt, error);
      const canRetry =
        attempt < maxAttempts &&
        (normalized.code === "network-error" || normalized.code === "timeout") &&
        !request.signal?.aborted;
      log(options, {
        phase: canRetry ? "retry" : "error",
        operation: request.operation,
        method: request.method,
        attempt,
        durationMs: Date.now() - started,
        errorCode: normalized.code,
      });
      if (!canRetry) {
        throw normalized;
      }
      await sleep(options, retryDelay(attempt, retry), request.signal);
    }
  }
  throw new SefinTransportError("network-error", "retry loop ended unexpectedly", {
    operation: request.operation,
  });
}

async function documentRequest(
  execute: (request: SefinHttpRequest) => Promise<SefinHttpResponse>,
  endpoints: SefinEndpoints,
  operation: SefinOperation,
  method: SefinHttpMethod,
  path: string,
  payload: SefinRequestPayload | undefined,
  options: SefinCallOptions | undefined,
  defaultTimeoutMs: number,
  baseUrl = endpoints.sefin,
): Promise<SefinDocumentResponse> {
  const response = await execute(
    createRequest(baseUrl, operation, method, path, payload, options, defaultTimeoutMs),
  );
  const body = decodeBody(response.body);
  try {
    return {
      ...metadata(operation, response),
      payload: parseSefinDocumentResponse(body, {
        status: response.status,
        ...(response.headers["content-type"]
          ? { contentType: response.headers["content-type"] }
          : {}),
      }),
    };
  } catch (error) {
    if (error instanceof SefinResponseParseError) {
      throw new SefinTransportError(
        "invalid-response",
        "SEFIN returned an invalid document response",
        { operation, status: response.status },
        { cause: error },
      );
    }
    throw error;
  }
}

async function valueRequest(
  execute: (request: SefinHttpRequest) => Promise<SefinHttpResponse>,
  endpoints: SefinEndpoints,
  operation: SefinOperation,
  method: SefinHttpMethod,
  path: string,
  options: SefinCallOptions | undefined,
  defaultTimeoutMs: number,
): Promise<SefinValueResponse> {
  const response = await execute(
    createRequest(endpoints.sefin, operation, method, path, undefined, options, defaultTimeoutMs),
  );
  return {
    ...metadata(operation, response),
    value: parseResponseValue(decodeBody(response.body)),
  };
}

function createRequest(
  baseUrl: string,
  operation: SefinOperation,
  method: SefinHttpMethod,
  path: string,
  payload: SefinRequestPayload | undefined,
  options: SefinCallOptions | undefined,
  defaultTimeoutMs: number,
): SefinHttpRequest {
  const headers = normalizeHeaders({
    accept: "application/json, application/xml, text/xml",
    ...(payload ? { "content-type": payload.contentType } : {}),
    ...options?.headers,
  });
  const body = payload
    ? typeof payload.body === "string"
      ? Buffer.from(payload.body, "utf8")
      : Buffer.from(payload.body)
    : undefined;
  const timeoutMs = options?.timeoutMs ?? defaultTimeoutMs;
  assertPositiveInteger(timeoutMs, "timeoutMs");
  return {
    operation,
    method,
    url: appendEndpointPath(baseUrl, path),
    headers,
    ...(body ? { body } : {}),
    ...(options?.signal ? { signal: options.signal } : {}),
    timeoutMs,
  };
}

function metadata(operation: SefinOperation, response: SefinHttpResponse): SefinResponseMetadata {
  return {
    operation,
    status: response.status,
    headers: response.headers,
    url: response.url,
  };
}

function parseResponseValue(body: string): JsonValue | string | null {
  const trimmed = body.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as JsonValue;
  } catch {
    return body;
  }
}

function decodeBody(body: Uint8Array): string {
  return Buffer.from(body).toString("utf8");
}

function isRequestPayload(value: JsonValue | SefinRequestPayload): value is SefinRequestPayload {
  return (
    value !== null &&
    !Array.isArray(value) &&
    typeof value === "object" &&
    "body" in value &&
    "contentType" in value
  );
}

function pathSegment(value: string, name: string): string {
  if (!value) {
    throw new SefinTransportError("invalid-config", `${name} must not be empty`);
  }
  return encodeURIComponent(value);
}

function normalizeHeaders(
  headers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    result[name.toLowerCase()] = value;
  }
  return result;
}

function normalizeRetryOptions(options: SefinClientOptions): NormalizedRetryOptions {
  const maxAttempts = options.retry?.maxAttempts ?? 3;
  const baseDelayMs = options.retry?.baseDelayMs ?? 250;
  const maxDelayMs = options.retry?.maxDelayMs ?? 2_000;
  assertPositiveInteger(maxAttempts, "retry.maxAttempts");
  assertNonNegativeInteger(baseDelayMs, "retry.baseDelayMs");
  assertNonNegativeInteger(maxDelayMs, "retry.maxDelayMs");
  if (maxDelayMs < baseDelayMs) {
    throw new SefinTransportError(
      "invalid-config",
      "retry.maxDelayMs must be greater than or equal to retry.baseDelayMs",
    );
  }
  return {
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    statuses: new Set(options.retry?.statuses ?? DEFAULT_RETRY_STATUSES),
  };
}

function retryDelay(attempt: number, retry: NormalizedRetryOptions, retryAfter?: string): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, retry.maxDelayMs);
    }
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) {
      return Math.min(Math.max(date - Date.now(), 0), retry.maxDelayMs);
    }
  }
  return Math.min(retry.baseDelayMs * 2 ** (attempt - 1), retry.maxDelayMs);
}

async function sleep(
  options: SefinClientOptions,
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  if (options.sleep) {
    await options.sleep(milliseconds, signal);
    return;
  }
  if (signal?.aborted) {
    throw new SefinTransportError("aborted", "request was aborted during retry delay");
  }
  await new Promise<void>((resolve, reject) => {
    const finish = (): void => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const abort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new SefinTransportError("aborted", "request was aborted during retry delay"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function normalizeTransportError(
  request: SefinHttpRequest,
  attempt: number,
  error: unknown,
): SefinTransportError {
  if (error instanceof SefinTransportError) {
    return new SefinTransportError(
      error.code,
      error.message.replace(/^SEFIN transport failed: /, ""),
      { ...error.context, operation: request.operation, attempt },
      { cause: error.cause },
    );
  }
  return new SefinTransportError(
    "network-error",
    error instanceof Error ? error.message : "transport request failed",
    { operation: request.operation, attempt },
    { cause: error },
  );
}

function log(options: SefinClientOptions, event: SefinLogEvent): void {
  try {
    options.logger?.(event);
  } catch {
    // Logging must not alter fiscal request behavior.
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new SefinTransportError("invalid-config", `${name} must be a positive safe integer`);
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SefinTransportError("invalid-config", `${name} must be a non-negative safe integer`);
  }
}
