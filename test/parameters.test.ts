import { describe, expect, it } from "vitest";
import { decimal1v2 } from "../src/core/index.js";
import type { SefinTransportError } from "../src/index.js";
import {
  createMunicipalParameterResolver,
  type MunicipalParameterClient,
  type MunicipalParameterQuery,
} from "../src/parameters/index.js";
import type { SefinCallOptions, SefinValueResponse } from "../src/transport/index.js";

const QUERY: MunicipalParameterQuery = {
  municipality: "3550308",
  serviceCode: "010101",
  contributorTaxId: "12345678000195",
};
const QUERY_WITHOUT_CONTRIBUTOR: MunicipalParameterQuery = {
  municipality: "3550308",
  serviceCode: "010101",
};

describe("municipal parameter resolver", () => {
  it("maps lossless API snapshots into the pure validation contract", async () => {
    const client = new ParameterClient();
    const resolver = createMunicipalParameterResolver({
      client,
      now: () => Date.parse("2026-06-12T12:00:00Z"),
      map(snapshot) {
        expect(snapshot.query).toEqual(QUERY);
        expect(snapshot.convention.value).toEqual({ requiresIm: true });
        expect(snapshot.service.value).toEqual({ rate: "5.00" });
        expect(snapshot.contributor?.value).toEqual({ withholding: ["1", "2"] });
        return {
          providerMunicipalRegistrationRequired: true,
          allowedDeductionModes: ["percentage", "value"],
          issqnRate: decimal1v2("5.00"),
          allowedWithholding: ["1", "2"],
          allowedBenefitIds: ["12345678901234"],
        };
      },
    });

    await expect(resolver.resolve(QUERY)).resolves.toEqual({
      municipality: "3550308",
      serviceCode: "010101",
      providerMunicipalRegistrationRequired: true,
      allowedDeductionModes: ["percentage", "value"],
      issqnRate: "5.00",
      allowedWithholding: ["1", "2"],
      allowedBenefitIds: ["12345678901234"],
      resolvedAt: "2026-06-12T12:00:00.000Z",
      source: "National NFS-e municipal parameter APIs",
    });
    expect(client.calls).toEqual(["convention", "service", "contributor"]);
  });

  it("caches by query, expires entries, and supports invalidation and bypass", async () => {
    let now = 1_000;
    const client = new ParameterClient();
    const resolver = createMunicipalParameterResolver({
      client,
      ttlMs: 100,
      now: () => now,
      map: () => ({ source: "test" }),
    });

    const first = await resolver.resolve(QUERY);
    expect(await resolver.resolve(QUERY)).toBe(first);
    expect(client.calls).toHaveLength(3);
    expect(resolver.size).toBe(1);

    await resolver.resolve(QUERY, { bypassCache: true });
    expect(client.calls).toHaveLength(6);
    expect(resolver.invalidate(QUERY)).toBe(true);
    expect(resolver.size).toBe(0);

    await resolver.resolve(QUERY);
    now += 101;
    await resolver.resolve(QUERY);
    expect(client.calls).toHaveLength(12);
    resolver.clear();
    expect(resolver.size).toBe(0);
  });

  it("deduplicates concurrent lookups and bounds cache entries", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client = new ParameterClient(gate);
    const resolver = createMunicipalParameterResolver({
      client,
      maxEntries: 1,
      map: () => ({}),
    });

    const first = resolver.resolve(QUERY);
    const second = resolver.resolve(QUERY);
    expect(client.calls).toEqual(["convention", "service", "contributor"]);
    release?.();
    expect(await second).toBe(await first);

    await resolver.resolve({ municipality: "3550308", serviceCode: "020202" });
    expect(resolver.size).toBe(1);
    expect(resolver.invalidate(QUERY)).toBe(false);
  });

  it("gives shared waiters independent abort and timeout behavior", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client = new ParameterClient(gate);
    const resolver = createMunicipalParameterResolver({
      client,
      map: () => ({ source: "shared" }),
    });
    const first = resolver.resolve(QUERY);
    const controller = new AbortController();
    const aborted = resolver.resolve(QUERY, { signal: controller.signal });
    const timedOut = resolver.resolve(QUERY, { timeoutMs: 5 });
    controller.abort();

    await expect(aborted).rejects.toEqual(
      expect.objectContaining<Partial<SefinTransportError>>({ code: "aborted" }),
    );
    await expect(timedOut).rejects.toEqual(
      expect.objectContaining<Partial<SefinTransportError>>({ code: "timeout" }),
    );
    expect(client.calls).toEqual(["convention", "service", "contributor"]);

    release?.();
    await expect(first).resolves.toEqual(expect.objectContaining({ source: "shared" }));
    expect(resolver.size).toBe(1);
  });

  it("does not share or cache calls carrying per-call headers", async () => {
    const client = new ParameterClient();
    const resolver = createMunicipalParameterResolver({
      client,
      map: () => ({ source: "private" }),
    });

    await resolver.resolve(QUERY, { headers: { authorization: "Bearer tenant-a" } });
    await resolver.resolve(QUERY, { headers: { authorization: "Bearer tenant-b" } });

    expect(client.calls).toHaveLength(6);
    expect(resolver.size).toBe(0);
    expect(client.options.filter((value) => value?.headers)).toEqual([
      expect.objectContaining({ headers: { authorization: "Bearer tenant-a" } }),
      expect.objectContaining({ headers: { authorization: "Bearer tenant-a" } }),
      expect.objectContaining({ headers: { authorization: "Bearer tenant-a" } }),
      expect.objectContaining({ headers: { authorization: "Bearer tenant-b" } }),
      expect.objectContaining({ headers: { authorization: "Bearer tenant-b" } }),
      expect.objectContaining({ headers: { authorization: "Bearer tenant-b" } }),
    ]);
  });

  it("starts TTL at completion rather than request start", async () => {
    let now = 1_000;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client = new ParameterClient(gate);
    const resolver = createMunicipalParameterResolver({
      client,
      ttlMs: 100,
      now: () => now,
      map: () => ({}),
    });

    const pending = resolver.resolve(QUERY);
    now = 5_000;
    release?.();
    const completed = await pending;
    expect(completed.resolvedAt).toBe(new Date(5_000).toISOString());

    now = 5_099;
    expect(await resolver.resolve(QUERY)).toBe(completed);
    expect(client.calls).toHaveLength(3);

    now = 5_101;
    await resolver.resolve(QUERY);
    expect(client.calls).toHaveLength(6);
  });

  it("prevents invalidated, cleared, and older refreshes from repopulating cache", async () => {
    const invalidationRounds = [deferredRound(1), deferredRound(2)];
    const invalidationClient = new VersionedParameterClient(invalidationRounds);
    const invalidationResolver = versionedResolver(invalidationClient);
    const invalidated = invalidationResolver.resolve(QUERY_WITHOUT_CONTRIBUTOR);
    expect(invalidationResolver.invalidate(QUERY_WITHOUT_CONTRIBUTOR)).toBe(true);
    const current = invalidationResolver.resolve(QUERY_WITHOUT_CONTRIBUTOR);
    invalidationRounds[1]?.release();
    const currentValue = await current;
    invalidationRounds[0]?.release();
    await invalidated;
    expect(await invalidationResolver.resolve(QUERY_WITHOUT_CONTRIBUTOR)).toBe(currentValue);
    expect(currentValue.source).toBe("version-2");

    const refreshRounds = [deferredRound(1), deferredRound(2)];
    const refreshClient = new VersionedParameterClient(refreshRounds);
    const refreshResolver = versionedResolver(refreshClient);
    const older = refreshResolver.resolve(QUERY_WITHOUT_CONTRIBUTOR);
    const newer = refreshResolver.resolve(QUERY_WITHOUT_CONTRIBUTOR, { bypassCache: true });
    refreshRounds[1]?.release();
    const newerValue = await newer;
    refreshRounds[0]?.release();
    await older;
    expect(await refreshResolver.resolve(QUERY_WITHOUT_CONTRIBUTOR)).toBe(newerValue);
    expect(newerValue.source).toBe("version-2");

    const clearRound = deferredRound(1);
    const clearClient = new VersionedParameterClient([clearRound]);
    const clearResolver = versionedResolver(clearClient);
    const stale = clearResolver.resolve(QUERY_WITHOUT_CONTRIBUTOR);
    clearResolver.clear();
    clearRound.release();
    await stale;
    expect(clearResolver.size).toBe(0);
  });

  it("passes call controls through and rejects invalid cache/query configuration", async () => {
    const client = new ParameterClient();
    const resolver = createMunicipalParameterResolver({
      client,
      map: () => ({}),
    });
    const controller = new AbortController();
    await resolver.resolve(QUERY, {
      signal: controller.signal,
      timeoutMs: 123,
      headers: { "x-correlation-id": "abc" },
    });
    expect(client.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signal: controller.signal,
          timeoutMs: 123,
          headers: { "x-correlation-id": "abc" },
        }),
      ]),
    );

    await expect(resolver.resolve({ municipality: "35", serviceCode: "1" })).rejects.toEqual(
      expect.objectContaining<Partial<SefinTransportError>>({ code: "invalid-config" }),
    );
    expect(() =>
      createMunicipalParameterResolver({ client, map: () => ({}), ttlMs: 0 }),
    ).toThrowError(
      expect.objectContaining<Partial<SefinTransportError>>({ code: "invalid-config" }),
    );
    expect(() =>
      createMunicipalParameterResolver({ client, map: () => ({}), maxEntries: 0 }),
    ).toThrowError(
      expect.objectContaining<Partial<SefinTransportError>>({ code: "invalid-config" }),
    );
  });
});

class ParameterClient implements MunicipalParameterClient {
  readonly calls: string[] = [];
  readonly options: (SefinCallOptions | undefined)[] = [];

  constructor(private readonly gate?: Promise<void>) {}

  async getMunicipalConvention(
    _municipality: string,
    options?: SefinCallOptions,
  ): Promise<SefinValueResponse> {
    this.calls.push("convention");
    this.options.push(options);
    await this.gate;
    return valueResponse("get-municipal-convention", { requiresIm: true });
  }

  async getMunicipalServiceParameters(
    _municipality: string,
    _serviceCode: string,
    options?: SefinCallOptions,
  ): Promise<SefinValueResponse> {
    this.calls.push("service");
    this.options.push(options);
    await this.gate;
    return valueResponse("get-municipal-service", { rate: "5.00" });
  }

  async getMunicipalContributorParameters(
    _municipality: string,
    _taxId: string,
    options?: SefinCallOptions,
  ): Promise<SefinValueResponse> {
    this.calls.push("contributor");
    this.options.push(options);
    await this.gate;
    return valueResponse("get-municipal-contributor", { withholding: ["1", "2"] });
  }
}

interface DeferredRound {
  readonly gate: Promise<void>;
  readonly version: number;
  release(): void;
}

class VersionedParameterClient implements MunicipalParameterClient {
  private conventionIndex = 0;
  private serviceIndex = 0;

  constructor(private readonly rounds: readonly DeferredRound[]) {}

  async getMunicipalConvention(): Promise<SefinValueResponse> {
    const round = this.rounds[this.conventionIndex++];
    if (!round) {
      throw new Error("missing convention round");
    }
    await round.gate;
    return valueResponse("get-municipal-convention", { version: round.version });
  }

  async getMunicipalServiceParameters(): Promise<SefinValueResponse> {
    const round = this.rounds[this.serviceIndex++];
    if (!round) {
      throw new Error("missing service round");
    }
    await round.gate;
    return valueResponse("get-municipal-service", { version: round.version });
  }

  async getMunicipalContributorParameters(): Promise<SefinValueResponse> {
    throw new Error("contributor lookup was not expected");
  }
}

function deferredRound(version: number): DeferredRound {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    gate,
    version,
    release() {
      release?.();
    },
  };
}

function versionedResolver(client: MunicipalParameterClient) {
  return createMunicipalParameterResolver({
    client,
    map(snapshot) {
      const service = snapshot.service.value as { readonly version: number };
      return { source: `version-${service.version}` };
    },
  });
}

function valueResponse(
  operation: SefinValueResponse["operation"],
  value: SefinValueResponse["value"],
): SefinValueResponse {
  return {
    operation,
    status: 200,
    headers: { "content-type": "application/json" },
    url: "https://parameters.test",
    value,
  };
}
