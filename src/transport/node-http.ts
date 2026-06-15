import type { ClientRequest, IncomingHttpHeaders } from "node:http";
import { request as requestHttp, validateHeaderName, validateHeaderValue } from "node:http";
import type { RequestOptions as HttpsRequestOptions } from "node:https";
import { request as requestHttps } from "node:https";
import { SefinTransportError } from "../errors.js";
import { isLocalhost } from "./endpoints.js";
import type {
  NodeHttpTransportOptions,
  SefinHttpRequest,
  SefinHttpResponse,
  SefinHttpTransport,
  SefinTlsOptions,
} from "./types.js";

const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const FORBIDDEN_REQUEST_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export function createNodeHttpTransport(
  options: NodeHttpTransportOptions = {},
): SefinHttpTransport {
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0) {
    throw new SefinTransportError(
      "invalid-config",
      "maxResponseBytes must be a positive safe integer",
    );
  }

  return {
    request(request) {
      return executeNodeRequest(request, options, maxResponseBytes);
    },
  };
}

function executeNodeRequest(
  request: SefinHttpRequest,
  options: NodeHttpTransportOptions,
  maxResponseBytes: number,
): Promise<SefinHttpResponse> {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch (error) {
    return Promise.reject(
      new SefinTransportError(
        "invalid-config",
        "request URL is invalid",
        {
          operation: request.operation,
        },
        { cause: error },
      ),
    );
  }
  if (url.username || url.password) {
    return Promise.reject(
      new SefinTransportError("invalid-config", "request URL must not include credentials", {
        operation: request.operation,
      }),
    );
  }
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      options.allowInsecureLocalhost === true &&
      isLocalhost(url.hostname)
    )
  ) {
    return Promise.reject(
      new SefinTransportError(
        "invalid-config",
        "request URL must use HTTPS unless insecure localhost access is explicitly enabled",
        {
          operation: request.operation,
        },
      ),
    );
  }
  if (request.signal?.aborted) {
    return Promise.reject(abortedError(request));
  }
  if (
    request.timeoutMs !== undefined &&
    (!Number.isSafeInteger(request.timeoutMs) || request.timeoutMs <= 0)
  ) {
    return Promise.reject(
      new SefinTransportError("invalid-config", "timeoutMs must be a positive safe integer", {
        operation: request.operation,
      }),
    );
  }

  let headers: Readonly<Record<string, string>>;
  try {
    headers = prepareRequestHeaders(request, options);
  } catch (error) {
    return Promise.reject(normalizeConfigurationError(request, error));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = (): boolean => {
      if (settled) {
        return false;
      }
      settled = true;
      if (deadlineTimer) {
        clearTimeout(deadlineTimer);
      }
      request.signal?.removeEventListener("abort", abort);
      return true;
    };
    const fail = (error: SefinTransportError): void => {
      if (cleanup()) {
        reject(error);
      }
    };
    const succeed = (response: SefinHttpResponse): void => {
      if (cleanup()) {
        resolve(response);
      }
    };
    const requestOptions: HttpsRequestOptions = {
      method: request.method,
      headers,
      ...(url.protocol === "https:" ? tlsRequestOptions(options.tls) : {}),
    };
    const requestFunction = url.protocol === "https:" ? requestHttps : requestHttp;
    let clientRequest: ClientRequest | undefined;
    const abort = (): void => {
      const error = abortedError(request);
      clientRequest?.destroy(error);
      fail(error);
    };

    try {
      clientRequest = requestFunction(url, requestOptions, (response) => {
        const declaredLength = Number(response.headers["content-length"]);
        if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
          response.destroy(responseTooLargeError(request, maxResponseBytes));
          return;
        }

        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.byteLength;
          if (bytes > maxResponseBytes) {
            response.destroy(responseTooLargeError(request, maxResponseBytes));
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", (error) => {
          fail(normalizeRequestError(request, error));
        });
        response.on("end", () => {
          succeed({
            status: response.statusCode ?? 0,
            headers: normalizeResponseHeaders(response.headers),
            body: Buffer.concat(chunks),
            url: request.url,
          });
        });
      });
    } catch (error) {
      fail(normalizeConfigurationError(request, error));
      return;
    }
    request.signal?.addEventListener("abort", abort, { once: true });
    if (request.signal?.aborted) {
      abort();
      return;
    }
    clientRequest.on("error", (error) => {
      fail(normalizeRequestError(request, error));
    });
    if (request.timeoutMs !== undefined) {
      deadlineTimer = setTimeout(() => {
        const error = timeoutError(request);
        clientRequest?.destroy(error);
        fail(error);
      }, request.timeoutMs);
    }
    if (request.body) {
      clientRequest.write(request.body);
    }
    clientRequest.end();
  });
}

function prepareRequestHeaders(
  request: SefinHttpRequest,
  options: NodeHttpTransportOptions,
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  const entries = [
    ...(options.userAgent === undefined ? [] : [["user-agent", options.userAgent] as const]),
    ...Object.entries(request.headers),
  ];
  for (const [name, value] of entries) {
    validateHeaderName(name);
    validateHeaderValue(name, value);
    const normalizedName = name.toLowerCase();
    if (FORBIDDEN_REQUEST_HEADERS.has(normalizedName)) {
      throw new TypeError(`request header ${normalizedName} is managed by the transport`);
    }
    if (normalizedName in result && result[normalizedName] !== value) {
      throw new TypeError(`request header ${normalizedName} was provided more than once`);
    }
    result[normalizedName] = value;
  }
  if (request.body !== undefined) {
    result["content-length"] = String(request.body.byteLength);
  }
  return result;
}

function tlsRequestOptions(tls: SefinTlsOptions | undefined): HttpsRequestOptions {
  if (!tls) {
    return {};
  }
  return {
    ...(tls.ca === undefined
      ? {}
      : {
          ca: normalizeCertificateAuthorities(tls.ca),
        }),
    ...(tls.cert === undefined ? {} : { cert: Buffer.from(tls.cert) }),
    ...(tls.key === undefined ? {} : { key: Buffer.from(tls.key) }),
    ...(tls.pfx === undefined ? {} : { pfx: Buffer.from(tls.pfx) }),
    ...(tls.passphrase === undefined ? {} : { passphrase: tls.passphrase }),
    ...(tls.rejectUnauthorized === undefined ? {} : { rejectUnauthorized: tls.rejectUnauthorized }),
    ...(tls.servername === undefined ? {} : { servername: tls.servername }),
  };
}

function normalizeCertificateAuthorities(
  ca: NonNullable<SefinTlsOptions["ca"]>,
): Buffer | Buffer[] {
  if (typeof ca === "string" || ArrayBuffer.isView(ca)) {
    return Buffer.from(ca);
  }
  return ca.map((entry) => Buffer.from(entry));
}

function normalizeResponseHeaders(headers: IncomingHttpHeaders): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) {
      result[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
    }
  }
  return result;
}

function abortedError(request: SefinHttpRequest): SefinTransportError {
  return new SefinTransportError("aborted", "request was aborted", {
    operation: request.operation,
  });
}

function timeoutError(request: SefinHttpRequest): SefinTransportError {
  return new SefinTransportError("timeout", `request exceeded ${request.timeoutMs} ms`, {
    operation: request.operation,
  });
}

function responseTooLargeError(
  request: SefinHttpRequest,
  maxResponseBytes: number,
): SefinTransportError {
  return new SefinTransportError(
    "response-too-large",
    `response exceeded ${maxResponseBytes} bytes`,
    { operation: request.operation },
  );
}

function normalizeRequestError(request: SefinHttpRequest, error: unknown): SefinTransportError {
  if (error instanceof SefinTransportError) {
    return error;
  }
  return new SefinTransportError(
    "network-error",
    error instanceof Error ? error.message : "network request failed",
    { operation: request.operation },
    { cause: error },
  );
}

function normalizeConfigurationError(
  request: SefinHttpRequest,
  error: unknown,
): SefinTransportError {
  if (error instanceof SefinTransportError) {
    return error;
  }
  return new SefinTransportError(
    "invalid-config",
    error instanceof Error ? error.message : "invalid HTTP request configuration",
    { operation: request.operation },
    { cause: error },
  );
}
