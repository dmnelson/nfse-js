import { DOMParser } from "@xmldom/xmldom";
import { NATIONAL_NFSE_NAMESPACE } from "../core/types.js";
import { XmlSignatureError } from "../errors.js";
import { parseXmlRoot } from "../parsing/xml.js";
import { type NationalXmlDocumentKind, XMLDSIG_NAMESPACE } from "./types.js";

interface DocumentDescriptor {
  readonly root: Element;
  readonly target: Element;
  readonly kind: NationalXmlDocumentKind;
  readonly targetId: string;
  readonly signature?: Element;
}

const TARGET_BY_ROOT: Readonly<Record<NationalXmlDocumentKind, string>> = {
  DPS: "infDPS",
  NFSe: "infNFSe",
  pedRegEvento: "infPedReg",
  evento: "infEvento",
};

export function inspectNationalDocument(
  xml: string,
  options: { readonly maxBytes?: number; readonly maxDepth?: number } = {},
): DocumentDescriptor {
  const parsedRoot = parseXmlRoot(xml, options);
  if (!isDocumentKind(parsedRoot.name)) {
    throw new XmlSignatureError(
      "unsupported-document",
      `unsupported National document root ${parsedRoot.name}`,
    );
  }

  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parsedDocumentRoot = document.documentElement;
  if (!parsedDocumentRoot) {
    throw new XmlSignatureError("unsupported-document", "XML root is missing");
  }
  const root = parsedDocumentRoot as unknown as Element;
  if (root.localName !== parsedRoot.name || root.namespaceURI !== NATIONAL_NFSE_NAMESPACE) {
    throw new XmlSignatureError(
      "unsupported-document",
      `root must use the National NFS-e namespace ${NATIONAL_NFSE_NAMESPACE}`,
    );
  }

  const targetName = TARGET_BY_ROOT[parsedRoot.name];
  const targets = directChildren(root, targetName, NATIONAL_NFSE_NAMESPACE);
  if (targets.length !== 1) {
    throw new XmlSignatureError(
      "unsupported-document",
      `expected one ${targetName} child, found ${targets.length}`,
    );
  }
  const target = targets[0] as Element;
  const targetId = target.getAttribute("Id");
  if (!targetId) {
    throw new XmlSignatureError("missing-id", `${targetName} must have an Id attribute`);
  }

  const signatures = directChildren(root, "Signature", XMLDSIG_NAMESPACE);
  if (signatures.length > 1) {
    throw new XmlSignatureError(
      "multiple-signatures",
      `expected at most one document signature, found ${signatures.length}`,
    );
  }

  const descriptor = {
    root,
    target,
    kind: parsedRoot.name,
    targetId,
  };
  const signature = signatures[0];
  return signature ? { ...descriptor, signature } : descriptor;
}

export function documentRootXPath(kind: NationalXmlDocumentKind): string {
  return `/*[local-name(.)='${kind}' and namespace-uri(.)='${NATIONAL_NFSE_NAMESPACE}']`;
}

export function signedTargetXPath(kind: NationalXmlDocumentKind): string {
  const target = TARGET_BY_ROOT[kind];
  return `${documentRootXPath(kind)}/*[local-name(.)='${target}' and namespace-uri(.)='${NATIONAL_NFSE_NAMESPACE}']`;
}

function directChildren(parent: Element, name: string, namespace: string): Element[] {
  const result: Element[] = [];
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (
      child.nodeType === child.ELEMENT_NODE &&
      (child as Element).localName === name &&
      (child as Element).namespaceURI === namespace
    ) {
      result.push(child as Element);
    }
  }
  return result;
}

function isDocumentKind(value: string): value is NationalXmlDocumentKind {
  return value === "DPS" || value === "NFSe" || value === "pedRegEvento" || value === "evento";
}
