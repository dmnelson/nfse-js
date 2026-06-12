import { createPrivateKey, createPublicKey, KeyObject, X509Certificate } from "node:crypto";
import { XmlSignatureError } from "../errors.js";
import type { PemSignerOptions, SigningCertificateInfo } from "./types.js";

export interface NormalizedCredentials {
  readonly privateKey: KeyObject;
  readonly certificateChainPem: readonly [string, ...string[]];
}

export function normalizePemCredentials(options: PemSignerOptions): NormalizedCredentials {
  if (options.certificateChain.length === 0) {
    throw new XmlSignatureError(
      "invalid-credentials",
      "at least one signing certificate is required",
    );
  }

  try {
    const privateKey =
      options.privateKey instanceof KeyObject
        ? options.privateKey
        : createPrivateKey({
            key: Buffer.from(options.privateKey),
            ...(options.passphrase === undefined
              ? {}
              : { passphrase: Buffer.from(options.passphrase) }),
          });
    if (privateKey.type !== "private" || privateKey.asymmetricKeyType !== "rsa") {
      throw new Error("the signing key must be an RSA private key");
    }

    const certificateChainPem = options.certificateChain.map((certificate) =>
      new X509Certificate(Buffer.from(certificate)).toString(),
    ) as [string, ...string[]];
    const leaf = new X509Certificate(certificateChainPem[0]);
    const privatePublicKey = createPublicKey(privateKey).export({
      format: "der",
      type: "spki",
    });
    const certificatePublicKey = leaf.publicKey.export({
      format: "der",
      type: "spki",
    });
    if (!privatePublicKey.equals(certificatePublicKey)) {
      throw new Error("the private key does not match the leaf certificate");
    }

    return { privateKey, certificateChainPem };
  } catch (error) {
    if (error instanceof XmlSignatureError) {
      throw error;
    }
    throw new XmlSignatureError("invalid-credentials", "could not load PEM credentials", {
      cause: error,
    });
  }
}

export function certificateInfo(certificate: X509Certificate): SigningCertificateInfo {
  return {
    subject: certificate.subject,
    issuer: certificate.issuer,
    serialNumber: certificate.serialNumber,
    fingerprint256: certificate.fingerprint256,
    validFrom: certificate.validFrom,
    validTo: certificate.validTo,
  };
}

export function isCertificateValidAt(certificate: X509Certificate, date: Date): boolean {
  const time = date.getTime();
  return time >= Date.parse(certificate.validFrom) && time <= Date.parse(certificate.validTo);
}

export function isCertificateTrusted(
  certificateChain: readonly X509Certificate[],
  trustedCertificates: readonly X509Certificate[],
): boolean {
  if (certificateChain.length === 0 || trustedCertificates.length === 0) {
    return false;
  }

  const trustedFingerprints = new Set(
    trustedCertificates.map((certificate) => certificate.fingerprint256),
  );
  const candidates = [...certificateChain.slice(1), ...trustedCertificates];
  let current = certificateChain[0] as X509Certificate;
  const visited = new Set<string>();

  while (!visited.has(current.fingerprint256)) {
    visited.add(current.fingerprint256);
    if (trustedFingerprints.has(current.fingerprint256)) {
      return true;
    }

    let issuer: X509Certificate | undefined;
    for (const candidate of candidates) {
      if (
        !visited.has(candidate.fingerprint256) &&
        current.issuer === candidate.subject &&
        current.verify(candidate.publicKey)
      ) {
        issuer = candidate;
        break;
      }
    }
    if (!issuer) {
      return false;
    }
    current = issuer;
  }
  return false;
}
