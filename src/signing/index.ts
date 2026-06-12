export { createPemSigner, createPkcs12Signer } from "./credentials.js";
export {
  signDpsXml,
  signEventRequestXml,
  signNationalXml,
  signNfseXml,
  signRegisteredEventXml,
} from "./sign.js";
export {
  NATIONAL_NFSE_XMLDSIG_PROFILE,
  type NationalXmlDocumentKind,
  type PemSignerOptions,
  type Pkcs12SignerOptions,
  type SigningCertificateInfo,
  type SignXmlOptions,
  type VerifyXmlSignatureOptions,
  type VerifyXmlSignatureResult,
  XMLDSIG_C14N_1_0,
  XMLDSIG_ENVELOPED_SIGNATURE,
  XMLDSIG_NAMESPACE,
  XMLDSIG_RSA_SHA256,
  XMLDSIG_SHA256,
  type XmlSignatureIssue,
  type XmlSignatureIssueCode,
  type XmlSignatureProfile,
  type XmlSigner,
  type XmlSignerContext,
} from "./types.js";
export { verifyNationalXmlSignature } from "./verify.js";
