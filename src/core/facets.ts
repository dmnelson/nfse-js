export interface StringFacet {
  readonly type: string;
  readonly pattern?: RegExp;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly sourceLine: number;
}

export const DPS_XSD_FACETS = {
  TSIdDPS: {
    type: "TSIdDPS",
    pattern: /^DPS\d{42}$/,
    maxLength: 45,
    sourceLine: 44,
  },
  TSData: {
    type: "TSData",
    pattern: /^\d{4}-\d{2}-\d{2}$/,
    sourceLine: 131,
  },
  TSDateTimeUTC: {
    type: "TSDateTimeUTC",
    pattern:
      /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:-(?:0\d|1[01])|\+(?:0\d|1[0-2])):00$/,
    sourceLine: 140,
  },
  TSSerieDPS: {
    type: "TSSerieDPS",
    pattern: /^0{0,4}\d{1,5}$/,
    maxLength: 5,
    sourceLine: 158,
  },
  TSNumDPS: {
    type: "TSNumDPS",
    pattern: /^[1-9]\d{0,14}$/,
    maxLength: 15,
    sourceLine: 1310,
  },
  TSCNPJ: {
    type: "TSCNPJ",
    pattern: /^\d{14}$/,
    maxLength: 14,
    sourceLine: 357,
  },
  TSCPF: {
    type: "TSCPF",
    pattern: /^\d{11}$/,
    maxLength: 11,
    sourceLine: 367,
  },
  TSCAEPF: {
    type: "TSCAEPF",
    pattern: /^\d{14}$/,
    maxLength: 14,
    sourceLine: 377,
  },
  TSNIF: {
    type: "TSNIF",
    minLength: 1,
    maxLength: 40,
    sourceLine: 387,
  },
  TSInscMun: {
    type: "TSInscMun",
    minLength: 1,
    maxLength: 15,
    sourceLine: 410,
  },
  TSTelefone: {
    type: "TSTelefone",
    pattern: /^\d{6,20}$/,
    sourceLine: 548,
  },
  TSEmail: {
    type: "TSEmail",
    minLength: 1,
    maxLength: 80,
    sourceLine: 561,
  },
  TSCodMoeda: {
    type: "TSCodMoeda",
    pattern: /^\d{3}$/,
    maxLength: 3,
    sourceLine: 577,
  },
  TSCEP: {
    type: "TSCEP",
    pattern: /^\d{8}$/,
    sourceLine: 502,
  },
  TSCodCIB: {
    type: "TSCodCIB",
    pattern: /^.{8}$/s,
    minLength: 8,
    maxLength: 8,
    sourceLine: 874,
  },
  TSNumBeneficioMunicipal: {
    type: "TSNumBeneficioMunicipal",
    pattern: /^\d{14}$/,
    sourceLine: 957,
  },
  TSNumProcExigSuspensa: {
    type: "TSNumProcExigSuspensa",
    pattern: /^\d{30}$/,
    sourceLine: 988,
  },
  TSCodMunIBGE: {
    type: "TSCodMunIBGE",
    pattern: /^\d{7}$/,
    sourceLine: 1340,
  },
  TSCodPaisISO: {
    type: "TSCodPaisISO",
    pattern: /^[A-Z]{2}$/,
    sourceLine: 1349,
  },
  TSCodTribNac: {
    type: "TSCodTribNac",
    pattern: /^\d{6}$/,
    sourceLine: 1358,
  },
  TSCodNBS: {
    type: "TSCodNBS",
    pattern: /^\d{9}$/,
    sourceLine: 1369,
  },
  TSDesc150: {
    type: "TSDesc150",
    minLength: 1,
    maxLength: 150,
    sourceLine: 1393,
  },
  TSDesc255: {
    type: "TSDesc255",
    minLength: 1,
    maxLength: 255,
    sourceLine: 1399,
  },
  TSDesc600: {
    type: "TSDesc600",
    minLength: 1,
    maxLength: 600,
    sourceLine: 1406,
  },
  TSDesc2000: {
    type: "TSDesc2000",
    minLength: 1,
    maxLength: 2000,
    sourceLine: 1426,
  },
  TSDec15V2: {
    type: "TSDec15V2",
    pattern: /^(?:0|0\.\d{2}|[1-9]\d{0,14}(?:\.\d{2})?)$/,
    sourceLine: 1432,
  },
  TSDec1V2: {
    type: "TSDec1V2",
    pattern: /^(?:0|[0-9](?:\.\d{2})?)$/,
    sourceLine: 1441,
  },
  TSDec2V2: {
    type: "TSDec2V2",
    pattern: /^(?:0|0\.\d{2}|[1-9]\d?(?:\.\d{2})?)$/,
    sourceLine: 1450,
  },
  TSDec3V2: {
    type: "TSDec3V2",
    pattern: /^(?:0|0\.\d{2}|[1-9]\d{0,2}(?:\.\d{2})?)$/,
    sourceLine: 1459,
  },
  TSRTCCodIndOp: {
    type: "TSRTCCodIndOp",
    pattern: /^\d{6}$/,
    sourceLine: 1694,
  },
  TSChaveNFSe: {
    type: "TSChaveNFSe",
    pattern: /^\d{50}$/,
    maxLength: 50,
    sourceLine: 199,
  },
  TSChaveNFe: {
    type: "TSChaveNFe",
    pattern: /^\d{44}$/,
    maxLength: 44,
    sourceLine: 209,
  },
} as const satisfies Record<string, StringFacet>;

export type DpsFacetName = keyof typeof DPS_XSD_FACETS;

export interface FacetFailure {
  readonly facet: DpsFacetName;
  readonly detail: string;
}

export function validateFacet(facetName: DpsFacetName, value: string): FacetFailure | undefined {
  const facet = DPS_XSD_FACETS[facetName];

  if ("minLength" in facet && facet.minLength !== undefined && value.length < facet.minLength) {
    return { facet: facetName, detail: `must contain at least ${facet.minLength} characters` };
  }
  if ("maxLength" in facet && facet.maxLength !== undefined && value.length > facet.maxLength) {
    return { facet: facetName, detail: `must contain at most ${facet.maxLength} characters` };
  }
  if ("pattern" in facet && facet.pattern !== undefined && !facet.pattern.test(value)) {
    return { facet: facetName, detail: `does not match ${facet.type}` };
  }
  return undefined;
}

export function isValidXsdDate(value: string): boolean {
  if (!DPS_XSD_FACETS.TSData.pattern.test(value)) {
    return false;
  }
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 2000 || year > 2099) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function isValidXsdDateTime(value: string): boolean {
  return (
    DPS_XSD_FACETS.TSDateTimeUTC.pattern.test(value) &&
    isValidXsdDate(value.slice(0, "YYYY-MM-DD".length))
  );
}
