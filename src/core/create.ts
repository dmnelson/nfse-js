import { buildDpsId } from "./dps-id.js";
import {
  type DpsDocument,
  type DpsInput,
  type FederalTaxId,
  NATIONAL_NFSE_VERSION,
} from "./types.js";

export function createDps(input: DpsInput): DpsDocument {
  const Id =
    input.infDPS.Id ??
    buildDpsId({
      cLocEmi: input.infDPS.cLocEmi,
      emitente: providerTaxId(input.infDPS.prest),
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

function providerTaxId(provider: DpsInput["infDPS"]["prest"]): FederalTaxId {
  if ("CNPJ" in provider && provider.CNPJ !== undefined) {
    return { CNPJ: provider.CNPJ };
  }
  if ("CPF" in provider && provider.CPF !== undefined) {
    return { CPF: provider.CPF };
  }
  if ("NIF" in provider && provider.NIF !== undefined) {
    return { NIF: provider.NIF };
  }
  return { cNaoNIF: provider.cNaoNIF };
}
