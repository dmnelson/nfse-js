import { NATIONAL_NFSE_VERSION } from "../core/types.js";
import { XmlParseError } from "../errors.js";
import {
  type EventAuthor,
  type EventParseOptions,
  type EventRequestDocument,
  type EventRequestInfo,
  NATIONAL_NFSE_EVENT_CODES,
  type NfseEventCode,
  type NfseEventPayload,
  type ParsedEventRequest,
  type ParsedRegisteredEvent,
  type XmlElement,
} from "./types.js";
import {
  assertNationalRoot,
  omitUndefined,
  optionalElement,
  optionalString,
  parseXmlRoot,
  requiredAttribute,
  requiredElement,
  requiredString,
} from "./xml.js";

const EVENT_CODE_SET = new Set<string>(NATIONAL_NFSE_EVENT_CODES);

export function parseEventRequestXml(
  xml: string,
  options: EventParseOptions = {},
): ParsedEventRequest {
  const root = parseXmlRoot(xml, options);
  if (root.name !== "pedRegEvento") {
    throw new XmlParseError("unexpected-root", "$", `expected pedRegEvento, found ${root.name}`);
  }
  const document = parseEventRequestElement(root.value, "pedRegEvento");
  return omitUndefined<ParsedEventRequest>({
    kind: "pedRegEvento",
    document,
    originalXml: xml,
    raw: root.value,
    signature: optionalElement(root.value, "Signature", "pedRegEvento"),
  });
}

export function parseRegisteredEventXml(
  xml: string,
  options: EventParseOptions = {},
): ParsedRegisteredEvent {
  const root = parseXmlRoot(xml, options);
  if (root.name !== "evento") {
    throw new XmlParseError("unexpected-root", "$", `expected evento, found ${root.name}`);
  }
  assertNationalRoot(root.value, "evento");

  const info = requiredElement(root.value, "infEvento", "evento");
  const request = requiredElement(info, "pedRegEvento", "evento.infEvento");
  const signature = requiredElement(root.value, "Signature", "evento");

  return {
    kind: "evento",
    document: {
      versao: NATIONAL_NFSE_VERSION,
      infEvento: omitUndefined({
        Id: requiredAttribute(info, "Id", "evento.infEvento"),
        verAplic: requiredString(info, "verAplic", "evento.infEvento"),
        ambGer: requiredString(info, "ambGer", "evento.infEvento") as "1" | "2" | "3",
        nSeqEvento: requiredString(info, "nSeqEvento", "evento.infEvento"),
        dhProc: requiredString(info, "dhProc", "evento.infEvento"),
        nDFSe: requiredString(info, "nDFSe", "evento.infEvento"),
        pedRegEvento: parseEventRequestElement(request, "evento.infEvento.pedRegEvento"),
        requestSignature: optionalElement(request, "Signature", "evento.infEvento.pedRegEvento"),
      }),
    },
    originalXml: xml,
    raw: root.value,
    signature,
  };
}

function parseEventRequestElement(root: XmlElement, path: string): EventRequestDocument {
  assertNationalRoot(root, path);
  return {
    versao: NATIONAL_NFSE_VERSION,
    infPedReg: parseEventRequestInfo(requiredElement(root, "infPedReg", path), `${path}.infPedReg`),
  };
}

function parseEventRequestInfo(value: XmlElement, path: string): EventRequestInfo {
  return {
    Id: requiredAttribute(value, "Id", path),
    tpAmb: requiredString(value, "tpAmb", path) as EventRequestInfo["tpAmb"],
    verAplic: requiredString(value, "verAplic", path),
    dhEvento: requiredString(value, "dhEvento", path),
    autor: parseEventAuthor(value, path),
    chNFSe: requiredString(value, "chNFSe", path),
    evento: parseEventPayload(value, path),
  };
}

function parseEventAuthor(value: XmlElement, path: string): EventAuthor {
  const cnpj = optionalString(value, "CNPJAutor", path);
  const cpf = optionalString(value, "CPFAutor", path);
  if ((cnpj ? 1 : 0) + (cpf ? 1 : 0) !== 1) {
    throw new XmlParseError("invalid-value", path, "expected one event author identity");
  }
  return cnpj ? { CNPJAutor: cnpj } : { CPFAutor: cpf as string };
}

function parseEventPayload(value: XmlElement, path: string): NfseEventPayload {
  const codes = Object.keys(value).filter((name) => EVENT_CODE_SET.has(name));
  if (codes.length !== 1) {
    throw new XmlParseError(
      "invalid-value",
      path,
      `expected one event payload, found ${codes.length}`,
    );
  }
  const code = codes[0] as NfseEventCode;
  return {
    code,
    details: requiredElement(value, code, path),
  };
}
