import { X509Certificate } from "node:crypto";
import { SignedXml } from "xml-crypto";
import { XmlSignatureError } from "../errors.js";
import { analyzeCertificateChain, certificateInfo, isCertificateValidAt } from "./certificates.js";
import { inspectNationalDocument } from "./document.js";
import { inspectXmlSignatureStructure, matchesSignatureProfile } from "./structure.js";
import {
  NATIONAL_NFSE_XMLDSIG_PROFILE,
  type VerifyXmlSignatureOptions,
  type VerifyXmlSignatureResult,
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

  const structure = inspectXmlSignatureStructure(descriptor.signature);
  let certificateChain: X509Certificate[];
  let trustedCertificates: X509Certificate[];
  try {
    certificateChain = structure.certificateValues.map(
      (value) => new X509Certificate(Buffer.from(value, "base64")),
    );
    trustedCertificates = (options.trustedCertificates ?? []).map(
      (certificate) => new X509Certificate(Buffer.from(certificate)),
    );
  } catch (error) {
    throw new XmlSignatureError(
      "invalid-credentials",
      "signature contains an invalid X509 certificate",
      { cause: error },
    );
  }
  const leaf = certificateChain[0] as X509Certificate;
  const verificationTime = options.now ?? new Date();
  const certificateTimeValid = certificateChain.every((certificate) =>
    isCertificateValidAt(certificate, verificationTime),
  );
  const chainAnalysis = analyzeCertificateChain(certificateChain, trustedCertificates);
  const certificateTrusted = chainAnalysis.trusted;
  const issues: XmlSignatureIssue[] = [];
  const expectedProfile = options.profile ?? NATIONAL_NFSE_XMLDSIG_PROFILE;

  if (!matchesSignatureProfile(structure, expectedProfile)) {
    issues.push({
      code: "unexpected-profile",
      message: "signature algorithms do not match the expected XMLDSig profile",
    });
  }
  if (structure.referenceUri !== `#${descriptor.targetId}`) {
    issues.push({
      code: "invalid-reference",
      message: `signature must authenticate only #${descriptor.targetId}`,
    });
  }
  if (!chainAnalysis.valid) {
    issues.push({
      code: "invalid-certificate-chain",
      message: chainAnalysis.error ?? "signing certificate chain is invalid",
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

  let authenticatedXml: string | undefined;
  if (issues.length === 0) {
    const verifier = new SignedXml({
      publicCert: leaf.toString(),
      getCertFromKeyInfo: () => null,
    });
    try {
      verifier.loadSignature(descriptor.signature);
      const cryptographicallyValid = verifier.checkSignature(xml);
      const references = verifier.getReferences();
      const signedReferences = cryptographicallyValid ? verifier.getSignedReferences() : [];
      if (
        !cryptographicallyValid ||
        references.length !== 1 ||
        references[0]?.uri !== `#${descriptor.targetId}` ||
        signedReferences.length !== 1
      ) {
        issues.push({
          code: cryptographicallyValid ? "invalid-reference" : "invalid-signature",
          message: cryptographicallyValid
            ? `signature must authenticate only #${descriptor.targetId}`
            : "signature or reference digest is invalid",
        });
      } else {
        authenticatedXml = signedReferences[0];
      }
    } catch (error) {
      issues.push({
        code: "invalid-signature",
        message: error instanceof Error ? error.message : "signature verification failed",
      });
    }
  }
  const valid = issues.length === 0;

  return {
    valid,
    documentKind: descriptor.kind,
    targetId: descriptor.targetId,
    signatureAlgorithm: structure.signatureAlgorithm,
    digestAlgorithm: structure.digestAlgorithm,
    canonicalizationAlgorithm: structure.canonicalizationAlgorithm,
    certificate: certificateInfo(leaf),
    certificateTimeValid,
    certificateTrusted,
    ...(valid && authenticatedXml ? { authenticatedXml } : {}),
    issues,
  };
}
