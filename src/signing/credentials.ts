import { sign as signBytes } from "node:crypto";
import * as forge from "node-forge";
import { XmlSignatureError } from "../errors.js";
import { normalizePemCredentials } from "./certificates.js";
import type {
  PemSignerOptions,
  Pkcs12SignerOptions,
  XmlSignatureProfile,
  XmlSigner,
} from "./types.js";

export function createPemSigner(options: PemSignerOptions): XmlSigner {
  const credentials = normalizePemCredentials(options);
  return {
    certificateChainPem: credentials.certificateChainPem,
    async sign(data, context) {
      const algorithm = nodeSignatureAlgorithm(context.profile);
      return signBytes(algorithm, data, credentials.privateKey);
    },
  };
}

export function createPkcs12Signer(
  input: Uint8Array,
  options: Pkcs12SignerOptions = {},
): XmlSigner {
  try {
    const bytes = Buffer.from(input).toString("binary");
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(bytes));
    const pfx = forge.pkcs12.pkcs12FromAsn1(asn1, false, options.password);
    const bags = pfx.safeContents.flatMap((safeContent) => safeContent.safeBags);
    const keyBag = bags.find((bag) => bag.key);
    const certificates = bags.flatMap((bag) => (bag.cert ? [bag.cert] : []));
    if (!keyBag?.key || certificates.length === 0) {
      throw new Error("PKCS#12 does not contain a private key and certificate");
    }

    const privateKey = forge.pki.privateKeyToPem(keyBag.key);
    const certificateChain = certificates.map((certificate) =>
      forge.pki.certificateToPem(certificate),
    );
    const matchingCertificateIndex = certificateChain.findIndex((certificate) => {
      try {
        normalizePemCredentials({ privateKey, certificateChain: [certificate] });
        return true;
      } catch {
        return false;
      }
    });
    if (matchingCertificateIndex < 0) {
      throw new Error("PKCS#12 private key does not match any certificate");
    }

    const leaf = certificateChain[matchingCertificateIndex] as string;
    const orderedChain = [
      leaf,
      ...certificateChain.filter((_, index) => index !== matchingCertificateIndex),
    ];
    return createPemSigner({ privateKey, certificateChain: orderedChain });
  } catch (error) {
    if (error instanceof XmlSignatureError) {
      throw error;
    }
    throw new XmlSignatureError("invalid-credentials", "could not load PKCS#12 credentials", {
      cause: error,
    });
  }
}

function nodeSignatureAlgorithm(profile: XmlSignatureProfile): string {
  switch (profile.signatureAlgorithm) {
    case "http://www.w3.org/2000/09/xmldsig#rsa-sha1":
      return "RSA-SHA1";
    case "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256":
      return "RSA-SHA256";
    case "http://www.w3.org/2001/04/xmldsig-more#rsa-sha512":
      return "RSA-SHA512";
    default:
      throw new XmlSignatureError(
        "unsupported-algorithm",
        `PEM/PKCS#12 signer does not support ${profile.signatureAlgorithm}`,
      );
  }
}
