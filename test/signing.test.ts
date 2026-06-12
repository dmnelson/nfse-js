import { createPrivateKey, sign as signBytes } from "node:crypto";
import * as forge from "node-forge";
import { beforeAll, describe, expect, it } from "vitest";
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

function createTestCredentials(): TestCredentials {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date("2025-01-01T00:00:00Z");
  certificate.validity.notAfter = new Date("2030-01-01T00:00:00Z");
  const attributes = [{ name: "commonName", value: "nfse-js test signer" }];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  certificate.setExtensions([
    { name: "basicConstraints", cA: false },
    {
      name: "keyUsage",
      digitalSignature: true,
      nonRepudiation: true,
    },
  ]);
  certificate.sign(keys.privateKey, forge.md.sha256.create());

  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
  const certificatePem = forge.pki.certificateToPem(certificate);
  const pfx = forge.pkcs12.toPkcs12Asn1(keys.privateKey, certificate, "secret", {
    algorithm: "3des",
  });
  const pkcs12 = Buffer.from(forge.asn1.toDer(pfx).getBytes(), "binary");
  return { privateKeyPem, certificatePem, pkcs12 };
}
