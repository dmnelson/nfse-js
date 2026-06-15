import { XMLBuilder } from "fast-xml-parser";
import { NATIONAL_NFSE_NAMESPACE } from "../core/types.js";
import { createEventRequest } from "./create.js";
import type {
  EventRequestInput,
  EventRequestPayload,
  NationalEventRequest,
  SerializeEventRequestOptions,
} from "./types.js";
import { assertValidEventRequest } from "./validation.js";

const EVENT_DESCRIPTIONS: Readonly<Record<EventRequestPayload["code"], string>> = {
  e101101: "Cancelamento de NFS-e",
  e105102: "Cancelamento de NFS-e por Substituição",
  e101103: "Solicitação de Análise Fiscal para Cancelamento de NFS-e",
  e105104: "Cancelamento de NFS-e Deferido por Análise Fiscal",
  e105105: "Cancelamento de NFS-e Indeferido por Análise Fiscal",
  e202201: "Manifestação de NFS-e - Confirmação do Prestador",
  e203202: "Manifestação de NFS-e - Confirmação do Tomador",
  e204203: "Manifestação de NFS-e - Confirmação do Intermediário",
  e205204: "Manifestação de NFS-e - Confirmação Tácita",
  e202205: "Manifestação de NFS-e - Rejeição do Prestador",
  e203206: "Manifestação de NFS-e - Rejeição do Tomador",
  e204207: "Manifestação de NFS-e - Rejeição do Intermediário",
  e205208: "Manifestação de NFS-e - Anulação da Rejeição",
  e305101: "Cancelamento de NFS-e por Ofício",
  e305102: "Bloqueio de NFS-e por Ofício",
  e305103: "Desbloqueio de NFS-e por Ofício",
};

export function serializeEventRequest(
  input: EventRequestInput | NationalEventRequest,
  options: SerializeEventRequestOptions = {},
): string {
  const request = "Id" in input.infPedReg ? input : createEventRequest(input);
  assertValidEventRequest(request);

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    format: options.pretty ?? false,
    suppressEmptyNode: true,
    processEntities: true,
  });
  const payload = request.infPedReg.evento;
  const xml = builder.build({
    pedRegEvento: {
      "@_xmlns": NATIONAL_NFSE_NAMESPACE,
      "@_versao": request.versao,
      infPedReg: {
        "@_Id": request.infPedReg.Id,
        tpAmb: request.infPedReg.tpAmb,
        verAplic: request.infPedReg.verAplic,
        dhEvento: request.infPedReg.dhEvento,
        CNPJAutor:
          "CNPJAutor" in request.infPedReg.autor ? request.infPedReg.autor.CNPJAutor : undefined,
        CPFAutor:
          "CPFAutor" in request.infPedReg.autor ? request.infPedReg.autor.CPFAutor : undefined,
        chNFSe: request.infPedReg.chNFSe,
        [payload.code]: serializePayload(payload),
      },
    },
  });
  return options.declaration === false ? xml : `<?xml version="1.0" encoding="UTF-8"?>${xml}`;
}

function serializePayload(payload: EventRequestPayload): Record<string, string | undefined> {
  const base = { xDesc: EVENT_DESCRIPTIONS[payload.code] };
  switch (payload.code) {
    case "e101101":
    case "e101103":
      return { ...base, cMotivo: payload.cMotivo, xMotivo: payload.xMotivo };
    case "e105102":
      return {
        ...base,
        cMotivo: payload.cMotivo,
        xMotivo: payload.xMotivo,
        chSubstituta: payload.chSubstituta,
      };
    case "e105104":
    case "e105105":
      return {
        ...base,
        CPFAgTrib: payload.CPFAgTrib,
        nProcAdm: payload.nProcAdm,
        cMotivo: payload.cMotivo,
        xMotivo: payload.xMotivo,
      };
    case "e202201":
    case "e203202":
    case "e204203":
    case "e205204":
      return base;
    case "e202205":
    case "e203206":
    case "e204207":
      return { ...base, cMotivo: payload.cMotivo, xMotivo: payload.xMotivo };
    case "e205208":
      return {
        ...base,
        CPFAgTrib: payload.CPFAgTrib,
        idEvManifRej: payload.idEvManifRej,
        xMotivo: payload.xMotivo,
      };
    case "e305101":
      return {
        ...base,
        CPFAgTrib: payload.CPFAgTrib,
        nProcAdm: payload.nProcAdm,
        xProcAdm: payload.xProcAdm,
      };
    case "e305102":
      return {
        ...base,
        CPFAgTrib: payload.CPFAgTrib,
        codEvento: payload.codEvento,
        xMotivo: payload.xMotivo,
      };
    case "e305103":
      return { ...base, CPFAgTrib: payload.CPFAgTrib, idBloqOfic: payload.idBloqOfic };
  }
}
