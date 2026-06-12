import type { BinaryLike, KeyLike } from "node:crypto";
import { X509Certificate } from "node:crypto";
import { type ErrorFirstCallback, type SignatureAlgorithm, SignedXml } from "xml-crypto";
import { XmlSignatureError } from "../errors.js";
import { isCertificateValidAt } from "./certificates.js";
import { documentRootXPath, inspectNationalDocument, signedTargetXPath } from "./document.js";
import {
  NATIONAL_NFSE_XMLDSIG_PROFILE,
  type NationalXmlDocumentKind,
  type SignXmlOptions,
  type XmlSignatureProfile,
  type XmlSigner,
} from "./types.js";

export async function signDpsXml(
  xml: string,
  signer: XmlSigner,
  options?: SignXmlOptions,
): Promise<string> {
  return signExpectedDocument(xml, "DPS", signer, options);
}

export async function signNfseXml(
  xml: string,
  signer: XmlSigner,
  options?: SignXmlOptions,
): Promise<string> {
  return signExpectedDocument(xml, "NFSe", signer, options);
}

export async function signEventRequestXml(
  xml: string,
  signer: XmlSigner,
  options?: SignXmlOptions,
): Promise<string> {
  return signExpectedDocument(xml, "pedRegEvento", signer, options);
}

export async function signRegisteredEventXml(
  xml: string,
  signer: XmlSigner,
  options?: SignXmlOptions,
): Promise<string> {
  return signExpectedDocument(xml, "evento", signer, options);
}

export async function signNationalXml(
  xml: string,
  signer: XmlSigner,
  options: SignXmlOptions = {},
): Promise<string> {
  const descriptor = inspectNationalDocument(xml, options);
  return signDescriptor(
    xml,
    descriptor.kind,
    descriptor.targetId,
    descriptor.signature,
    signer,
    options,
  );
}

async function signExpectedDocument(
  xml: string,
  expectedKind: NationalXmlDocumentKind,
  signer: XmlSigner,
  options: SignXmlOptions = {},
): Promise<string> {
  const descriptor = inspectNationalDocument(xml, options);
  if (descriptor.kind !== expectedKind) {
    throw new XmlSignatureError(
      "unsupported-document",
      `expected ${expectedKind}, found ${descriptor.kind}`,
    );
  }
  return signDescriptor(
    xml,
    descriptor.kind,
    descriptor.targetId,
    descriptor.signature,
    signer,
    options,
  );
}

async function signDescriptor(
  xml: string,
  kind: NationalXmlDocumentKind,
  targetId: string,
  existingSignature: Element | undefined,
  signer: XmlSigner,
  options: SignXmlOptions,
): Promise<string> {
  if (existingSignature) {
    throw new XmlSignatureError(
      "existing-signature",
      `${kind} already contains a document signature`,
    );
  }
  if (signer.certificateChainPem.length === 0) {
    throw new XmlSignatureError(
      "invalid-credentials",
      "the signer must provide its certificate chain",
    );
  }

  const leaf = new X509Certificate(signer.certificateChainPem[0]);
  if (
    options.validateCertificateTime !== false &&
    !isCertificateValidAt(leaf, options.now ?? new Date())
  ) {
    throw new XmlSignatureError(
      "certificate-expired",
      "the signing certificate is not valid at the signing time",
    );
  }

  const profile = options.profile ?? NATIONAL_NFSE_XMLDSIG_PROFILE;
  const signedXml = new SignedXml({
    privateKey: Buffer.from("external-signer"),
    publicCert: signer.certificateChainPem.join("\n"),
    signatureAlgorithm: profile.signatureAlgorithm,
    canonicalizationAlgorithm: profile.canonicalizationAlgorithm,
  });
  signedXml.SignatureAlgorithms[profile.signatureAlgorithm] = externalAlgorithm(
    signer,
    profile,
    kind,
    targetId,
  );
  signedXml.addReference({
    xpath: signedTargetXPath(kind),
    transforms: profile.transforms,
    digestAlgorithm: profile.digestAlgorithm,
  });

  try {
    await new Promise<void>((resolve, reject) => {
      signedXml.computeSignature(
        xml,
        {
          location: {
            reference: documentRootXPath(kind),
            action: "append",
          },
        },
        (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        },
      );
    });
    return signedXml.getSignedXml();
  } catch (error) {
    if (error instanceof XmlSignatureError) {
      throw error;
    }
    throw new XmlSignatureError("signing-failed", `could not sign ${kind}`, {
      cause: error,
    });
  }
}

function externalAlgorithm(
  signer: XmlSigner,
  profile: XmlSignatureProfile,
  documentKind: NationalXmlDocumentKind,
  targetId: string,
): new () => SignatureAlgorithm {
  class ExternalSignatureAlgorithm {
    getSignature(
      signedInfo: BinaryLike,
      _privateKey: KeyLike,
      callback?: ErrorFirstCallback<string>,
    ): string | undefined {
      if (!callback) {
        throw new XmlSignatureError(
          "signing-failed",
          "external signing requires the asynchronous XMLDSig flow",
        );
      }
      signer
        .sign(binaryLikeToBuffer(signedInfo), { documentKind, targetId, profile })
        .then((signature) => callback(null, Buffer.from(signature).toString("base64")))
        .catch((error: unknown) =>
          callback(
            error instanceof Error ? error : new Error("external signer rejected the digest"),
          ),
        );
      return undefined;
    }

    getAlgorithmName(): string {
      return profile.signatureAlgorithm;
    }
  }

  return ExternalSignatureAlgorithm as unknown as new () => SignatureAlgorithm;
}

function binaryLikeToBuffer(value: BinaryLike): Buffer {
  if (typeof value === "string") {
    return Buffer.from(value);
  }
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new XmlSignatureError("signing-failed", "unsupported SignedInfo byte representation");
}
