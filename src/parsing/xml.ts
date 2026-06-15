import { Buffer } from "node:buffer";
import { DOMParser, type Element as XmlDomElement } from "@xmldom/xmldom";
import { XMLValidator } from "fast-xml-parser";
import { NATIONAL_NFSE_NAMESPACE, NATIONAL_NFSE_VERSION } from "../core/types.js";
import { XmlParseError } from "../errors.js";
import type { XmlElement, XmlParseOptions, XmlValue } from "./types.js";

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_DEPTH = 100;
const MAX_CONFIGURED_DEPTH = 1_000;
const XMLDSIG_NAMESPACE = "http://www.w3.org/2000/09/xmldsig#";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const XML_METADATA = Symbol("nfse-js.xml-metadata");

interface XmlMetadata {
  readonly namespace: string;
  readonly properties: Readonly<Record<string, readonly string[]>>;
  readonly attributes: Readonly<Record<string, string>>;
}

type InternalXmlElement = XmlElement & {
  readonly [XML_METADATA]?: XmlMetadata;
};

export interface ParsedXmlRoot {
  readonly name: string;
  readonly value: XmlElement;
  readonly document: XmlElement;
}

export interface ResolvedXmlParseLimits {
  readonly maxBytes: number;
  readonly maxDepth: number;
}

export function resolveXmlParseLimits(options: XmlParseOptions): ResolvedXmlParseLimits {
  return {
    maxBytes: positiveSafeInteger(options.maxBytes, DEFAULT_MAX_BYTES, "maxBytes"),
    maxDepth: positiveSafeInteger(
      options.maxDepth,
      DEFAULT_MAX_DEPTH,
      "maxDepth",
      MAX_CONFIGURED_DEPTH,
    ),
  };
}

export function parseXmlRoot(xml: string, options: XmlParseOptions = {}): ParsedXmlRoot {
  const limits = resolveXmlParseLimits(options);
  const byteLength = Buffer.byteLength(xml, "utf8");
  if (byteLength > limits.maxBytes) {
    throw new XmlParseError(
      "document-too-large",
      "$",
      `document is ${byteLength} bytes; maximum is ${limits.maxBytes}`,
    );
  }
  if (containsUnsafeDeclaration(xml)) {
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
    const documentNode = new DOMParser({
      onError(level, message) {
        if (level !== "warning") {
          throw new Error(message);
        }
      },
    }).parseFromString(xml, "application/xml");
    const root = documentNode.documentElement;
    if (!root) {
      throw new XmlParseError("unexpected-root", "$", "root element is missing");
    }

    const name = root.localName || root.nodeName;
    const converted = convertElement(root, name, 0, limits.maxDepth, true);
    if (typeof converted === "string" || Array.isArray(converted)) {
      throw new XmlParseError("invalid-value", name, "expected an XML element");
    }
    const rootValue = converted as XmlElement;

    return {
      name,
      value: rootValue,
      document: { [name]: rootValue },
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

export function element(
  value: unknown,
  path: string,
  expectedNamespace = NATIONAL_NFSE_NAMESPACE,
): XmlElement {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new XmlParseError("invalid-value", path, "expected an XML element");
  }
  const result = value as InternalXmlElement;
  assertNamespace(metadata(result).namespace, expectedNamespace, path);
  return result;
}

export function requiredElement(parent: XmlElement, name: string, path: string): XmlElement {
  return requiredElementInNamespace(parent, name, path, NATIONAL_NFSE_NAMESPACE);
}

export function optionalElement(
  parent: XmlElement,
  name: string,
  path: string,
): XmlElement | undefined {
  return optionalElementInNamespace(parent, name, path, NATIONAL_NFSE_NAMESPACE);
}

export function elementValues(
  parent: XmlElement,
  name: string,
  path: string,
): readonly XmlElement[] {
  const entries = values(parent[name]);
  if (entries.length === 0) {
    return [];
  }
  assertPropertyNamespaces(
    parent,
    name,
    NATIONAL_NFSE_NAMESPACE,
    `${path}.${name}`,
    entries.length,
  );
  return entries.map((entry, index) => element(entry, `${path}.${name}[${index}]`));
}

export function stringValues(parent: XmlElement, name: string, path: string): readonly string[] {
  const entries = values(parent[name]);
  if (entries.length === 0) {
    return [];
  }
  assertPropertyNamespaces(
    parent,
    name,
    NATIONAL_NFSE_NAMESPACE,
    `${path}.${name}`,
    entries.length,
  );
  return entries.map((entry, index) => stringValue(entry, `${path}.${name}[${index}]`));
}

export function requiredSignatureElement(parent: XmlElement, path: string): XmlElement {
  const signature = requiredElementInNamespace(parent, "Signature", path, XMLDSIG_NAMESPACE);
  assertNamespaceTree(signature, XMLDSIG_NAMESPACE, `${path}.Signature`);
  return signature;
}

export function optionalSignatureElement(parent: XmlElement, path: string): XmlElement | undefined {
  const signature = optionalElementInNamespace(parent, "Signature", path, XMLDSIG_NAMESPACE);
  if (signature) {
    assertNamespaceTree(signature, XMLDSIG_NAMESPACE, `${path}.Signature`);
  }
  return signature;
}

export function requiredString(parent: XmlElement, name: string, path: string): string {
  const value = parent[name];
  if (value === undefined) {
    throw new XmlParseError("missing-value", `${path}.${name}`, "required value is missing");
  }
  assertPropertyNamespace(parent, name, NATIONAL_NFSE_NAMESPACE, `${path}.${name}`);
  return stringValue(value, `${path}.${name}`);
}

export function optionalString(parent: XmlElement, name: string, path: string): string | undefined {
  const value = parent[name];
  if (value === undefined) {
    return undefined;
  }
  assertPropertyNamespace(parent, name, NATIONAL_NFSE_NAMESPACE, `${path}.${name}`);
  return stringValue(value, `${path}.${name}`);
}

export function requiredAttribute(parent: XmlElement, name: string, path: string): string {
  const key = `@_${name}`;
  const value = parent[key];
  if (value === undefined) {
    throw new XmlParseError("missing-value", `${path}.${key}`, "required value is missing");
  }
  assertAttributeNamespace(parent, key, "", `${path}.${key}`);
  return stringValue(value, `${path}.${key}`);
}

export function optionalAttribute(
  parent: XmlElement,
  name: string,
  path: string,
): string | undefined {
  const key = `@_${name}`;
  const value = parent[key];
  if (value === undefined) {
    return undefined;
  }
  assertAttributeNamespace(parent, key, "", `${path}.${key}`);
  return stringValue(value, `${path}.${key}`);
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
  assertNamespace(metadata(root).namespace, NATIONAL_NFSE_NAMESPACE, path);
  const version = requiredAttribute(root, "versao", path);
  if (version !== NATIONAL_NFSE_VERSION) {
    throw new XmlParseError(
      "invalid-value",
      `${path}.@_versao`,
      `unsupported National NFS-e version ${version}`,
    );
  }
}

export function assertNationalNamespaceTree(root: XmlElement, path: string): void {
  assertNamespaceTree(root, NATIONAL_NFSE_NAMESPACE, path);
}

function requiredElementInNamespace(
  parent: XmlElement,
  name: string,
  path: string,
  expectedNamespace: string,
): XmlElement {
  const value = parent[name];
  if (value === undefined) {
    throw new XmlParseError("missing-value", `${path}.${name}`, "required element is missing");
  }
  assertPropertyNamespace(parent, name, expectedNamespace, `${path}.${name}`);
  return element(value, `${path}.${name}`, expectedNamespace);
}

function optionalElementInNamespace(
  parent: XmlElement,
  name: string,
  path: string,
  expectedNamespace: string,
): XmlElement | undefined {
  const value = parent[name];
  if (value === undefined) {
    return undefined;
  }
  assertPropertyNamespace(parent, name, expectedNamespace, `${path}.${name}`);
  return element(value, `${path}.${name}`, expectedNamespace);
}

function convertElement(
  node: XmlDomElement,
  path: string,
  depth: number,
  maxDepth: number,
  forceObject = false,
): XmlValue {
  if (depth > maxDepth) {
    throw new XmlParseError("invalid-xml", path, `XML nesting exceeds ${maxDepth}`);
  }

  const result: Record<string, XmlValue> = {};
  const propertyNamespaces: Record<string, string[]> = {};
  const attributeNamespaces: Record<string, string> = {};
  for (let index = 0; index < node.attributes.length; index += 1) {
    const attribute = node.attributes.item(index);
    if (!attribute || attribute.namespaceURI === XMLNS_NAMESPACE) {
      continue;
    }
    const key = `@_${attribute.localName || attribute.name}`;
    if (result[key] !== undefined) {
      throw new XmlParseError("invalid-value", `${path}.${key}`, "ambiguous namespaced attribute");
    }
    result[key] = attribute.value;
    attributeNamespaces[key] = attribute.namespaceURI ?? "";
  }

  const textParts: string[] = [];
  let hasElementChildren = false;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === child.ELEMENT_NODE) {
      hasElementChildren = true;
      const childElement = child as XmlDomElement;
      const name = childElement.localName || childElement.nodeName;
      const childPath = `${path}.${name}`;
      const converted = convertElement(childElement, childPath, depth + 1, maxDepth);
      const existing = result[name];
      if (existing === undefined) {
        result[name] = converted;
      } else if (Array.isArray(existing)) {
        result[name] = [...existing, converted];
      } else {
        result[name] = [existing, converted];
      }
      const namespaces = propertyNamespaces[name] ?? [];
      namespaces.push(childElement.namespaceURI ?? "");
      propertyNamespaces[name] = namespaces;
    } else if (child.nodeType === child.TEXT_NODE || child.nodeType === child.CDATA_SECTION_NODE) {
      textParts.push(child.nodeValue ?? "");
    }
  }

  const text = textParts.join("");
  const hasAttributes = Object.keys(attributeNamespaces).length > 0;
  if (!hasElementChildren && !hasAttributes && !forceObject) {
    return text;
  }
  if (text && (!hasElementChildren || text.trim().length > 0)) {
    result["#text"] = text;
  }

  Object.defineProperty(result, XML_METADATA, {
    value: {
      namespace: node.namespaceURI ?? "",
      properties: propertyNamespaces,
      attributes: attributeNamespaces,
    } satisfies XmlMetadata,
    enumerable: false,
  });
  return result;
}

function metadata(elementValue: XmlElement): XmlMetadata {
  const value = (elementValue as InternalXmlElement)[XML_METADATA];
  if (!value) {
    throw new XmlParseError("invalid-value", "$", "XML namespace metadata is missing");
  }
  return value;
}

function assertPropertyNamespace(
  parent: XmlElement,
  name: string,
  expectedNamespace: string,
  path: string,
): void {
  const namespaces = metadata(parent).properties[name] ?? [];
  if (namespaces.length !== 1) {
    throw new XmlParseError("invalid-value", path, `expected exactly one ${name} element`);
  }
  assertNamespace(namespaces[0] ?? "", expectedNamespace, path);
}

function assertPropertyNamespaces(
  parent: XmlElement,
  name: string,
  expectedNamespace: string,
  path: string,
  expectedCount: number,
): void {
  const namespaces = metadata(parent).properties[name] ?? [];
  if (namespaces.length !== expectedCount) {
    throw new XmlParseError(
      "invalid-value",
      path,
      `namespace metadata does not match ${expectedCount} ${name} elements`,
    );
  }
  for (const namespace of namespaces) {
    assertNamespace(namespace, expectedNamespace, path);
  }
}

function assertAttributeNamespace(
  parent: XmlElement,
  name: string,
  expectedNamespace: string,
  path: string,
): void {
  const namespace = metadata(parent).attributes[name];
  if (namespace === undefined) {
    throw new XmlParseError("invalid-value", path, "attribute namespace metadata is missing");
  }
  assertNamespace(namespace, expectedNamespace, path);
}

function assertNamespace(actual: string, expected: string, path: string): void {
  if (actual !== expected) {
    throw new XmlParseError(
      "invalid-value",
      path,
      `expected namespace ${expected || "(none)"}, found ${actual || "(none)"}`,
    );
  }
}

function assertNamespaceTree(value: XmlElement, expectedNamespace: string, path: string): void {
  const valueMetadata = metadata(value);
  assertNamespace(valueMetadata.namespace, expectedNamespace, path);
  for (const [name, namespaces] of Object.entries(valueMetadata.properties)) {
    for (const namespace of namespaces) {
      assertNamespace(namespace, expectedNamespace, `${path}.${name}`);
    }
    for (const [index, child] of values(value[name]).entries()) {
      if (child !== null && typeof child === "object" && !Array.isArray(child)) {
        assertNamespaceTree(
          child as XmlElement,
          expectedNamespace,
          namespaces.length > 1 ? `${path}.${name}[${index}]` : `${path}.${name}`,
        );
      }
    }
  }
}

function stringValue(value: XmlValue, path: string): string {
  if (typeof value !== "string") {
    throw new XmlParseError("invalid-value", path, "expected text content");
  }
  return value;
}

function positiveSafeInteger(
  value: number | undefined,
  defaultValue: number,
  name: string,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const resolved = value ?? defaultValue;
  if (!Number.isSafeInteger(resolved) || resolved <= 0 || resolved > maximum) {
    throw new XmlParseError(
      "invalid-value",
      `$options.${name}`,
      `${name} must be a positive safe integer no greater than ${maximum}`,
    );
  }
  return resolved;
}

function containsUnsafeDeclaration(xml: string): boolean {
  let index = 0;
  while (index < xml.length) {
    const opening = xml.indexOf("<!", index);
    if (opening === -1) {
      return false;
    }
    if (xml.startsWith("<!--", opening)) {
      const closing = xml.indexOf("-->", opening + 4);
      index = closing === -1 ? xml.length : closing + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", opening)) {
      const closing = xml.indexOf("]]>", opening + 9);
      index = closing === -1 ? xml.length : closing + 3;
      continue;
    }
    if (/^<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml.slice(opening))) {
      return true;
    }
    index = opening + 2;
  }
  return false;
}
