import { DpsValidationError, type ValidationIssue } from "../errors.js";
import type { DpsDocument, FederalTaxId } from "./types.js";

const patterns = {
  cnpj: /^\d{14}$/,
  cpf: /^\d{11}$/,
  municipality: /^\d{7}$/,
  postalCode: /^\d{8}$/,
  series: /^\d{1,5}$/,
  dpsNumber: /^[1-9]\d{0,14}$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  dateTime: /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d[+-](?:0\d|1[0-2]):00$/,
  serviceCode: /^\d{6}$/,
  country: /^[A-Z]{2}$/,
  decimal15v2: /^(?:0|0\.\d{2}|[1-9]\d{0,14}(?:\.\d{2})?)$/,
};

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

export function validateDps(dps: DpsDocument): ValidationResult {
  const issues: ValidationIssue[] = [];
  const info = dps.infDPS;

  check(issues, info.Id, /^DPS\d{42}$/, "infDPS.Id", "format", "must be DPS plus 42 digits");
  check(
    issues,
    info.cLocEmi,
    patterns.municipality,
    "infDPS.cLocEmi",
    "format",
    "must contain exactly 7 digits",
  );
  check(
    issues,
    info.serie,
    patterns.series,
    "infDPS.serie",
    "format",
    "must contain 1 to 5 digits",
  );
  check(
    issues,
    info.nDPS,
    patterns.dpsNumber,
    "infDPS.nDPS",
    "format",
    "must contain 1 to 15 digits without leading zero",
  );
  check(issues, info.dCompet, patterns.date, "infDPS.dCompet", "format", "must use YYYY-MM-DD");
  check(
    issues,
    info.dhEmi,
    patterns.dateTime,
    "infDPS.dhEmi",
    "format",
    "must include a supported UTC offset in YYYY-MM-DDThh:mm:ss+hh:00 form",
  );

  validateFederalTaxId(issues, info.prest, "infDPS.prest");

  if (info.toma) {
    validateFederalTaxId(issues, info.toma, "infDPS.toma");
  }
  if (info.interm) {
    validateFederalTaxId(issues, info.interm, "infDPS.interm");
  }

  if (info.prest.end && "endNac" in info.prest.end) {
    check(
      issues,
      info.prest.end.endNac.cMun,
      patterns.municipality,
      "infDPS.prest.end.endNac.cMun",
      "format",
      "must contain exactly 7 digits",
    );
    check(
      issues,
      info.prest.end.endNac.CEP,
      patterns.postalCode,
      "infDPS.prest.end.endNac.CEP",
      "format",
      "must contain exactly 8 digits",
    );
  }

  check(
    issues,
    info.serv.cServ.cTribNac,
    patterns.serviceCode,
    "infDPS.serv.cServ.cTribNac",
    "format",
    "must contain exactly 6 digits",
  );

  if ("cLocPrestacao" in info.serv.locPrest) {
    check(
      issues,
      info.serv.locPrest.cLocPrestacao,
      patterns.municipality,
      "infDPS.serv.locPrest.cLocPrestacao",
      "format",
      "must contain exactly 7 digits",
    );
  } else {
    check(
      issues,
      info.serv.locPrest.cPaisPrestacao,
      patterns.country,
      "infDPS.serv.locPrest.cPaisPrestacao",
      "format",
      "must contain exactly 2 uppercase ISO country letters",
    );
  }

  check(
    issues,
    info.valores.vServPrest.vServ,
    patterns.decimal15v2,
    "infDPS.valores.vServPrest.vServ",
    "format",
    "must be a non-negative decimal with up to 15 integer digits and exactly 2 fractional digits when present",
  );

  if (info.serv.infoCompl?.gItemPed) {
    checkArrayLength(
      issues,
      info.serv.infoCompl.gItemPed.xItemPed,
      1,
      99,
      "infDPS.serv.infoCompl.gItemPed.xItemPed",
    );
  }
  if (info.valores.vDedRed && "documentos" in info.valores.vDedRed) {
    checkArrayLength(
      issues,
      info.valores.vDedRed.documentos.docDedRed,
      1,
      1000,
      "infDPS.valores.vDedRed.documentos.docDedRed",
    );
  }
  if (info.IBSCBS?.gRefNFSe) {
    checkArrayLength(issues, info.IBSCBS.gRefNFSe.refNFSe, 1, 99, "infDPS.IBSCBS.gRefNFSe.refNFSe");
  }
  if (info.IBSCBS?.valores.gReeRepRes) {
    checkArrayLength(
      issues,
      info.IBSCBS.valores.gReeRepRes.documentos,
      1,
      1000,
      "infDPS.IBSCBS.valores.gReeRepRes.documentos",
    );
  }

  if (info.tpEmit === "1" && info.cMotivoEmisTI !== undefined) {
    issues.push({
      path: "infDPS.cMotivoEmisTI",
      code: "unexpected",
      message: "must not be supplied when the provider emits the DPS",
    });
  }
  if (info.tpEmit !== "1" && info.cMotivoEmisTI === undefined) {
    issues.push({
      path: "infDPS.cMotivoEmisTI",
      code: "required",
      message: "is required when the issuer is the customer or intermediary",
    });
  }
  if (info.subst?.cMotivo === "99" && !info.subst.xMotivo) {
    issues.push({
      path: "infDPS.subst.xMotivo",
      code: "required",
      message: "is required when substitution reason is 99",
    });
  }

  return { valid: issues.length === 0, issues };
}

export function assertValidDps(dps: DpsDocument): void {
  const result = validateDps(dps);
  if (!result.valid) {
    throw new DpsValidationError(result.issues);
  }
}

function validateFederalTaxId(
  issues: ValidationIssue[],
  subject: FederalTaxId,
  path: string,
): void {
  if ("CNPJ" in subject && subject.CNPJ !== undefined) {
    check(issues, subject.CNPJ, patterns.cnpj, `${path}.CNPJ`, "format", "must contain 14 digits");
  } else if ("CPF" in subject && subject.CPF !== undefined) {
    check(issues, subject.CPF, patterns.cpf, `${path}.CPF`, "format", "must contain 11 digits");
  }
}

function check(
  issues: ValidationIssue[],
  value: string,
  pattern: RegExp,
  path: string,
  code: string,
  message: string,
): void {
  if (!pattern.test(value)) {
    issues.push({ path, code, message });
  }
}

function checkArrayLength(
  issues: ValidationIssue[],
  values: readonly unknown[],
  minimum: number,
  maximum: number,
  path: string,
): void {
  if (values.length < minimum || values.length > maximum) {
    issues.push({
      path,
      code: "length",
      message: `must contain between ${minimum} and ${maximum} items`,
    });
  }
}
