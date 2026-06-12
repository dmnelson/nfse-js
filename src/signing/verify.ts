import { X509Certificate } from "node:crypto";
import { SignedXml } from "xml-crypto";
import { XmlSignatureError } from "../errors.js";
import { certificateInfo, isCertificateTrusted, isCertificateValidAt } from "./certificates.js";
import { inspectNationalDocument } from "./document.js";
import {
  NATIONAL_NFSE_XMLDSIG_PROFILE,
  type VerifyXmlSignatureOptions,
  type VerifyXmlSignatureResult,
  XMLDSIG_NAMESPACE,
  type XmlSignatureIssue,
} from "./types.js";

export function verifyNationalXmlSignature(
  xml: string,
  options: VerifyXmlSignatureOptions = {},
): VerifyXmlSignatureResult {
  const descriptor = inspectNationalDocument(xml, options);
  if (!descriptor.signature) {
    throw new XmlSignatureError(
      "missing-signature",
      `${descriptor.kind} does not contain a document signature`,
    );
  }

  const certificateNodes = descriptor.signature.getElementsByTagNameNS(
    XMLDSIG_NAMESPACE,
    "X509Certificate",
  );
  if (certificateNodes.length === 0) {
    throw new XmlSignatureError(
      "invalid-credentials",
      "signature KeyInfo does not contain an X509 certificate",
    );
  }
  let certificateChain: X509Certificate[];
  try {
    certificateChain = Array.from({ length: certificateNodes.length }, (_, index) => {
      const value = certificateNodes.item(index)?.textContent?.replace(/\s+/g, "");
      if (!value) {
        throw new Error("signature contains an empty X509 certificate");
      }
      return new X509Certificate(Buffer.from(value, "base64"));
    });
  } catch (error) {
    throw new XmlSignatureError(
      "invalid-credentials",
      "signature contains an invalid X509 certificate",
      { cause: error },
    );
  }
  const leaf = certificateChain[0] as X509Certificate;
  const trustedCertificates = (options.trustedCertificates ?? []).map(
    (certificate) => new X509Certificate(Buffer.from(certificate)),
  );
  const verificationTime = options.now ?? new Date();
  const certificateTimeValid = certificateChain.every((certificate) =>
    isCertificateValidAt(certificate, verificationTime),
  );
  const certificateTrusted = isCertificateTrusted(certificateChain, trustedCertificates);
  const issues: XmlSignatureIssue[] = [];

  const verifier = new SignedXml({
    publicCert: leaf.toString(),
    getCertFromKeyInfo: () => null,
  });
  try {
    verifier.loadSignature(descriptor.signature);
  } catch (error) {
    throw new XmlSignatureError("verification-failed", "could not load XML signature", {
      cause: error,
    });
  }

  let cryptographicallyValid = false;
  let signatureFailureReported = false;
  try {
    cryptographicallyValid = verifier.checkSignature(xml);
  } catch (error) {
    signatureFailureReported = true;
    issues.push({
      code: "invalid-signature",
      message: error instanceof Error ? error.message : "signature verification failed",
    });
  }
  if (!cryptographicallyValid && !signatureFailureReported) {
    issues.push({ code: "invalid-signature", message: "signature or reference digest is invalid" });
  }

  const references = verifier.getReferences();
  const reference = references[0];
  const signedReferences = cryptographicallyValid ? verifier.getSignedReferences() : [];
  if (
    references.length !== 1 ||
    reference?.uri !== `#${descriptor.targetId}` ||
    signedReferences.length !== 1
  ) {
    issues.push({
      code: "invalid-reference",
      message: `signature must authenticate only #${descriptor.targetId}`,
    });
  }
  if (options.validateCertificateTime !== false && !certificateTimeValid) {
    issues.push({
      code: "certificate-expired",
      message: "signing certificate is not valid at the verification time",
    });
  }
  if (options.requireTrustedCertificate && !certificateTrusted) {
    issues.push({
      code: "certificate-untrusted",
      message: "signing certificate does not chain to a configured trust anchor",
    });
  }

  const signatureAlgorithm = childAlgorithm(descriptor.signature, "SignatureMethod");
  const canonicalizationAlgorithm = childAlgorithm(descriptor.signature, "CanonicalizationMethod");
  const digestAlgorithm = childAlgorithm(descriptor.signature, "DigestMethod");
  const transforms = childAlgorithms(descriptor.signature, "Transform");
  const expectedProfile = options.profile ?? NATIONAL_NFSE_XMLDSIG_PROFILE;
  if (
    signatureAlgorithm !== expectedProfile.signatureAlgorithm ||
    canonicalizationAlgorithm !== expectedProfile.canonicalizationAlgorithm ||
    digestAlgorithm !== expectedProfile.digestAlgorithm ||
    transforms.length !== expectedProfile.transforms.length ||
    transforms.some((transform, index) => transform !== expectedProfile.transforms[index])
  ) {
    issues.push({
      code: "unexpected-profile",
      message: "signature algorithms do not match the expected XMLDSig profile",
    });
  }
  const authenticatedXml = signedReferences[0];

  return {
    valid: issues.length === 0,
    documentKind: descriptor.kind,
    targetId: descriptor.targetId,
    signatureAlgorithm,
    digestAlgorithm,
    canonicalizationAlgorithm,
    certificate: certificateInfo(leaf),
    certificateTimeValid,
    certificateTrusted,
    ...(authenticatedXml ? { authenticatedXml } : {}),
    issues,
  };
}

function childAlgorithm(signature: Element, name: string): string {
  const nodes = signature.getElementsByTagNameNS(XMLDSIG_NAMESPACE, name);
  const algorithm = nodes.item(0)?.getAttribute("Algorithm");
  if (!algorithm) {
    throw new XmlSignatureError("verification-failed", `signature is missing ${name}/@Algorithm`);
  }
  return algorithm;
}

function childAlgorithms(signature: Element, name: string): string[] {
  const nodes = signature.getElementsByTagNameNS(XMLDSIG_NAMESPACE, name);
  return Array.from({ length: nodes.length }, (_, index) => {
    const algorithm = nodes.item(index)?.getAttribute("Algorithm");
    if (!algorithm) {
      throw new XmlSignatureError("verification-failed", `signature is missing ${name}/@Algorithm`);
    }
    return algorithm;
  });
}
