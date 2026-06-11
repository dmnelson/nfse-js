import { InvalidDpsIdError } from "../errors.js";
import type { FederalTaxId } from "./types.js";

export interface BuildDpsIdOptions {
  readonly cLocEmi: string;
  readonly emitente: FederalTaxId;
  readonly serie: string;
  readonly nDPS: string;
}

const municipalityPattern = /^\d{7}$/;
const cnpjPattern = /^\d{14}$/;
const cpfPattern = /^\d{11}$/;
const seriesPattern = /^\d{1,5}$/;
const dpsNumberPattern = /^[1-9]\d{0,14}$/;

export function buildDpsId(options: BuildDpsIdOptions): string {
  const { cLocEmi, emitente, serie, nDPS } = options;

  assertPattern("cLocEmi", cLocEmi, municipalityPattern, "must contain exactly 7 digits");
  assertPattern("serie", serie, seriesPattern, "must contain 1 to 5 digits");
  assertPattern("nDPS", nDPS, dpsNumberPattern, "must contain 1 to 15 digits without leading zero");

  let registrationType: "1" | "2";
  let federalRegistration: string;

  if ("CNPJ" in emitente && emitente.CNPJ !== undefined) {
    assertPattern("emitente.CNPJ", emitente.CNPJ, cnpjPattern, "must contain exactly 14 digits");
    registrationType = "2";
    federalRegistration = emitente.CNPJ;
  } else if ("CPF" in emitente && emitente.CPF !== undefined) {
    assertPattern("emitente.CPF", emitente.CPF, cpfPattern, "must contain exactly 11 digits");
    registrationType = "1";
    federalRegistration = emitente.CPF.padStart(14, "0");
  } else {
    const value = "NIF" in emitente ? emitente.NIF : emitente.cNaoNIF;
    throw new InvalidDpsIdError(
      "emitente",
      value,
      "the National DPS identifier can only be formed from a CNPJ or CPF",
    );
  }

  return `DPS${cLocEmi}${registrationType}${federalRegistration}${serie.padStart(5, "0")}${nDPS.padStart(15, "0")}`;
}

function assertPattern(
  field: string,
  value: string,
  pattern: RegExp,
  detail: string,
): asserts value is string {
  if (!pattern.test(value)) {
    throw new InvalidDpsIdError(field, value, detail);
  }
}
