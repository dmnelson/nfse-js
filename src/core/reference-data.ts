import type { ValidationSource } from "../errors.js";

export type DpsReferenceDataSetId =
  | "location-codes"
  | "country-codes"
  | "currency-codes"
  | "national-service-codes"
  | "nbs-codes"
  | "ibs-cbs-operation-codes"
  | "ibs-cbs-tax-situation-codes"
  | "ibs-cbs-tax-classification-codes"
  | "ibs-cbs-presumed-credit-codes";

export interface DpsReferenceDataSetDefinition {
  readonly id: DpsReferenceDataSetId;
  readonly label: string;
  readonly authoritativeSource: string;
}

export const DPS_REFERENCE_DATA_SETS = [
  {
    id: "location-codes",
    label: "IBGE municipality and National NFS-e special-locality codes",
    authoritativeSource: "IBGE municipality table plus National NFS-e special-locality table",
  },
  {
    id: "country-codes",
    label: "ISO country codes accepted by National NFS-e",
    authoritativeSource: "National NFS-e country-code source based on ISO 3166 alpha-2",
  },
  {
    id: "currency-codes",
    label: "BACEN currency codes",
    authoritativeSource: "Banco Central do Brasil currency-code table",
  },
  {
    id: "national-service-codes",
    label: "National service taxation codes",
    authoritativeSource: "National NFS-e service taxation table",
  },
  {
    id: "nbs-codes",
    label: "NBS codes",
    authoritativeSource: "Nomenclatura Brasileira de Servicos table",
  },
  {
    id: "ibs-cbs-operation-codes",
    label: "IBS/CBS operation indicator codes",
    authoritativeSource: "IBS/CBS declarant operation-code table",
  },
  {
    id: "ibs-cbs-tax-situation-codes",
    label: "IBS/CBS tax situation codes",
    authoritativeSource: "IBS/CBS CST table",
  },
  {
    id: "ibs-cbs-tax-classification-codes",
    label: "IBS/CBS tax classification codes",
    authoritativeSource: "IBS/CBS classification table",
  },
  {
    id: "ibs-cbs-presumed-credit-codes",
    label: "IBS/CBS presumed-credit codes",
    authoritativeSource: "IBS/CBS presumed-credit table",
  },
] as const satisfies readonly DpsReferenceDataSetDefinition[];

export interface DpsReferenceCodeRecord {
  readonly code: string;
  readonly aliases?: readonly string[];
  readonly label?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface DpsReferenceLookupMatch {
  readonly found: boolean;
  readonly canonicalCode?: string;
  readonly record?: DpsReferenceCodeRecord;
}

export type DpsReferenceLookupResult =
  | boolean
  | string
  | DpsReferenceCodeRecord
  | DpsReferenceLookupMatch
  | undefined;

export interface DpsReferenceCodeSet {
  readonly source: ValidationSource;
  readonly codes?: readonly (string | DpsReferenceCodeRecord)[];
  readonly lookup?: (code: string) => DpsReferenceLookupResult;
}

export interface DpsReferenceDataProvider {
  readonly codeSets?: Partial<Record<DpsReferenceDataSetId, DpsReferenceCodeSet>>;
  readonly getCodeSet?: (id: DpsReferenceDataSetId) => DpsReferenceCodeSet | undefined;
}

export interface DpsReferenceDataValidationOptions {
  /**
   * `issue` reports missing datasets as reference-data issues. `skip` validates
   * only the datasets supplied by the provider.
   */
  readonly missingCodeSet?: "issue" | "skip";
}

export interface DpsReferenceDataFieldCoverage {
  readonly path: string;
  readonly dataSet: DpsReferenceDataSetId;
  readonly authoritativeSource: string;
}

export const DPS_REFERENCE_DATA_FIELD_COVERAGE = [
  coverage("infDPS.cLocEmi", "location-codes"),
  coverage("infDPS.prest.end.endNac.cMun", "location-codes"),
  coverage("infDPS.prest.end.endExt.cPais", "country-codes"),
  coverage("infDPS.toma.end.endNac.cMun", "location-codes"),
  coverage("infDPS.toma.end.endExt.cPais", "country-codes"),
  coverage("infDPS.interm.end.endNac.cMun", "location-codes"),
  coverage("infDPS.interm.end.endExt.cPais", "country-codes"),
  coverage("infDPS.serv.locPrest.cLocPrestacao", "location-codes"),
  coverage("infDPS.serv.locPrest.cPaisPrestacao", "country-codes"),
  coverage("infDPS.serv.cServ.cTribNac", "national-service-codes"),
  coverage("infDPS.serv.cServ.cNBS", "nbs-codes"),
  coverage("infDPS.serv.comExt.tpMoeda", "currency-codes"),
  coverage("infDPS.valores.vDedRed.documentos.docDedRed[].NFSeMun.cMunNFSeMun", "location-codes"),
  coverage("infDPS.valores.trib.tribMun.cPaisResult", "country-codes"),
  coverage("infDPS.IBSCBS.cIndOp", "ibs-cbs-operation-codes"),
  coverage("infDPS.IBSCBS.dest.end.endNac.cMun", "location-codes"),
  coverage("infDPS.IBSCBS.dest.end.endExt.cPais", "country-codes"),
  coverage(
    "infDPS.IBSCBS.valores.gReeRepRes.documentos[].docFiscalOutro.cMunDocFiscal",
    "location-codes",
  ),
  coverage("infDPS.IBSCBS.valores.trib.gIBSCBS.CST", "ibs-cbs-tax-situation-codes"),
  coverage("infDPS.IBSCBS.valores.trib.gIBSCBS.cClassTrib", "ibs-cbs-tax-classification-codes"),
  coverage("infDPS.IBSCBS.valores.trib.gIBSCBS.cCredPres", "ibs-cbs-presumed-credit-codes"),
  coverage("infDPS.IBSCBS.valores.trib.gIBSCBS.gTribRegular.CSTReg", "ibs-cbs-tax-situation-codes"),
  coverage(
    "infDPS.IBSCBS.valores.trib.gIBSCBS.gTribRegular.cClassTribReg",
    "ibs-cbs-tax-classification-codes",
  ),
] as const satisfies readonly DpsReferenceDataFieldCoverage[];

export function getDpsReferenceDataSetDefinition(
  id: DpsReferenceDataSetId,
): DpsReferenceDataSetDefinition {
  return (
    DPS_REFERENCE_DATA_SETS.find((definition) => definition.id === id) ?? {
      id,
      label: id,
      authoritativeSource: "Unknown reference data source",
    }
  );
}

function coverage(path: string, dataSet: DpsReferenceDataSetId): DpsReferenceDataFieldCoverage {
  return {
    path,
    dataSet,
    authoritativeSource: getDpsReferenceDataSetDefinition(dataSet).authoritativeSource,
  };
}
