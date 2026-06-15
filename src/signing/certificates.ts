import { createPrivateKey, createPublicKey, KeyObject, X509Certificate } from "node:crypto";
import * as forge from "node-forge";
import { XmlSignatureError } from "../errors.js";
import type { PemSignerOptions, SigningCertificateInfo } from "./types.js";

const MINIMUM_RSA_BITS = 2048;
const SUPPORTED_CRITICAL_EXTENSIONS = new Set(["basicConstraints", "keyUsage"]);

export interface NormalizedCredentials {
  readonly privateKey: KeyObject;
  readonly certificateChainPem: readonly [string, ...string[]];
}

export interface CertificateChainAnalysis {
  readonly valid: boolean;
  readonly trusted: boolean;
  readonly error?: string;
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
    assertRsaKeyStrength(privateKey, "signing key");

    const certificateChainPem = options.certificateChain.map((certificate) =>
      new X509Certificate(Buffer.from(certificate)).toString(),
    ) as [string, ...string[]];
    const certificateChain = certificateChainPem.map(
      (certificate) => new X509Certificate(certificate),
    );
    const leaf = certificateChain[0] as X509Certificate;
    assertCertificateChainValid(certificateChain);
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

export function analyzeCertificateChain(
  certificateChain: readonly X509Certificate[],
  trustedCertificates: readonly X509Certificate[],
): CertificateChainAnalysis {
  try {
    const embeddedPath = buildEmbeddedPath(certificateChain);
    validatePath(embeddedPath);

    if (trustedCertificates.length === 0) {
      return { valid: true, trusted: false };
    }

    const trustedFingerprints = new Set(
      trustedCertificates.map((certificate) => certificate.fingerprint256),
    );
    const embeddedAnchorIndex = embeddedPath.findIndex((certificate) =>
      trustedFingerprints.has(certificate.fingerprint256),
    );
    if (embeddedAnchorIndex >= 0) {
      validatePath(embeddedPath.slice(0, embeddedAnchorIndex + 1));
      return { valid: true, trusted: true };
    }

    const trustedSuffix = findIssuerPath(
      embeddedPath[embeddedPath.length - 1] as X509Certificate,
      trustedCertificates,
      trustedFingerprints,
      new Set(embeddedPath.map((certificate) => certificate.fingerprint256)),
    );
    if (!trustedSuffix) {
      return { valid: true, trusted: false };
    }

    validatePath([...embeddedPath, ...trustedSuffix]);
    return { valid: true, trusted: true };
  } catch (error) {
    return {
      valid: false,
      trusted: false,
      error: error instanceof Error ? error.message : "certificate chain is invalid",
    };
  }
}

export function assertCertificateChainValid(certificateChain: readonly X509Certificate[]): void {
  const analysis = analyzeCertificateChain(certificateChain, []);
  if (!analysis.valid) {
    throw new Error(analysis.error ?? "certificate chain is invalid");
  }
}

export function parseCertificateChain(
  certificates: readonly (string | Uint8Array)[],
): X509Certificate[] {
  return certificates.map((certificate) => new X509Certificate(Buffer.from(certificate)));
}

function buildEmbeddedPath(
  certificateChain: readonly X509Certificate[],
): readonly X509Certificate[] {
  if (certificateChain.length === 0) {
    throw new Error("certificate chain is empty");
  }
  if (certificateChain.length === 1) {
    return certificateChain;
  }

  const path = findPathUsingAll(
    certificateChain[0] as X509Certificate,
    certificateChain.slice(1),
    new Set([(certificateChain[0] as X509Certificate).fingerprint256]),
  );
  if (!path) {
    throw new Error("embedded certificates do not form a single issuer path");
  }
  return path;
}

function findPathUsingAll(
  current: X509Certificate,
  remaining: readonly X509Certificate[],
  visited: ReadonlySet<string>,
): readonly X509Certificate[] | undefined {
  if (remaining.length === 0) {
    return [current];
  }

  for (const candidate of remaining) {
    if (visited.has(candidate.fingerprint256) || !isIssuedBy(current, candidate)) {
      continue;
    }
    const suffix = findPathUsingAll(
      candidate,
      remaining.filter((certificate) => certificate !== candidate),
      new Set([...visited, candidate.fingerprint256]),
    );
    if (suffix) {
      return [current, ...suffix];
    }
  }
  return undefined;
}

function findIssuerPath(
  current: X509Certificate,
  candidates: readonly X509Certificate[],
  trustedFingerprints: ReadonlySet<string>,
  visited: ReadonlySet<string>,
): readonly X509Certificate[] | undefined {
  for (const candidate of candidates) {
    if (visited.has(candidate.fingerprint256) || !isIssuedBy(current, candidate)) {
      continue;
    }
    if (trustedFingerprints.has(candidate.fingerprint256)) {
      return [candidate];
    }
    const suffix = findIssuerPath(
      candidate,
      candidates,
      trustedFingerprints,
      new Set([...visited, candidate.fingerprint256]),
    );
    if (suffix) {
      return [candidate, ...suffix];
    }
  }
  return undefined;
}

function validatePath(path: readonly X509Certificate[]): void {
  const parsed = path.map(parseCertificateConstraints);

  for (let index = 0; index < path.length; index += 1) {
    const certificate = path[index] as X509Certificate;
    assertCertificateKeyStrength(certificate, index === 0);
    assertSupportedCriticalExtensions(parsed[index] as ParsedCertificateConstraints);
  }

  const leafUsage = parsed[0]?.keyUsage;
  if (leafUsage && !leafUsage.digitalSignature && !leafUsage.nonRepudiation) {
    throw new Error("leaf certificate key usage does not permit digital signatures");
  }

  for (let index = 1; index < path.length; index += 1) {
    const child = path[index - 1] as X509Certificate;
    const issuer = path[index] as X509Certificate;
    const constraints = parsed[index] as ParsedCertificateConstraints;
    if (!isIssuedBy(child, issuer)) {
      throw new Error(`certificate ${child.subject} is not issued by ${issuer.subject}`);
    }
    if (!issuer.ca || constraints.basicConstraints?.cA !== true) {
      throw new Error(`issuer certificate ${issuer.subject} is not authorized as a CA`);
    }
    if (constraints.keyUsage && !constraints.keyUsage.keyCertSign) {
      throw new Error(`issuer certificate ${issuer.subject} cannot sign certificates`);
    }
    const pathLength = constraints.basicConstraints?.pathLenConstraint;
    if (pathLength !== undefined && index - 1 > pathLength) {
      throw new Error(`issuer certificate ${issuer.subject} exceeds its path length constraint`);
    }
  }
}

interface ParsedCertificateConstraints {
  readonly extensions: readonly CertificateExtension[];
  readonly basicConstraints?: CertificateExtension;
  readonly keyUsage?: CertificateExtension;
}

interface CertificateExtension {
  readonly name?: string;
  readonly id?: string;
  readonly critical?: boolean;
  readonly cA?: boolean;
  readonly pathLenConstraint?: number;
  readonly digitalSignature?: boolean;
  readonly nonRepudiation?: boolean;
  readonly keyCertSign?: boolean;
}

function parseCertificateConstraints(certificate: X509Certificate): ParsedCertificateConstraints {
  const asn1 = forge.asn1.fromDer(
    forge.util.createBuffer(Buffer.from(certificate.raw).toString("binary")),
  );
  const parsed = forge.pki.certificateFromAsn1(asn1);
  const extensions = parsed.extensions as CertificateExtension[];
  const basicConstraints = extensions.find((extension) => extension.name === "basicConstraints");
  const keyUsage = extensions.find((extension) => extension.name === "keyUsage");
  return {
    extensions,
    ...(basicConstraints ? { basicConstraints } : {}),
    ...(keyUsage ? { keyUsage } : {}),
  };
}

function assertSupportedCriticalExtensions(constraints: ParsedCertificateConstraints): void {
  const unsupported = constraints.extensions.find(
    (extension) =>
      extension.critical === true &&
      (!extension.name || !SUPPORTED_CRITICAL_EXTENSIONS.has(extension.name)),
  );
  if (unsupported) {
    throw new Error(
      `certificate contains unsupported critical extension ${unsupported.name ?? unsupported.id ?? "unknown"}`,
    );
  }
}

function assertCertificateKeyStrength(certificate: X509Certificate, requireRsa: boolean): void {
  const key = certificate.publicKey;
  if (requireRsa && key.asymmetricKeyType !== "rsa") {
    throw new Error("leaf certificate must contain an RSA public key");
  }
  if (key.asymmetricKeyType === "rsa") {
    assertRsaKeyStrength(key, `certificate ${certificate.subject}`);
  }
}

function assertRsaKeyStrength(key: KeyObject, description: string): void {
  const modulusLength = key.asymmetricKeyDetails?.modulusLength;
  if (modulusLength === undefined || modulusLength < MINIMUM_RSA_BITS) {
    throw new Error(`${description} must use RSA with at least ${MINIMUM_RSA_BITS} bits`);
  }
}

function isIssuedBy(certificate: X509Certificate, issuer: X509Certificate): boolean {
  return (
    certificate.issuer === issuer.subject &&
    certificate.checkIssued(issuer) &&
    certificate.verify(issuer.publicKey)
  );
}
