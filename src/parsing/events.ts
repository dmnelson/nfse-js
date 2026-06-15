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
import { cnpjValue, cpfValue, dateTimeValue, enumValue, patternValue } from "./validation.js";
import {
  assertNationalNamespaceTree,
  assertNationalRoot,
  omitUndefined,
  optionalSignatureElement,
  optionalString,
  parseXmlRoot,
  requiredAttribute,
  requiredElement,
  requiredSignatureElement,
  requiredString,
} from "./xml.js";

const EVENT_CODE_SET = new Set<string>(NATIONAL_NFSE_EVENT_CODES);
const ENVIRONMENTS = ["1", "2"] as const;
const EVENT_GENERATORS = ["1", "2", "3"] as const;

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
    signature: optionalSignatureElement(root.value, "pedRegEvento"),
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
  const signature = requiredSignatureElement(root.value, "evento");

  return {
    kind: "evento",
    document: {
      versao: NATIONAL_NFSE_VERSION,
      infEvento: omitUndefined({
        Id: patternValue(
          requiredAttribute(info, "Id", "evento.infEvento"),
          /^EVT\d{59}$/,
          "evento.infEvento.@_Id",
          "expected an EVT identifier followed by 59 digits",
        ),
        verAplic: applicationVersion(
          requiredString(info, "verAplic", "evento.infEvento"),
          "evento.infEvento.verAplic",
        ),
        ambGer: enumValue(
          requiredString(info, "ambGer", "evento.infEvento"),
          EVENT_GENERATORS,
          "evento.infEvento.ambGer",
        ),
        nSeqEvento: patternValue(
          requiredString(info, "nSeqEvento", "evento.infEvento"),
          /^\d{3}$/,
          "evento.infEvento.nSeqEvento",
          "expected exactly three digits",
        ),
        dhProc: dateTimeValue(
          requiredString(info, "dhProc", "evento.infEvento"),
          "evento.infEvento.dhProc",
        ),
        nDFSe: patternValue(
          requiredString(info, "nDFSe", "evento.infEvento"),
          /^\d{1,13}$/,
          "evento.infEvento.nDFSe",
          "expected between 1 and 13 digits",
        ),
        pedRegEvento: parseEventRequestElement(request, "evento.infEvento.pedRegEvento"),
        requestSignature: optionalSignatureElement(request, "evento.infEvento.pedRegEvento"),
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
    Id: patternValue(
      requiredAttribute(value, "Id", path),
      /^PRE\d{56}$/,
      `${path}.@_Id`,
      "expected a PRE identifier followed by 56 digits",
    ),
    tpAmb: enumValue(requiredString(value, "tpAmb", path), ENVIRONMENTS, `${path}.tpAmb`),
    verAplic: applicationVersion(requiredString(value, "verAplic", path), `${path}.verAplic`),
    dhEvento: dateTimeValue(requiredString(value, "dhEvento", path), `${path}.dhEvento`),
    autor: parseEventAuthor(value, path),
    chNFSe: patternValue(
      requiredString(value, "chNFSe", path),
      /^\d{50}$/,
      `${path}.chNFSe`,
      "expected exactly 50 digits",
    ),
    evento: parseEventPayload(value, path),
  };
}

function parseEventAuthor(value: XmlElement, path: string): EventAuthor {
  const cnpj = optionalString(value, "CNPJAutor", path);
  const cpf = optionalString(value, "CPFAutor", path);
  if ((cnpj ? 1 : 0) + (cpf ? 1 : 0) !== 1) {
    throw new XmlParseError("invalid-value", path, "expected one event author identity");
  }
  return cnpj
    ? { CNPJAutor: cnpjValue(cnpj, `${path}.CNPJAutor`) }
    : { CPFAutor: cpfValue(cpf as string, `${path}.CPFAutor`) };
}

function applicationVersion(value: string, path: string): string {
  return patternValue(value, /^.{1,20}$/s, path, "expected between 1 and 20 characters");
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
  const details = requiredElement(value, code, path);
  assertNationalNamespaceTree(details, `${path}.${code}`);
  return {
    code,
    details,
  };
}
