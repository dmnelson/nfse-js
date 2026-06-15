import { XmlSignatureError } from "../errors.js";
import { XMLDSIG_NAMESPACE, type XmlSignatureProfile } from "./types.js";

export interface XmlSignatureStructure {
  readonly certificateValues: readonly string[];
  readonly signatureAlgorithm: string;
  readonly canonicalizationAlgorithm: string;
  readonly digestAlgorithm: string;
  readonly transforms: readonly string[];
  readonly referenceUri: string;
}

export function inspectXmlSignatureStructure(signature: Element): XmlSignatureStructure {
  const signedInfo = onlyDirectChild(signature, "SignedInfo");
  const signatureValue = onlyDirectChild(signature, "SignatureValue");
  const keyInfo = onlyDirectChild(signature, "KeyInfo");
  const canonicalizationMethod = onlyDirectChild(signedInfo, "CanonicalizationMethod");
  const signatureMethod = onlyDirectChild(signedInfo, "SignatureMethod");
  const reference = onlyDirectChild(signedInfo, "Reference");
  const transformsNode = onlyDirectChild(reference, "Transforms");
  const digestMethod = onlyDirectChild(reference, "DigestMethod");
  onlyDirectChild(reference, "DigestValue");

  assertOnlyDescendant(signature, "SignedInfo", [signedInfo]);
  assertOnlyDescendant(signature, "SignatureValue", [signatureValue]);
  assertOnlyDescendant(signature, "CanonicalizationMethod", [canonicalizationMethod]);
  assertOnlyDescendant(signature, "SignatureMethod", [signatureMethod]);
  assertOnlyDescendant(signature, "Reference", [reference]);
  assertOnlyDescendant(signature, "DigestMethod", [digestMethod]);

  const transforms = directChildren(transformsNode, "Transform");
  if (transforms.length === 0) {
    fail("signature Reference must contain at least one XMLDSig Transform");
  }
  assertOnlyDescendant(signature, "Transform", transforms);

  const x509Data = onlyDirectChild(keyInfo, "X509Data");
  const certificates = directChildren(x509Data, "X509Certificate");
  if (certificates.length === 0) {
    fail("signature KeyInfo does not contain an X509 certificate");
  }
  assertOnlyDescendant(signature, "X509Certificate", certificates);

  return {
    certificateValues: certificates.map((certificate) => {
      const value = certificate.textContent?.replace(/\s+/g, "");
      if (!value) {
        fail("signature contains an empty X509 certificate");
      }
      return value;
    }),
    signatureAlgorithm: requiredAlgorithm(signatureMethod),
    canonicalizationAlgorithm: requiredAlgorithm(canonicalizationMethod),
    digestAlgorithm: requiredAlgorithm(digestMethod),
    transforms: transforms.map(requiredAlgorithm),
    referenceUri: reference.getAttribute("URI") ?? "",
  };
}

export function matchesSignatureProfile(
  structure: XmlSignatureStructure,
  profile: XmlSignatureProfile,
): boolean {
  return (
    structure.signatureAlgorithm === profile.signatureAlgorithm &&
    structure.canonicalizationAlgorithm === profile.canonicalizationAlgorithm &&
    structure.digestAlgorithm === profile.digestAlgorithm &&
    structure.transforms.length === profile.transforms.length &&
    structure.transforms.every((transform, index) => transform === profile.transforms[index])
  );
}

function onlyDirectChild(parent: Element, name: string): Element {
  const matchingLocalNames = directElementChildren(parent).filter(
    (child) => child.localName === name,
  );
  if (
    matchingLocalNames.length !== 1 ||
    matchingLocalNames[0]?.namespaceURI !== XMLDSIG_NAMESPACE
  ) {
    fail(`signature must contain exactly one XMLDSig ${name} in the expected location`);
  }
  return matchingLocalNames[0] as Element;
}

function directChildren(parent: Element, name: string): Element[] {
  return directElementChildren(parent).filter(
    (child) => child.localName === name && child.namespaceURI === XMLDSIG_NAMESPACE,
  );
}

function directElementChildren(parent: Element): Element[] {
  const result: Element[] = [];
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === child.ELEMENT_NODE) {
      result.push(child as Element);
    }
  }
  return result;
}

function assertOnlyDescendant(
  signature: Element,
  localName: string,
  expected: readonly Element[],
): void {
  const descendants = elementsByLocalName(signature, localName);
  if (
    descendants.length !== expected.length ||
    descendants.some((element) => !expected.includes(element))
  ) {
    fail(`signature contains an ambiguous ${localName} element`);
  }
}

function elementsByLocalName(parent: Element, localName: string): Element[] {
  const result: Element[] = [];
  const visit = (element: Element): void => {
    for (let child = element.firstChild; child; child = child.nextSibling) {
      if (child.nodeType !== child.ELEMENT_NODE) {
        continue;
      }
      const childElement = child as Element;
      if (childElement.localName === localName) {
        result.push(childElement);
      }
      visit(childElement);
    }
  };
  visit(parent);
  return result;
}

function requiredAlgorithm(element: Element): string {
  const algorithm = element.getAttribute("Algorithm");
  if (!algorithm) {
    fail(`signature is missing ${element.localName}/@Algorithm`);
  }
  return algorithm;
}

function fail(message: string): never {
  throw new XmlSignatureError("verification-failed", message);
}
