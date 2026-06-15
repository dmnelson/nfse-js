import type { ResolvedMunicipalParameters } from "../core/semantic-validation.js";
import { SefinTransportError } from "../errors.js";
import type {
  MunicipalParameterQuery,
  MunicipalParameterResolveOptions,
  MunicipalParameterResolver,
  MunicipalParameterResolverOptions,
  MunicipalParameterSnapshot,
} from "./types.js";

const DEFAULT_TTL_MS = 5 * 60 * 1_000;
const DEFAULT_MAX_ENTRIES = 100;
const DEFAULT_SOURCE = "National NFS-e municipal parameter APIs";

interface CacheEntry {
  readonly expiresAt: number;
  readonly value: ResolvedMunicipalParameters;
}

interface InFlightEntry {
  readonly promise: Promise<ResolvedMunicipalParameters>;
}

export function createMunicipalParameterResolver(
  options: MunicipalParameterResolverOptions,
): MunicipalParameterResolver {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  assertPositiveInteger(ttlMs, "ttlMs");
  assertPositiveInteger(maxEntries, "maxEntries");
  const now = options.now ?? Date.now;
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, InFlightEntry>();
  const latestRequests = new Map<string, number>();
  let nextRequestId = 0;

  return {
    async resolve(query, resolveOptions = {}) {
      validateQuery(query);
      validateResolveOptions(resolveOptions);
      if (resolveOptions.signal?.aborted) {
        throw abortedError();
      }
      if (hasPrivateHeaders(resolveOptions)) {
        return waitForCaller(
          resolveParameters(options, query, resolveOptions, now),
          resolveOptions,
        );
      }

      const key = cacheKey(query);
      const currentTime = now();
      if (!resolveOptions.bypassCache) {
        const cached = cache.get(key);
        if (cached && cached.expiresAt > currentTime) {
          return cached.value;
        }
        cache.delete(key);
        const pending = inFlight.get(key);
        if (pending) {
          return waitForCaller(pending.promise, resolveOptions);
        }
      }

      const requestId = ++nextRequestId;
      latestRequests.set(key, requestId);
      let entry: InFlightEntry;
      const pending = resolveParameters(options, query, {}, now)
        .then((value) => {
          if (latestRequests.get(key) === requestId) {
            setCacheEntry(cache, key, value, now() + ttlMs, maxEntries);
          }
          return value;
        })
        .finally(() => {
          if (inFlight.get(key) === entry) {
            inFlight.delete(key);
          }
          if (latestRequests.get(key) === requestId) {
            latestRequests.delete(key);
          }
        });
      entry = { promise: pending };
      inFlight.set(key, entry);
      return waitForCaller(pending, resolveOptions);
    },
    invalidate(query) {
      validateQuery(query);
      const key = cacheKey(query);
      const existed = cache.delete(key) || inFlight.has(key);
      latestRequests.delete(key);
      inFlight.delete(key);
      return existed;
    },
    clear() {
      cache.clear();
      inFlight.clear();
      latestRequests.clear();
    },
    get size() {
      return cache.size;
    },
  };
}

async function resolveParameters(
  options: MunicipalParameterResolverOptions,
  query: MunicipalParameterQuery,
  resolveOptions: MunicipalParameterResolveOptions,
  now: () => number,
): Promise<ResolvedMunicipalParameters> {
  const callOptions = {
    ...(resolveOptions.signal ? { signal: resolveOptions.signal } : {}),
    ...(resolveOptions.timeoutMs === undefined ? {} : { timeoutMs: resolveOptions.timeoutMs }),
    ...(resolveOptions.headers ? { headers: resolveOptions.headers } : {}),
  };
  const conventionPromise = options.client.getMunicipalConvention(query.municipality, callOptions);
  const servicePromise = options.client.getMunicipalServiceParameters(
    query.municipality,
    query.serviceCode,
    callOptions,
  );
  const contributorPromise = query.contributorTaxId
    ? options.client.getMunicipalContributorParameters(
        query.municipality,
        query.contributorTaxId,
        callOptions,
      )
    : undefined;
  const [convention, service, contributor] = await Promise.all([
    conventionPromise,
    servicePromise,
    contributorPromise,
  ]);
  const snapshot: MunicipalParameterSnapshot = {
    query,
    convention,
    service,
    ...(contributor ? { contributor } : {}),
  };
  const mapped = await options.map(snapshot);
  const completedAt = now();
  return {
    municipality: query.municipality,
    serviceCode: query.serviceCode,
    ...mapped,
    resolvedAt: mapped.resolvedAt ?? new Date(completedAt).toISOString(),
    source: mapped.source ?? DEFAULT_SOURCE,
  };
}

function waitForCaller<T>(
  promise: Promise<T>,
  options: MunicipalParameterResolveOptions,
): Promise<T> {
  if (!options.signal && options.timeoutMs === undefined) {
    return promise;
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = (): boolean => {
      if (settled) {
        return false;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      options.signal?.removeEventListener("abort", abort);
      return true;
    };
    const succeed = (value: T): void => {
      if (cleanup()) {
        resolve(value);
      }
    };
    const fail = (error: unknown): void => {
      if (cleanup()) {
        reject(error);
      }
    };
    const abort = (): void => {
      fail(abortedError());
    };

    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) {
      abort();
      return;
    }
    if (options.timeoutMs !== undefined) {
      timer = setTimeout(() => {
        fail(
          new SefinTransportError(
            "timeout",
            `parameter resolution exceeded ${options.timeoutMs} ms`,
          ),
        );
      }, options.timeoutMs);
    }
    promise.then(succeed, fail);
  });
}

function hasPrivateHeaders(options: MunicipalParameterResolveOptions): boolean {
  return options.headers !== undefined && Object.keys(options.headers).length > 0;
}

function validateResolveOptions(options: MunicipalParameterResolveOptions): void {
  if (options.timeoutMs !== undefined) {
    assertPositiveInteger(options.timeoutMs, "timeoutMs");
  }
}

function abortedError(): SefinTransportError {
  return new SefinTransportError("aborted", "parameter resolution was aborted");
}

function setCacheEntry(
  cache: Map<string, CacheEntry>,
  key: string,
  value: ResolvedMunicipalParameters,
  expiresAt: number,
  maxEntries: number,
): void {
  cache.delete(key);
  while (cache.size >= maxEntries) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) {
      break;
    }
    cache.delete(oldest);
  }
  cache.set(key, { expiresAt, value });
}

function validateQuery(query: MunicipalParameterQuery): void {
  if (!/^\d{7}$/.test(query.municipality)) {
    throw new SefinTransportError(
      "invalid-config",
      "municipality must contain exactly seven digits",
    );
  }
  if (!/^\d{6}$/.test(query.serviceCode)) {
    throw new SefinTransportError("invalid-config", "serviceCode must contain exactly six digits");
  }
  if (query.contributorTaxId !== undefined && !/^(?:\d{11}|\d{14})$/.test(query.contributorTaxId)) {
    throw new SefinTransportError(
      "invalid-config",
      "contributorTaxId must contain 11 or 14 digits",
    );
  }
}

function cacheKey(query: MunicipalParameterQuery): string {
  return `${query.municipality}:${query.serviceCode}:${query.contributorTaxId ?? ""}`;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new SefinTransportError("invalid-config", `${name} must be a positive safe integer`);
  }
}
