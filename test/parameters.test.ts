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
