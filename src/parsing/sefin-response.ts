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
const DEFAULT_MAX_DOCUMENTS = 32;
const MAX_CONFIGURED_DEPTH = 1_000;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const NATIONAL_XML_ROOT = /^(?:[A-Za-z_][\w.-]*:)?(?:DPS|NFSe|pedRegEvento|evento)(?:\s|\/?>)/;

interface CollectionState {
  readonly documents: SefinResponseDocument[];
  readonly options: SefinResponseParseOptions;
  readonly maxBytes: number;
  readonly maxDecompressedBytes: number;
  readonly maxDocuments: number;
  decompressedBytes: number;
}

export function parseSefinDocumentResponse(
  body: string,
  options: SefinResponseParseOptions = {},
): ParsedSefinResponse {
  const maxBytes = responseLimit(options.maxBytes, DEFAULT_MAX_BYTES, "maxBytes");
  const maxDepth = responseLimit(
    options.maxDepth,
    DEFAULT_MAX_DEPTH,
    "maxDepth",
    MAX_CONFIGURED_DEPTH,
  );
  const maxDecompressedBytes = responseLimit(
    options.maxDecompressedBytes,
    maxBytes,
    "maxDecompressedBytes",
  );
  const maxDocuments = responseLimit(options.maxDocuments, DEFAULT_MAX_DOCUMENTS, "maxDocuments");
  const byteLength = Buffer.byteLength(body, "utf8");
  if (byteLength > maxBytes) {
    throw new SefinResponseParseError(
      "document-too-large",
      "$",
      `response is ${byteLength} bytes; maximum is ${maxBytes}`,
    );
  }

  const trimmed = body.trim();
  const raw: JsonValue | string =
    trimmed.startsWith("<") || trimmed.startsWith("\uFEFF<") ? body : parseJson(body, maxDepth);
  const metadata = {
    status: options.status,
    contentType: options.contentType,
    originalBody: body,
    raw,
  };

  if (options.status !== undefined && options.status >= 400) {
    return omitUndefined<ParsedSefinResponse>({
      kind: "rejection",
      ...metadata,
      reason: "remote-rejection",
    });
  }

  const state: CollectionState = {
    documents: [],
    options: { ...options, maxBytes, maxDepth },
    maxBytes,
    maxDecompressedBytes,
    maxDocuments,
    decompressedBytes: 0,
  };
  if (typeof raw === "string") {
    collectStringDocument(raw, "$", state);
  } else {
    collectJsonDocuments(raw, "$", state);
  }

  if (state.documents.length > 0) {
    return omitUndefined<ParsedSefinResponse>({
      kind: "success",
      ...metadata,
      documents: state.documents,
    });
  }

  return omitUndefined<ParsedSefinResponse>({
    kind: "rejection",
    ...metadata,
    reason: "no-document",
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

function collectJsonDocuments(value: JsonValue, path: string, state: CollectionState): void {
  if (typeof value === "string") {
    collectStringDocument(value, path, state);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectJsonDocuments(entry, `${path}[${index}]`, state);
    });
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [name, entry] of Object.entries(value)) {
      collectJsonDocuments(entry, `${path}.${name}`, state);
    }
  }
}

function collectStringDocument(value: string, path: string, state: CollectionState): void {
  const trimmed = value.trim();
  if (looksLikeNationalXml(trimmed)) {
    addDocument(value, path, "xml", state);
    return;
  }

  if (trimmed.length < 8 || trimmed.length % 4 !== 0 || !BASE64.test(trimmed)) {
    return;
  }
  const compressed = Buffer.from(trimmed, "base64");
  if (compressed[0] !== 0x1f || compressed[1] !== 0x8b) {
    return;
  }

  const remaining = state.maxDecompressedBytes - state.decompressedBytes;
  if (remaining <= 0) {
    throw new SefinResponseParseError(
      "document-too-large",
      path,
      `cumulative decompressed documents exceed ${state.maxDecompressedBytes} bytes`,
    );
  }

  if (compressed.byteLength >= 4) {
    const declaredSize = compressed.readUInt32LE(compressed.byteLength - 4);
    if (declaredSize > remaining) {
      throw new SefinResponseParseError(
        "document-too-large",
        path,
        `cumulative decompressed documents exceed ${state.maxDecompressedBytes} bytes`,
      );
    }
  }

  let decoded: Buffer;
  try {
    decoded = gunzipSync(compressed, {
      maxOutputLength: Math.min(state.maxBytes, remaining),
    });
  } catch (error) {
    throw new SefinResponseParseError(
      "invalid-compressed-document",
      path,
      "gzip/base64 document could not be decoded within the configured limits",
      { cause: error },
    );
  }
  if (decoded.byteLength > remaining) {
    throw new SefinResponseParseError(
      "document-too-large",
      path,
      `cumulative decompressed documents exceed ${state.maxDecompressedBytes} bytes`,
    );
  }
  state.decompressedBytes += decoded.byteLength;
  const xml = decoded.toString("utf8");
  if (!looksLikeNationalXml(xml.trim())) {
    return;
  }
  addDocument(xml, path, "gzip-base64", state);
}

function addDocument(
  xml: string,
  path: string,
  encoding: SefinResponseDocument["encoding"],
  state: CollectionState,
): void {
  let parsed: ParsedNationalDocument | undefined;
  try {
    parsed = parseNationalDocument(xml, state.options);
  } catch (error) {
    throw new SefinResponseParseError(
      "invalid-document",
      path,
      `${encoding === "gzip-base64" ? "decoded" : "embedded"} XML document is invalid`,
      { cause: error },
    );
  }
  if (parsed) {
    if (state.documents.length >= state.maxDocuments) {
      throw new SefinResponseParseError(
        "document-too-large",
        path,
        `response contains more than ${state.maxDocuments} documents`,
      );
    }
    state.documents.push({ path, encoding, parsed });
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

function looksLikeNationalXml(value: string): boolean {
  let remaining = value.startsWith("\uFEFF") ? value.slice(1).trimStart() : value;
  while (remaining.startsWith("<?") || remaining.startsWith("<!--")) {
    const closing = remaining.startsWith("<!--")
      ? remaining.indexOf("-->") + 3
      : remaining.indexOf("?>") + 2;
    if (closing < 2) {
      return false;
    }
    remaining = remaining.slice(closing).trimStart();
  }
  if (!remaining.startsWith("<")) {
    return false;
  }
  return NATIONAL_XML_ROOT.test(remaining.slice(1));
}

function responseLimit(
  value: number | undefined,
  defaultValue: number,
  name: string,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const resolved = value ?? defaultValue;
  if (!Number.isSafeInteger(resolved) || resolved <= 0 || resolved > maximum) {
    throw new SefinResponseParseError(
      name === "maxDepth" ? "nesting-too-deep" : "document-too-large",
      `$options.${name}`,
      `${name} must be a positive safe integer no greater than ${maximum}`,
    );
  }
  return resolved;
}
