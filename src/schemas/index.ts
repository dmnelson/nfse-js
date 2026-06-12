import { NATIONAL_NFSE_V1_01_SCHEMAS } from "./generated.js";
import type {
  NationalNfseSchema,
  NationalNfseSchemaSet,
  NationalNfseVersion,
  SchemaFile,
} from "./types.js";

export const nationalNfseVersion = "1.01";
export const SUPPORTED_NATIONAL_NFSE_VERSIONS = ["1.01"] as const;

export function getNationalNfseSchemas(
  version: NationalNfseVersion = nationalNfseVersion,
): readonly SchemaFile[] {
  assertSupportedNationalNfseVersion(version);
  return NATIONAL_NFSE_V1_01_SCHEMAS;
}

export function getNationalNfseSchema(
  fileName: NationalNfseSchema,
  version: NationalNfseVersion = nationalNfseVersion,
): SchemaFile {
  const schema = getNationalNfseSchemas(version).find(
    (candidate) => candidate.fileName === fileName,
  );
  if (!schema) {
    throw new Error(`Bundled National NFS-e schema not found: ${fileName}`);
  }
  return schema;
}

export function getNationalNfseSchemaSet(
  version: NationalNfseVersion = nationalNfseVersion,
): NationalNfseSchemaSet {
  return { version, files: getNationalNfseSchemas(version) };
}

export function isSupportedNationalNfseVersion(value: string): value is NationalNfseVersion {
  return (SUPPORTED_NATIONAL_NFSE_VERSIONS as readonly string[]).includes(value);
}

export function assertSupportedNationalNfseVersion(
  value: string,
): asserts value is NationalNfseVersion {
  if (!isSupportedNationalNfseVersion(value)) {
    throw new RangeError(
      `Unsupported National NFS-e version ${value}; supported versions: ${SUPPORTED_NATIONAL_NFSE_VERSIONS.join(", ")}`,
    );
  }
}

export type {
  NationalNfseSchema,
  NationalNfseSchemaSet,
  NationalNfseVersion,
  SchemaFile,
} from "./types.js";
