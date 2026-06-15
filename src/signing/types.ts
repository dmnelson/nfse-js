import type { KeyObject } from "node:crypto";

export const XMLDSIG_NAMESPACE = "http://www.w3.org/2000/09/xmldsig#";
export const XMLDSIG_C14N_1_0 = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
export const XMLDSIG_ENVELOPED_SIGNATURE = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
export const XMLDSIG_RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
export const XMLDSIG_SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";

export interface XmlSignatureProfile {
  readonly canonicalizationAlgorithm: string;
  readonly signatureAlgorithm: string;
  readonly digestAlgorithm: string;
  readonly transforms: readonly string[];
}

/**
 * The accessible National NFS-e material requires W3C XMLDSig but does not
 * currently publish algorithm URIs. This secure SHA-256 profile is explicit
 * and can be replaced through SignXmlOptions.profile when SEFIN requires a
 * different interoperable profile.
 */
export const NATIONAL_NFSE_XMLDSIG_PROFILE: XmlSignatureProfile = {
  canonicalizationAlgorithm: XMLDSIG_C14N_1_0,
  signatureAlgorithm: XMLDSIG_RSA_SHA256,
  digestAlgorithm: XMLDSIG_SHA256,
  transforms: [XMLDSIG_ENVELOPED_SIGNATURE, XMLDSIG_C14N_1_0],
};

export type NationalXmlDocumentKind = "DPS" | "NFSe" | "pedRegEvento" | "evento";

export interface XmlSignerContext {
  readonly documentKind: NationalXmlDocumentKind;
  readonly targetId: string;
  readonly profile: XmlSignatureProfile;
}

export interface XmlSigner {
  readonly certificateChainPem: readonly [string, ...string[]];
  sign(data: Uint8Array, context: XmlSignerContext): Promise<Uint8Array>;
}

export interface PemSignerOptions {
  readonly privateKey: string | Uint8Array | KeyObject;
  readonly certificateChain: readonly (string | Uint8Array)[];
  readonly passphrase?: string | Uint8Array;
}

export interface Pkcs12SignerOptions {
  readonly password?: string;
}

export interface SignXmlOptions {
  readonly profile?: XmlSignatureProfile;
  readonly maxBytes?: number;
  readonly maxDepth?: number;
  readonly validateCertificateTime?: boolean;
  readonly now?: Date;
}

export interface VerifyXmlSignatureOptions {
  readonly profile?: XmlSignatureProfile;
  readonly trustedCertificates?: readonly (string | Uint8Array)[];
  readonly requireTrustedCertificate?: boolean;
  readonly validateCertificateTime?: boolean;
  readonly now?: Date;
  readonly maxBytes?: number;
  readonly maxDepth?: number;
}

export type XmlSignatureIssueCode =
  | "invalid-signature"
  | "invalid-reference"
  | "unexpected-profile"
  | "certificate-expired"
  | "certificate-untrusted"
  | "invalid-certificate-chain";

export interface XmlSignatureIssue {
  readonly code: XmlSignatureIssueCode;
  readonly message: string;
}

export interface SigningCertificateInfo {
  readonly subject: string;
  readonly issuer: string;
  readonly serialNumber: string;
  readonly fingerprint256: string;
  readonly validFrom: string;
  readonly validTo: string;
}

export interface VerifyXmlSignatureResult {
  readonly valid: boolean;
  readonly documentKind: NationalXmlDocumentKind;
  readonly targetId: string;
  readonly signatureAlgorithm: string;
  readonly digestAlgorithm: string;
  readonly canonicalizationAlgorithm: string;
  readonly certificate: SigningCertificateInfo;
  readonly certificateTimeValid: boolean;
  readonly certificateTrusted: boolean;
  readonly authenticatedXml?: string;
  readonly issues: readonly XmlSignatureIssue[];
}
