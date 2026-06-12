import type { Decimal1V2, Decimal15V2, DpsDocument, Environment } from "../core/types.js";

export type XmlValue = string | XmlElement | readonly XmlValue[];

export interface XmlElement {
  readonly [name: string]: XmlValue;
}

export interface XmlParseOptions {
  readonly maxBytes?: number;
  readonly maxDepth?: number;
}

export interface DpsParseOptions extends XmlParseOptions {
  readonly validate?: boolean;
}

export type NfseParseOptions = DpsParseOptions;
export type EventParseOptions = XmlParseOptions;
export interface SefinResponseParseOptions extends DpsParseOptions {
  readonly status?: number;
  readonly contentType?: string;
}

export interface ParsedDps {
  readonly kind: "DPS";
  readonly document: DpsDocument;
  readonly originalXml: string;
  readonly raw: XmlElement;
  readonly signature?: XmlElement;
}

export interface NfseIssuerAddress {
  readonly xLgr: string;
  readonly nro: string;
  readonly xCpl?: string;
  readonly xBairro: string;
  readonly cMun: string;
  readonly UF: string;
  readonly CEP: string;
}

export type NfseIssuer =
  | {
      readonly CNPJ: string;
      readonly CPF?: never;
      readonly IM?: string;
      readonly xNome: string;
      readonly xFant?: string;
      readonly enderNac: NfseIssuerAddress;
      readonly fone?: string;
      readonly email?: string;
    }
  | {
      readonly CPF: string;
      readonly CNPJ?: never;
      readonly IM?: string;
      readonly xNome: string;
      readonly xFant?: string;
      readonly enderNac: NfseIssuerAddress;
      readonly fone?: string;
      readonly email?: string;
    };

export interface NfseValues {
  readonly vCalcDR?: Decimal15V2;
  readonly tpBM?: "1" | "2" | "3" | "4";
  readonly vCalcBM?: Decimal15V2;
  readonly vBC?: Decimal15V2;
  readonly pAliqAplic?: Decimal1V2;
  readonly vISSQN?: Decimal15V2;
  readonly vTotalRet?: Decimal15V2;
  readonly vLiq: Decimal15V2;
}

export interface NfseInfo {
  readonly Id: string;
  readonly xLocEmi: string;
  readonly xLocPrestacao: string;
  readonly nNFSe: string;
  readonly cLocIncid?: string;
  readonly xLocIncid?: string;
  readonly xTribNac: string;
  readonly xTribMun?: string;
  readonly xNBS?: string;
  readonly verAplic: string;
  readonly ambGer: "1" | "2";
  readonly tpEmis: "1" | "2";
  readonly procEmi?: "1" | "2" | "3";
  readonly cStat: "100" | "102" | "103" | "107";
  readonly dhProc: string;
  readonly nDFSe: string;
  readonly emit: NfseIssuer;
  readonly valores: NfseValues;
  readonly xOutInf?: string;
  readonly IBSCBS?: XmlElement;
  readonly DPS: DpsDocument;
  readonly dpsSignature?: XmlElement;
}

export interface NfseDocument {
  readonly versao: "1.01";
  readonly infNFSe: NfseInfo;
}

export interface ParsedNfse {
  readonly kind: "NFSe";
  readonly document: NfseDocument;
  readonly originalXml: string;
  readonly raw: XmlElement;
  readonly signature: XmlElement;
}

export const NATIONAL_NFSE_EVENT_CODES = [
  "e101101",
  "e105102",
  "e101103",
  "e105104",
  "e105105",
  "e202201",
  "e203202",
  "e204203",
  "e205204",
  "e202205",
  "e203206",
  "e204207",
  "e205208",
  "e305101",
  "e305102",
  "e305103",
] as const;

export type NfseEventCode = (typeof NATIONAL_NFSE_EVENT_CODES)[number];

export type EventAuthor =
  | { readonly CNPJAutor: string; readonly CPFAutor?: never }
  | { readonly CPFAutor: string; readonly CNPJAutor?: never };

export interface NfseEventPayload {
  readonly code: NfseEventCode;
  readonly details: XmlElement;
}

export interface EventRequestInfo {
  readonly Id: string;
  readonly tpAmb: Environment;
  readonly verAplic: string;
  readonly dhEvento: string;
  readonly autor: EventAuthor;
  readonly chNFSe: string;
  readonly evento: NfseEventPayload;
}

export interface EventRequestDocument {
  readonly versao: "1.01";
  readonly infPedReg: EventRequestInfo;
}

export interface ParsedEventRequest {
  readonly kind: "pedRegEvento";
  readonly document: EventRequestDocument;
  readonly originalXml: string;
  readonly raw: XmlElement;
  readonly signature?: XmlElement;
}

export interface RegisteredEventInfo {
  readonly Id: string;
  readonly verAplic: string;
  readonly ambGer: "1" | "2" | "3";
  readonly nSeqEvento: string;
  readonly dhProc: string;
  readonly nDFSe: string;
  readonly pedRegEvento: EventRequestDocument;
  readonly requestSignature?: XmlElement;
}

export interface RegisteredEventDocument {
  readonly versao: "1.01";
  readonly infEvento: RegisteredEventInfo;
}

export interface ParsedRegisteredEvent {
  readonly kind: "evento";
  readonly document: RegisteredEventDocument;
  readonly originalXml: string;
  readonly raw: XmlElement;
  readonly signature: XmlElement;
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [name: string]: JsonValue };

export type ParsedNationalDocument =
  | ParsedDps
  | ParsedNfse
  | ParsedEventRequest
  | ParsedRegisteredEvent;

export interface SefinResponseDocument {
  readonly path: string;
  readonly encoding: "xml" | "gzip-base64";
  readonly parsed: ParsedNationalDocument;
}

interface ParsedSefinResponseBase {
  readonly status?: number;
  readonly contentType?: string;
  readonly originalBody: string;
  readonly raw: JsonValue | string;
}

export interface ParsedSefinSuccessResponse extends ParsedSefinResponseBase {
  readonly kind: "success";
  readonly documents: readonly SefinResponseDocument[];
}

export interface ParsedSefinRejectionResponse extends ParsedSefinResponseBase {
  readonly kind: "rejection";
  readonly reason: "remote-rejection" | "no-document";
}

export type ParsedSefinResponse = ParsedSefinSuccessResponse | ParsedSefinRejectionResponse;
