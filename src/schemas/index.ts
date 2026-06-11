import { NATIONAL_NFSE_V1_01_SCHEMAS } from "./generated.js";
import type { NationalNfseSchema, SchemaFile } from "./types.js";

export const nationalNfseVersion = "1.01";

export function getNationalNfseSchemas(): readonly SchemaFile[] {
  return NATIONAL_NFSE_V1_01_SCHEMAS;
}

export function getNationalNfseSchema(fileName: NationalNfseSchema): SchemaFile {
  const schema = NATIONAL_NFSE_V1_01_SCHEMAS.find((candidate) => candidate.fileName === fileName);
  if (!schema) {
    throw new Error(`Bundled National NFS-e schema not found: ${fileName}`);
  }
  return schema;
}

export type { NationalNfseSchema, SchemaFile } from "./types.js";
