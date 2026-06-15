import { createPrivateKey, sign as signBytes } from "node:crypto";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import * as forge from "node-forge";
import { beforeAll, describe, expect, it } from "vitest";
import { SignedXml } from "xml-crypto";
import {
  createDps,
  serializeDps,
  validateDpsXml,
  validateEventRequestXml,
  type XmlSignatureError,
} from "../src/index.js";
import { parseDpsXml, parseEventRequestXml } from "../src/parsing/index.js";
import {
  createPemSigner,
  createPkcs12Signer,
  NATIONAL_NFSE_XMLDSIG_PROFILE,
  signDpsXml,
  signEventRequestXml,
  signNationalXml,
  signNfseXml,
  signRegisteredEventXml,
  verifyNationalXmlSignature,
  type XmlSigner,
} from "../src/signing/index.js";
import { validDpsInput } from "./fixtures.js";

const NAMESPACE = "http://www.sped.fazenda.gov.br/nfse";
const NFSE_KEY = "1".repeat(50);
const EVENT_REQUEST_ID = `PRE${NFSE_KEY}101101`;
const VERIFICATION_TIME = new Date("2026-06-12T12:00:00Z");

interface TestCredentials {
  readonly privateKeyPem: string;
  readonly certificatePem: string;
  readonly pkcs12: Uint8Array;
}

let credentials: TestCredentials;

beforeAll(() => {
  credentials = createTestCredentials();
});

describe("National XML signatures", () => {
  it("signs and verifies a DPS with an authenticated reference", async () => {
    const signer = createPemSigner({
      privateKey: credentials.privateKeyPem,
      certificateChain: [credentials.certificatePem],
    });
    const unsigned = serializeDps(validDpsInput());
    const signed = await signDpsXml(unsigned, signer, { now: VERIFICATION_TIME });

    expect(parseDpsXml(signed).signature).toEqual(expect.any(Object));
    await expect(validateDpsXml(signed)).resolves.toEqual(expect.objectContaining({ valid: true }));

    const result = verifyNationalXmlSignature(signed, {
      trustedCertificates: [credentials.certificatePem],
      requireTrustedCertificate: true,
      now: VERIFICATION_TIME,
    });
    expect(result).toEqual(
      expect.objectContaining({
        valid: true,
        documentKind: "DPS",
        targetId: createDps(validDpsInput()).infDPS.Id,
        certificateTimeValid: true,
        certificateTrusted: true,
      }),
    );
    expect(result.authenticatedXml).toContain("<infDPS");
    expect(result.authenticatedXml).not.toContain("<Signature");
  });

  it("detects tampering without exposing unauthenticated XML", async () => {
    const signer = createPemSigner({
      privateKey: credentials.privateKeyPem,
      certificateChain: [credentials.certificatePem],
    });
    const signed = await signDpsXml(serializeDps(validDpsInput()), signer, {
      now: VERIFICATION_TIME,
    });
    const tampered = signed.replace("Software consulting", "Tampered consulting");
    const result = verifyNationalXmlSignature(tampered, { now: VERIFICATION_TIME });

    expect(result.valid).toBe(false);
    expect(result.authenticatedXml).toBeUndefined();
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "invalid-signature" })]),
    );
  });

  it("requires configured trust when requested", async () => {
    const signer = createPemSigner({
      privateKey: credentials.privateKeyPem,
      certificateChain: [credentials.certificatePem],
    });
    const signed = await signDpsXml(serializeDps(validDpsInput()), signer, {
      now: VERIFICATION_TIME,
    });
    const result = verifyNationalXmlSignature(signed, {
      requireTrustedCertificate: true,
      now: VERIFICATION_TIME,
    });

    expect(result.valid).toBe(false);
    expect(result.certificateTrusted).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "certificate-untrusted" }),
    );
    expect(result.authenticatedXml).toBeUndefined();
  });

  it("rejects XMLDSig algorithm profiles other than the configured profile", async () => {
    const signer = createPemSigner({
      privateKey: credentials.privateKeyPem,
      certificateChain: [credentials.certificatePem],
    });
    const signed = await signDpsXml(serializeDps(validDpsInput()), signer, {
      now: VERIFICATION_TIME,
    });
    const result = verifyNationalXmlSignature(signed, {
      now: VERIFICATION_TIME,
      profile: {
        canonicalizationAlgorithm: "urn:expected:c14n",
        signatureAlgorithm: "urn:expected:signature",
        digestAlgorithm: "urn:expected:digest",
        transforms: ["urn:expected:transform"],
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "unexpected-profile" }));
    expect(result.authenticatedXml).toBeUndefined();
  });

  it("rejects namespace-confused SignedInfo before accepting decoy SHA-256 policy elements", async () => {
    const signer = createPemSigner({
      privateKey: credentials.privateKeyPem,
      certificateChain: [credentials.certificatePem],
    });
    const weakProfile = {
      ...NATIONAL_NFSE_XMLDSIG_PROFILE,
      signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
      digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
    };
    let signed = await signDpsXml(serializeDps(validDpsInput()), signer, {
      profile: weakProfile,
      now: VERIFICATION_TIME,
    });
    signed = signed.replace("<SignedInfo>", '<SignedInfo xmlns="">');
    signed = signed.replace(
      "</Signature>",
      `<Object><CanonicalizationMethod Algorithm="${NATIONAL_NFSE_XMLDSIG_PROFILE.canonicalizationAlgorithm}"/><SignatureMethod Algorithm="${NATIONAL_NFSE_XMLDSIG_PROFILE.signatureAlgorithm}"/><DigestMethod Algorithm="${NATIONAL_NFSE_XMLDSIG_PROFILE.digestAlgorithm}"/><Transform Algorithm="${NATIONAL_NFSE_XMLDSIG_PROFILE.transforms[0]}"/><Transform Algorithm="${NATIONAL_NFSE_XMLDSIG_PROFILE.transforms[1]}"/></Object></Signature>`,
    );
    signed = resignSignedInfo(signed, credentials.privateKeyPem, credentials.certificatePem);

    expect(() =>
      verifyNationalXmlSignature(signed, {
        trustedCertificates: [credentials.certificatePem],
        requireTrustedCertificate: true,
        now: VERIFICATION_TIME,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<XmlSignatureError>>({ code: "verification-failed" }),
    );
  });

  it("loads PKCS#12 credentials and signs an event request in schema order", async () => {
    const signer = createPkcs12Signer(credentials.pkcs12, { password: "secret" });
    const signed = await signEventRequestXml(eventRequestXml(), signer, {
      now: VERIFICATION_TIME,
    });

    expect(parseEventRequestXml(signed).signature).toEqual(expect.any(Object));
    expect(signed.indexOf("</infPedReg>")).toBeLessThan(signed.indexOf("<Signature"));
    await expect(validateEventRequestXml(signed)).resolves.toEqual(
      expect.objectContaining({ valid: true }),
    );
    expect(
      verifyNationalXmlSignature(signed, {
        trustedCertificates: [credentials.certificatePem],
        requireTrustedCertificate: true,
        now: VERIFICATION_TIME,
      }).valid,
    ).toBe(true);
  });

  it("supports external asynchronous signers without exposing private keys", async () => {
    const privateKey = createPrivateKey(credentials.privateKeyPem);
    const externalSigner: XmlSigner = {
      certificateChainPem: [credentials.certificatePem],
      async sign(data, context) {
        expect(context.documentKind).toBe("DPS");
        return signBytes("RSA-SHA256", data, privateKey);
      },
    };

    const signed = await signDpsXml(serializeDps(validDpsInput()), externalSigner, {
      now: VERIFICATION_TIME,
    });
    expect(
      verifyNationalXmlSignature(signed, {
        trustedCertificates: [credentials.certificatePem],
        requireTrustedCertificate: true,
        now: VERIFICATION_TIME,
      }).valid,
    ).toBe(true);
  });

  it("rejects garbage and wrong-key external signer output", async () => {
    const other = createTestCredentials();
    const wrongPrivateKey = createPrivateKey(other.privateKeyPem);
    const cases: XmlSigner[] = [
      {
        certificateChainPem: [credentials.certificatePem],
        async sign() {
          return Uint8Array.of(0);
        },
      },
      {
        certificateChainPem: [credentials.certificatePem],
        async sign(data) {
          return signBytes("RSA-SHA256", data, wrongPrivateKey);
        },
      },
    ];

    for (const externalSigner of cases) {
      await expect(
        signDpsXml(serializeDps(validDpsInput()), externalSigner, {
          now: VERIFICATION_TIME,
        }),
      ).rejects.toEqual(
        expect.objectContaining<Partial<XmlSignatureError>>({ code: "signing-failed" }),
      );
    }
  });

  it("rejects a certificate path through a non-CA intermediate", async () => {
    const hierarchy = createIntermediateHierarchy(false);
    const signer = createPemSigner({
      privateKey: hierarchy.leafPrivateKeyPem,
      certificateChain: [hierarchy.leafCertificatePem],
    });
    const signed = await signDpsXml(serializeDps(validDpsInput()), signer, {
      now: VERIFICATION_TIME,
    });
    const withIntermediate = appendCertificate(signed, hierarchy.intermediateCertificatePem);
    const result = verifyNationalXmlSignature(withIntermediate, {
      trustedCertificates: [hierarchy.rootCertificatePem],
      requireTrustedCertificate: true,
      now: VERIFICATION_TIME,
    });

    expect(result.valid).toBe(false);
    expect(result.certificateTrusted).toBe(false);
    expect(result.authenticatedXml).toBeUndefined();
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "invalid-certificate-chain" }),
    );
  });

  it("accepts a valid CA intermediate path to a configured trust anchor", async () => {
    const hierarchy = createIntermediateHierarchy(true);
    const signer = createPemSigner({
      privateKey: hierarchy.leafPrivateKeyPem,
      certificateChain: [hierarchy.leafCertificatePem, hierarchy.intermediateCertificatePem],
    });
    const signed = await signDpsXml(serializeDps(validDpsInput()), signer, {
      now: VERIFICATION_TIME,
    });
    const result = verifyNationalXmlSignature(signed, {
      trustedCertificates: [hierarchy.rootCertificatePem],
      requireTrustedCertificate: true,
      now: VERIFICATION_TIME,
    });

    expect(result).toEqual(
      expect.objectContaining({
        valid: true,
        certificateTrusted: true,
        authenticatedXml: expect.any(String),
      }),
    );
  });

  it("rejects RSA keys below 2048 bits for signing and verification", () => {
    const weak = createTestCredentials(1024);
    expect(() =>
      createPemSigner({
        privateKey: weak.privateKeyPem,
        certificateChain: [weak.certificatePem],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<XmlSignatureError>>({ code: "invalid-credentials" }),
    );

    const weaklySigned = signWithoutHardening(
      `<DPS xmlns="${NAMESPACE}" versao="1.01"><infDPS Id="DPS1"><marker>weak</marker></infDPS></DPS>`,
      weak,
    );
    const result = verifyNationalXmlSignature(weaklySigned, {
      trustedCertificates: [weak.certificatePem],
      requireTrustedCertificate: true,
      now: VERIFICATION_TIME,
    });
    expect(result.valid).toBe(false);
    expect(result.authenticatedXml).toBeUndefined();
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "invalid-certificate-chain" }),
    );
  });

  it("rejects unsupported critical certificate extensions", () => {
    const unsupported = createTestCredentials(2048, true);
    expect(() =>
      createPemSigner({
        privateKey: unsupported.privateKeyPem,
        certificateChain: [unsupported.certificatePem],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<XmlSignatureError>>({ code: "invalid-credentials" }),
    );

    const signed = signWithoutHardening(
      `<DPS xmlns="${NAMESPACE}" versao="1.01"><infDPS Id="DPS1"><marker>critical</marker></infDPS></DPS>`,
      unsupported,
    );
    const result = verifyNationalXmlSignature(signed, {
      trustedCertificates: [unsupported.certificatePem],
      requireTrustedCertificate: true,
      now: VERIFICATION_TIME,
    });
    expect(result.valid).toBe(false);
    expect(result.authenticatedXml).toBeUndefined();
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "invalid-certificate-chain" }),
    );
  });

  it("signs generated NFS-e and registered-event document roots", async () => {
    const signer = createPemSigner({
      privateKey: credentials.privateKeyPem,
      certificateChain: [credentials.certificatePem],
    });
    const nfseId = `NFS${"2".repeat(50)}`;
    const eventId = `EVT${NFSE_KEY}101101001`;
    const signedNfse = await signNfseXml(
      `<NFSe xmlns="${NAMESPACE}" versao="1.01"><infNFSe Id="${nfseId}"><marker>nfse</marker></infNFSe></NFSe>`,
      signer,
      { now: VERIFICATION_TIME },
    );
    const signedEvent = await signRegisteredEventXml(
      `<evento xmlns="${NAMESPACE}" versao="1.01"><infEvento Id="${eventId}"><marker>event</marker></infEvento></evento>`,
      signer,
      { now: VERIFICATION_TIME },
    );

    expect(
      verifyNationalXmlSignature(signedNfse, {
        trustedCertificates: [credentials.certificatePem],
        requireTrustedCertificate: true,
        now: VERIFICATION_TIME,
      }),
    ).toEqual(expect.objectContaining({ valid: true, documentKind: "NFSe" }));
    expect(
      verifyNationalXmlSignature(signedEvent, {
        trustedCertificates: [credentials.certificatePem],
        requireTrustedCertificate: true,
        now: VERIFICATION_TIME,
      }),
    ).toEqual(expect.objectContaining({ valid: true, documentKind: "evento" }));
  });

  it("supports generic document signing and rejects mismatched convenience wrappers", async () => {
    const signer = createPemSigner({
      privateKey: credentials.privateKeyPem,
      certificateChain: [credentials.certificatePem],
    });
    const unsigned = serializeDps(validDpsInput());
    const signed = await signNationalXml(unsigned, signer, { now: VERIFICATION_TIME });

    expect(
      verifyNationalXmlSignature(signed, {
        trustedCertificates: [credentials.certificatePem],
        requireTrustedCertificate: true,
        now: VERIFICATION_TIME,
      }).valid,
    ).toBe(true);
    await expect(signNfseXml(unsigned, signer)).rejects.toEqual(
      expect.objectContaining<Partial<XmlSignatureError>>({ code: "unsupported-document" }),
    );
  });

  it("rejects malformed document structure before signing", async () => {
    const signer = createPemSigner({
      privateKey: credentials.privateKeyPem,
      certificateChain: [credentials.certificatePem],
    });
    const cases = [
      [`<unknown xmlns="${NAMESPACE}"/>`, "unsupported-document"],
      [`<DPS xmlns="urn:not-national"><infDPS Id="DPS1"/></DPS>`, "unsupported-document"],
      [`<DPS xmlns="${NAMESPACE}"/>`, "unsupported-document"],
      [`<DPS xmlns="${NAMESPACE}"><infDPS/></DPS>`, "missing-id"],
      [
        `<DPS xmlns="${NAMESPACE}"><infDPS Id="DPS1"/><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"/><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"/></DPS>`,
        "multiple-signatures",
      ],
    ] as const;

    for (const [xml, code] of cases) {
      await expect(signNationalXml(xml, signer)).rejects.toEqual(
        expect.objectContaining<Partial<XmlSignatureError>>({ code }),
      );
    }
  });

  it("rejects expired signing certificates and unsigned verification input", async () => {
    const signer = createPemSigner({
      privateKey: credentials.privateKeyPem,
      certificateChain: [credentials.certificatePem],
    });
    await expect(
      signDpsXml(serializeDps(validDpsInput()), signer, {
        now: new Date("2031-01-01T00:00:00Z"),
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<XmlSignatureError>>({ code: "certificate-expired" }),
    );
    const signed = await signDpsXml(serializeDps(validDpsInput()), signer, {
      now: VERIFICATION_TIME,
    });
    const expiredResult = verifyNationalXmlSignature(signed, {
      now: new Date("2031-01-01T00:00:00Z"),
    });
    expect(expiredResult.valid).toBe(false);
    expect(expiredResult.authenticatedXml).toBeUndefined();
    expect(() => verifyNationalXmlSignature(serializeDps(validDpsInput()))).toThrowError(
      expect.objectContaining<Partial<XmlSignatureError>>({ code: "missing-signature" }),
    );
  });

  it("rejects duplicate signatures, invalid credentials, and unsupported signer profiles", async () => {
    const signer = createPemSigner({
      privateKey: credentials.privateKeyPem,
      certificateChain: [credentials.certificatePem],
    });
    const signed = await signDpsXml(serializeDps(validDpsInput()), signer, {
      now: VERIFICATION_TIME,
    });
    await expect(signDpsXml(signed, signer)).rejects.toEqual(
      expect.objectContaining<Partial<XmlSignatureError>>({ code: "existing-signature" }),
    );

    const other = createTestCredentials();
    expect(() =>
      createPemSigner({
        privateKey: other.privateKeyPem,
        certificateChain: [credentials.certificatePem],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<XmlSignatureError>>({ code: "invalid-credentials" }),
    );
    expect(() =>
      createPemSigner({
        privateKey: credentials.privateKeyPem,
        certificateChain: [],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<XmlSignatureError>>({ code: "invalid-credentials" }),
    );
    expect(() => createPkcs12Signer(credentials.pkcs12, { password: "wrong" })).toThrowError(
      expect.objectContaining<Partial<XmlSignatureError>>({ code: "invalid-credentials" }),
    );

    await expect(
      signDpsXml(serializeDps(validDpsInput()), signer, {
        now: VERIFICATION_TIME,
        profile: {
          ...NATIONAL_NFSE_XMLDSIG_PROFILE,
          signatureAlgorithm: "urn:unsupported:signature",
        },
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<XmlSignatureError>>({ code: "unsupported-algorithm" }),
    );
  });

  it("categorizes invalid embedded certificates and external signer failures", async () => {
    const signer = createPemSigner({
      privateKey: credentials.privateKeyPem,
      certificateChain: [credentials.certificatePem],
    });
    const signed = await signDpsXml(serializeDps(validDpsInput()), signer, {
      now: VERIFICATION_TIME,
    });
    const invalidCertificate = signed.replace(
      /<X509Certificate>[^<]+<\/X509Certificate>/,
      "<X509Certificate>not-a-certificate</X509Certificate>",
    );
    expect(() =>
      verifyNationalXmlSignature(invalidCertificate, { now: VERIFICATION_TIME }),
    ).toThrowError(
      expect.objectContaining<Partial<XmlSignatureError>>({ code: "invalid-credentials" }),
    );

    const rejectingSigner: XmlSigner = {
      certificateChainPem: [credentials.certificatePem],
      async sign() {
        throw "rejected";
      },
    };
    await expect(
      signDpsXml(serializeDps(validDpsInput()), rejectingSigner, {
        now: VERIFICATION_TIME,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<XmlSignatureError>>({ code: "signing-failed" }),
    );
  });
});

function eventRequestXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><pedRegEvento xmlns="${NAMESPACE}" versao="1.01"><infPedReg Id="${EVENT_REQUEST_ID}"><tpAmb>2</tpAmb><verAplic>nfse-js-test</verAplic><dhEvento>2026-06-11T11:00:00+01:00</dhEvento><CNPJAutor>12345678000195</CNPJAutor><chNFSe>${NFSE_KEY}</chNFSe><e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>1</cMotivo><xMotivo>Documento emitido incorretamente</xMotivo></e101101></infPedReg></pedRegEvento>`;
}

function createTestCredentials(bits = 2048, unsupportedCriticalExtension = false): TestCredentials {
  const keys = forge.pki.rsa.generateKeyPair(bits);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date("2025-01-01T00:00:00Z");
  certificate.validity.notAfter = new Date("2030-01-01T00:00:00Z");
  const attributes = [{ name: "commonName", value: "nfse-js test signer" }];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  const extensions: object[] = [
    { name: "basicConstraints", cA: false },
    {
      name: "keyUsage",
      digitalSignature: true,
      nonRepudiation: true,
    },
  ];
  if (unsupportedCriticalExtension) {
    extensions.push({
      name: "subjectAltName",
      critical: true,
      altNames: [{ type: 2, value: "unsupported.example" }],
    });
  }
  certificate.setExtensions(extensions);
  certificate.sign(keys.privateKey, forge.md.sha256.create());

  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
  const certificatePem = forge.pki.certificateToPem(certificate);
  const pfx = forge.pkcs12.toPkcs12Asn1(keys.privateKey, certificate, "secret", {
    algorithm: "3des",
  });
  const pkcs12 = Buffer.from(forge.asn1.toDer(pfx).getBytes(), "binary");
  return { privateKeyPem, certificatePem, pkcs12 };
}

function resignSignedInfo(xml: string, privateKeyPem: string, certificatePem: string): string {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const signature = document
    .getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature")
    .item(0);
  if (!signature) {
    throw new Error("test signature is missing");
  }
  const loader = new SignedXml({
    publicCert: certificatePem,
    getCertFromKeyInfo: () => null,
  });
  loader.loadSignature(signature as unknown as Node);
  const canonicalizer = loader as unknown as {
    getCanonSignedInfoXml(document: Document): string;
  };
  const canonicalized = canonicalizer.getCanonSignedInfoXml(document as unknown as Document);
  const signatureValue = signature
    .getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "SignatureValue")
    .item(0);
  if (!signatureValue) {
    throw new Error("test signature value is missing");
  }
  signatureValue.textContent = signBytes(
    "RSA-SHA1",
    Buffer.from(canonicalized),
    createPrivateKey(privateKeyPem),
  ).toString("base64");
  return new XMLSerializer().serializeToString(document);
}

function appendCertificate(xml: string, certificatePem: string): string {
  const certificateValue = certificatePem.replace(
    /-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g,
    "",
  );
  return xml.replace(
    "</X509Data>",
    `<X509Certificate>${certificateValue}</X509Certificate></X509Data>`,
  );
}

function signWithoutHardening(xml: string, weak: TestCredentials): string {
  const signer = new SignedXml({
    privateKey: weak.privateKeyPem,
    publicCert: weak.certificatePem,
    signatureAlgorithm: NATIONAL_NFSE_XMLDSIG_PROFILE.signatureAlgorithm,
    canonicalizationAlgorithm: NATIONAL_NFSE_XMLDSIG_PROFILE.canonicalizationAlgorithm,
  });
  signer.addReference({
    xpath: `/*[local-name(.)='DPS' and namespace-uri(.)='${NAMESPACE}']/*[local-name(.)='infDPS' and namespace-uri(.)='${NAMESPACE}']`,
    transforms: NATIONAL_NFSE_XMLDSIG_PROFILE.transforms,
    digestAlgorithm: NATIONAL_NFSE_XMLDSIG_PROFILE.digestAlgorithm,
  });
  signer.computeSignature(xml, {
    location: {
      reference: `/*[local-name(.)='DPS' and namespace-uri(.)='${NAMESPACE}']`,
      action: "append",
    },
  });
  return signer.getSignedXml();
}

function createIntermediateHierarchy(intermediateCa: boolean): {
  readonly leafPrivateKeyPem: string;
  readonly leafCertificatePem: string;
  readonly intermediateCertificatePem: string;
  readonly rootCertificatePem: string;
} {
  const rootKeys = forge.pki.rsa.generateKeyPair(2048);
  const root = createIssuedCertificate("root", rootKeys, undefined, undefined, true);
  const intermediateKeys = forge.pki.rsa.generateKeyPair(2048);
  const intermediate = createIssuedCertificate(
    "not-a-ca",
    intermediateKeys,
    root,
    rootKeys.privateKey,
    intermediateCa,
  );
  const leafKeys = forge.pki.rsa.generateKeyPair(2048);
  const leaf = createIssuedCertificate(
    "leaf",
    leafKeys,
    intermediate,
    intermediateKeys.privateKey,
    false,
  );
  return {
    leafPrivateKeyPem: forge.pki.privateKeyToPem(leafKeys.privateKey),
    leafCertificatePem: forge.pki.certificateToPem(leaf),
    intermediateCertificatePem: forge.pki.certificateToPem(intermediate),
    rootCertificatePem: forge.pki.certificateToPem(root),
  };
}

function createIssuedCertificate(
  commonName: string,
  keys: forge.pki.rsa.KeyPair,
  issuer?: forge.pki.Certificate,
  issuerKey?: forge.pki.rsa.PrivateKey,
  cA = false,
): forge.pki.Certificate {
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = Math.floor(Math.random() * 1_000_000_000).toString(16);
  certificate.validity.notBefore = new Date("2025-01-01T00:00:00Z");
  certificate.validity.notAfter = new Date("2030-01-01T00:00:00Z");
  const subject = [{ name: "commonName", value: commonName }];
  certificate.setSubject(subject);
  certificate.setIssuer(issuer?.subject.attributes ?? subject);
  certificate.setExtensions([
    { name: "basicConstraints", critical: true, cA },
    {
      name: "keyUsage",
      critical: true,
      digitalSignature: !cA,
      keyCertSign: cA,
      cRLSign: cA,
    },
  ]);
  certificate.sign(issuerKey ?? keys.privateKey, forge.md.sha256.create());
  return certificate;
}
