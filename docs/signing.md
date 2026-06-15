# XML Signing and Verification

The signing module supports PEM, PKCS#12/PFX, and external asynchronous signers.
Private keys are never written to disk by the library. RSA signing keys and
certificate public keys must be at least 2048 bits.

## PEM and PKCS#12

```ts
import {
  createPemSigner,
  createPkcs12Signer,
  signDpsXml,
} from "nfse-js/signing";

const pemSigner = createPemSigner({
  privateKey: privateKeyPem,
  certificateChain: [leafCertificatePem, intermediateCertificatePem],
});

const pfxSigner = createPkcs12Signer(pfxBytes, { password });
const signedXml = await signDpsXml(unsignedXml, pfxSigner);
```

## HSM or remote signer

Implement `XmlSigner`. The provider receives only canonicalized bytes and
context; the private key can remain inside an HSM or KMS.

```ts
import type { XmlSigner } from "nfse-js/signing";

const signer: XmlSigner = {
  certificateChainPem,
  async sign(data, context) {
    return kms.sign({
      algorithm: context.profile.signatureAlgorithm,
      data,
    });
  },
};
```

The returned signature is verified locally against the leaf certificate before
signed XML is emitted, so wrong-key and incompatible remote-signer
configurations fail immediately.

## Verification

```ts
import { verifyNationalXmlSignature } from "nfse-js/signing";

const result = verifyNationalXmlSignature(receivedXml, {
  trustedCertificates: trustAnchors,
  requireTrustedCertificate: true,
});

if (!result.valid || !result.authenticatedXml) {
  throw new Error(JSON.stringify(result.issues));
}
```

Only `authenticatedXml` should be consumed after verification. It is omitted
when digest, signature, reference, profile, certificate time, or trust checks
fail.

## Operational requirements

- Confirm the exact algorithm profile with the active SEFIN environment.
- Maintain trust anchors outside application source.
- Certificate paths enforce CA basic constraints, certificate-signing key
  usage, path-length constraints, supported critical extensions, and leaf
  digital-signature usage.
- Perform revocation checks in deployment infrastructure; the package does not
  currently fetch CRLs or OCSP responses.
- Never log keys, PFX bytes, passwords, complete signed XML, or taxpayer data.
- Keep an independently produced XMLDSig fixture before claiming conformance.

The repository tests currently generate self-signed credentials in memory and
verify signatures with the same implementation stack. They are synthetic
cryptographic tests, not independent or ICP-Brasil conformance evidence.
