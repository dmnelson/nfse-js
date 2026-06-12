import { Buffer } from "node:buffer";
import { gunzipSync } from "node:zlib";
import { SefinResponseParseError } from "../errors.js";
import { parseDpsXml } from "./dps.js";
import { parseEventRequestXml, parseRegisteredEventXml } from "./events.js";
import { parseNfseXml } from "./nfse.js";
import type {
  JsonValue,
  ParsedNationalDocument,
  ParsedSefinResponse,
  SefinResponseDocument,
  SefinResponseParseOptions,
} from "./types.js";
import { omitUndefined, parseXmlRoot } from "./xml.js";

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_DEPTH = 100;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const NATIONAL_XML_ROOT =
  /^(?:<\?xml[^>]*>\s*)?<(?:[A-Za-z_][\w.-]*:)?(?:DPS|NFSe|pedRegEvento|evento)(?:\s|>)/;

export function parseSefinDocumentResponse(
  body: string,
  options: SefinResponseParseOptions = {},
): ParsedSefinResponse {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const byteLength = Buffer.byteLength(body, "utf8");
  if (byteLength > maxBytes) {
    throw new SefinResponseParseError(
      "document-too-large",
      "$",
      `response is ${byteLength} bytes; maximum is ${maxBytes}`,
    );
  }

  const trimmed = body.trim();
  const raw: JsonValue | string = trimmed.startsWith("<")
    ? body
    : parseJson(body, options.maxDepth ?? DEFAULT_MAX_DEPTH);
  const documents: SefinResponseDocument[] = [];

  if (typeof raw === "string") {
    collectStringDocument(raw, "$", documents, options, maxBytes);
  } else {
    collectJsonDocuments(raw, "$", 0, documents, options, maxBytes);
  }

  const metadata = {
    status: options.status,
    contentType: options.contentType,
    originalBody: body,
    raw,
  };
  if (documents.length > 0) {
    return omitUndefined<ParsedSefinResponse>({
      kind: "success",
      ...metadata,
      documents,
    });
  }

  return omitUndefined<ParsedSefinResponse>({
    kind: "rejection",
    ...metadata,
    reason:
      options.status !== undefined && options.status >= 400 ? "remote-rejection" : "no-document",
  });
}

function parseJson(body: string, maxDepth: number): JsonValue {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch (error) {
    throw new SefinResponseParseError("invalid-json", "$", "response is not valid JSON", {
      cause: error,
    });
  }
  assertJsonValue(value, "$", 0, maxDepth);
  return value;
}

function assertJsonValue(
  value: unknown,
  path: string,
  depth: number,
  maxDepth: number,
): asserts value is JsonValue {
  if (depth > maxDepth) {
    throw new SefinResponseParseError("nesting-too-deep", path, `JSON nesting exceeds ${maxDepth}`);
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertJsonValue(entry, `${path}[${index}]`, depth + 1, maxDepth);
    });
    return;
  }
  if (typeof value === "object") {
    for (const [name, entry] of Object.entries(value)) {
      assertJsonValue(entry, `${path}.${name}`, depth + 1, maxDepth);
    }
    return;
  }
  throw new SefinResponseParseError("invalid-json", path, "unsupported JSON value");
}

function collectJsonDocuments(
  value: JsonValue,
  path: string,
  depth: number,
  documents: SefinResponseDocument[],
  options: SefinResponseParseOptions,
  maxBytes: number,
): void {
  if (typeof value === "string") {
    collectStringDocument(value, path, documents, options, maxBytes);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectJsonDocuments(entry, `${path}[${index}]`, depth + 1, documents, options, maxBytes);
    });
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [name, entry] of Object.entries(value)) {
      collectJsonDocuments(entry, `${path}.${name}`, depth + 1, documents, options, maxBytes);
    }
  }
}

function collectStringDocument(
  value: string,
  path: string,
  documents: SefinResponseDocument[],
  options: SefinResponseParseOptions,
  maxBytes: number,
): void {
  const trimmed = value.trim();
  if (NATIONAL_XML_ROOT.test(trimmed)) {
    const parsed = parseNationalDocument(value, options);
    if (parsed) {
      documents.push({ path, encoding: "xml", parsed });
    }
    return;
  }

  if (trimmed.length < 8 || trimmed.length % 4 !== 0 || !BASE64.test(trimmed)) {
    return;
  }
  const compressed = Buffer.from(trimmed, "base64");
  if (compressed[0] !== 0x1f || compressed[1] !== 0x8b) {
    return;
  }

  let xml: string;
  try {
    xml = gunzipSync(compressed, { maxOutputLength: maxBytes }).toString("utf8");
  } catch (error) {
    throw new SefinResponseParseError(
      "invalid-compressed-document",
      path,
      "gzip/base64 document could not be decoded within the configured limit",
      { cause: error },
    );
  }
  const parsed = parseNationalDocument(xml, options);
  if (parsed) {
    documents.push({ path, encoding: "gzip-base64", parsed });
  }
}

function parseNationalDocument(
  xml: string,
  options: SefinResponseParseOptions,
): ParsedNationalDocument | undefined {
  const root = parseXmlRoot(xml, options);
  switch (root.name) {
    case "DPS":
      return parseDpsXml(xml, options);
    case "NFSe":
      return parseNfseXml(xml, options);
    case "pedRegEvento":
      return parseEventRequestXml(xml, options);
    case "evento":
      return parseRegisteredEventXml(xml, options);
    default:
      return undefined;
  }
}
