import { Buffer } from "node:buffer";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { NATIONAL_NFSE_NAMESPACE, NATIONAL_NFSE_VERSION } from "../core/types.js";
import { XmlParseError } from "../errors.js";
import type { XmlElement, XmlParseOptions, XmlValue } from "./types.js";

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_DEPTH = 100;
const UNSAFE_DECLARATION = /<!\s*(?:DOCTYPE|ENTITY)\b/i;

export interface ParsedXmlRoot {
  readonly name: string;
  readonly value: XmlElement;
  readonly document: XmlElement;
}

export function parseXmlRoot(xml: string, options: XmlParseOptions = {}): ParsedXmlRoot {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const byteLength = Buffer.byteLength(xml, "utf8");
  if (byteLength > maxBytes) {
    throw new XmlParseError(
      "document-too-large",
      "$",
      `document is ${byteLength} bytes; maximum is ${maxBytes}`,
    );
  }
  if (UNSAFE_DECLARATION.test(xml)) {
    throw new XmlParseError("unsafe-xml", "$", "DOCTYPE and ENTITY declarations are not allowed");
  }

  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new XmlParseError(
      "invalid-xml",
      "$",
      validation.err.msg,
      validation.err.line
        ? { cause: { line: validation.err.line, column: validation.err.col } }
        : undefined,
    );
  }

  try {
    const parsed = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      removeNSPrefix: true,
      parseTagValue: false,
      parseAttributeValue: false,
      trimValues: true,
      processEntities: {
        enabled: true,
        maxEntitySize: 64,
        maxExpansionDepth: 8,
        maxTotalExpansions: 10_000,
        maxExpandedLength: maxBytes,
        maxEntityCount: 0,
      },
      maxNestedTags: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    }).parse(xml) as unknown;

    const document = element(parsed, "$");
    const rootNames = Object.keys(document).filter((name) => !name.startsWith("?"));
    if (rootNames.length !== 1) {
      throw new XmlParseError(
        "unexpected-root",
        "$",
        `expected exactly one root element, found ${rootNames.length}`,
      );
    }

    const name = rootNames[0];
    if (name === undefined) {
      throw new XmlParseError("unexpected-root", "$", "root element is missing");
    }
    return {
      name,
      value: document[name] === "" ? {} : element(document[name], name),
      document,
    };
  } catch (error) {
    if (error instanceof XmlParseError) {
      throw error;
    }
    throw new XmlParseError("invalid-xml", "$", "parser rejected the document", {
      cause: error,
    });
  }
}

export function element(value: unknown, path: string): XmlElement {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new XmlParseError("invalid-value", path, "expected an XML element");
  }
  return value as XmlElement;
}

export function requiredElement(parent: XmlElement, name: string, path: string): XmlElement {
  const value = parent[name];
  if (value === undefined) {
    throw new XmlParseError("missing-value", `${path}.${name}`, "required element is missing");
  }
  return element(value, `${path}.${name}`);
}

export function optionalElement(
  parent: XmlElement,
  name: string,
  path: string,
): XmlElement | undefined {
  const value = parent[name];
  return value === undefined ? undefined : element(value, `${path}.${name}`);
}

export function requiredString(parent: XmlElement, name: string, path: string): string {
  const value = parent[name];
  if (value === undefined) {
    throw new XmlParseError("missing-value", `${path}.${name}`, "required value is missing");
  }
  return stringValue(value, `${path}.${name}`);
}

export function optionalString(parent: XmlElement, name: string, path: string): string | undefined {
  const value = parent[name];
  return value === undefined ? undefined : stringValue(value, `${path}.${name}`);
}

export function requiredAttribute(parent: XmlElement, name: string, path: string): string {
  return requiredString(parent, `@_${name}`, path);
}

export function optionalAttribute(
  parent: XmlElement,
  name: string,
  path: string,
): string | undefined {
  return optionalString(parent, `@_${name}`, path);
}

export function values(value: XmlValue | undefined): readonly XmlValue[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function omitUndefined<T>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map((entry) => omitUndefined(entry)) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter((entry) => entry[1] !== undefined)
        .map(([name, entry]) => [name, omitUndefined(entry)]),
    ) as T;
  }
  return value as T;
}

export function assertNationalRoot(root: XmlElement, path: string): void {
  const namespace = optionalAttribute(root, "xmlns", path);
  if (namespace !== undefined && namespace !== NATIONAL_NFSE_NAMESPACE) {
    throw new XmlParseError(
      "invalid-value",
      `${path}.@_xmlns`,
      `expected namespace ${NATIONAL_NFSE_NAMESPACE}`,
    );
  }

  const version = requiredAttribute(root, "versao", path);
  if (version !== NATIONAL_NFSE_VERSION) {
    throw new XmlParseError(
      "invalid-value",
      `${path}.@_versao`,
      `unsupported National NFS-e version ${version}`,
    );
  }
}

function stringValue(value: XmlValue, path: string): string {
  if (typeof value !== "string") {
    throw new XmlParseError("invalid-value", path, "expected text content");
  }
  return value;
}
