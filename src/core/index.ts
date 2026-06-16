export { createDps } from "./create.js";
export {
  type DecimalOptions,
  decimal,
  decimal1v2,
  decimal2v2,
  decimal3v2,
  decimal15v2,
} from "./decimal.js";
export { type BuildDpsIdOptions, buildDpsId } from "./dps-id.js";
export {
  DPS_XSD_FACETS,
  type DpsFacetName,
  type FacetFailure,
  type StringFacet,
  validateFacet,
} from "./facets.js";
export {
  DPS_REFERENCE_DATA_FIELD_COVERAGE,
  DPS_REFERENCE_DATA_SETS,
  type DpsReferenceCodeRecord,
  type DpsReferenceCodeSet,
  type DpsReferenceDataFieldCoverage,
  type DpsReferenceDataProvider,
  type DpsReferenceDataSetDefinition,
  type DpsReferenceDataSetId,
  type DpsReferenceDataValidationOptions,
  type DpsReferenceLookupMatch,
  type DpsReferenceLookupResult,
  getDpsReferenceDataSetDefinition,
} from "./reference-data.js";
export {
  getNationalDpsRule,
  NATIONAL_DPS_RULES,
  type NationalDpsRule,
} from "./rules.js";
export {
  assertValidDps,
  type DpsValidationOptions,
  type ResolvedMunicipalParameters,
  type ValidationResult,
  validateDps,
  validateDpsWithMunicipalParameters,
  validateDpsWithReferenceData,
} from "./semantic-validation.js";
export { serializeDps } from "./serialize.js";
export { isValidCnpj, isValidCpf } from "./tax-id.js";
export * from "./types.js";
