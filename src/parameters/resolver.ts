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

export function createMunicipalParameterResolver(
  options: MunicipalParameterResolverOptions,
): MunicipalParameterResolver {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  assertPositiveInteger(ttlMs, "ttlMs");
  assertPositiveInteger(maxEntries, "maxEntries");
  const now = options.now ?? Date.now;
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<ResolvedMunicipalParameters>>();

  return {
    async resolve(query, resolveOptions = {}) {
      validateQuery(query);
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
          return pending;
        }
      }

      const pending = resolveParameters(options, query, resolveOptions, currentTime)
        .then((value) => {
          setCacheEntry(cache, key, value, currentTime + ttlMs, maxEntries);
          return value;
        })
        .finally(() => {
          inFlight.delete(key);
        });
      if (!resolveOptions.bypassCache) {
        inFlight.set(key, pending);
      }
      return pending;
    },
    invalidate(query) {
      validateQuery(query);
      return cache.delete(cacheKey(query));
    },
    clear() {
      cache.clear();
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
  resolvedAt: number,
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
  return {
    municipality: query.municipality,
    serviceCode: query.serviceCode,
    ...mapped,
    resolvedAt: mapped.resolvedAt ?? new Date(resolvedAt).toISOString(),
    source: mapped.source ?? DEFAULT_SOURCE,
  };
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
