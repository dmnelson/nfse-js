import type { ResolvedMunicipalParameters } from "../core/semantic-validation.js";
import type { SefinCallOptions, SefinValueResponse } from "../transport/types.js";

export interface MunicipalParameterQuery {
  readonly municipality: string;
  readonly serviceCode: string;
  readonly contributorTaxId?: string;
}

export interface MunicipalParameterClient {
  getMunicipalConvention(
    municipality: string,
    options?: SefinCallOptions,
  ): Promise<SefinValueResponse>;
  getMunicipalServiceParameters(
    municipality: string,
    serviceCode: string,
    options?: SefinCallOptions,
  ): Promise<SefinValueResponse>;
  getMunicipalContributorParameters(
    municipality: string,
    taxId: string,
    options?: SefinCallOptions,
  ): Promise<SefinValueResponse>;
}

export interface MunicipalParameterSnapshot {
  readonly query: MunicipalParameterQuery;
  readonly convention: SefinValueResponse;
  readonly service: SefinValueResponse;
  readonly contributor?: SefinValueResponse;
}

export type MunicipalParameterMapping = Omit<
  ResolvedMunicipalParameters,
  "municipality" | "serviceCode"
>;

export type MunicipalParameterMapper = (
  snapshot: MunicipalParameterSnapshot,
) => MunicipalParameterMapping | Promise<MunicipalParameterMapping>;

export interface MunicipalParameterResolverOptions {
  readonly client: MunicipalParameterClient;
  readonly map: MunicipalParameterMapper;
  readonly ttlMs?: number;
  readonly maxEntries?: number;
  readonly now?: () => number;
}

export interface MunicipalParameterResolveOptions extends SefinCallOptions {
  readonly bypassCache?: boolean;
}

export interface MunicipalParameterResolver {
  resolve(
    query: MunicipalParameterQuery,
    options?: MunicipalParameterResolveOptions,
  ): Promise<ResolvedMunicipalParameters>;
  invalidate(query: MunicipalParameterQuery): boolean;
  clear(): void;
  readonly size: number;
}
