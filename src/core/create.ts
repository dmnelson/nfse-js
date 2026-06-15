import { InvalidDpsIdError } from "../errors.js";
import { buildDpsId } from "./dps-id.js";
import {
  type DpsDocument,
  type DpsInput,
  type FederalTaxId,
  NATIONAL_NFSE_VERSION,
} from "./types.js";

export function createDps(input: DpsInput): DpsDocument {
  const issuer =
    input.infDPS.tpEmit === "1"
      ? input.infDPS.prest
      : input.infDPS.tpEmit === "2"
        ? input.infDPS.toma
        : input.infDPS.interm;
  if (!issuer) {
    throw new InvalidDpsIdError(
      input.infDPS.tpEmit === "2" ? "toma" : "interm",
      "",
      "the selected DPS issuer group must be supplied",
    );
  }

  const Id =
    input.infDPS.Id ??
    buildDpsId({
      cLocEmi: input.infDPS.cLocEmi,
      emitente: federalTaxId(issuer),
      serie: input.infDPS.serie,
      nDPS: input.infDPS.nDPS,
    });

  return {
    versao: input.versao ?? NATIONAL_NFSE_VERSION,
    infDPS: {
      ...input.infDPS,
      Id,
    },
  };
}

function federalTaxId(subject: FederalTaxId): FederalTaxId {
  if ("CNPJ" in subject && subject.CNPJ !== undefined) {
    return { CNPJ: subject.CNPJ };
  }
  if ("CPF" in subject && subject.CPF !== undefined) {
    return { CPF: subject.CPF };
  }
  if ("NIF" in subject && subject.NIF !== undefined) {
    return { NIF: subject.NIF };
  }
  return { cNaoNIF: subject.cNaoNIF };
}
