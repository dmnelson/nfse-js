import * as forge from "node-forge";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildEventRequestId,
  buildRegisteredEventId,
  createEventRequest,
  type EventRequestPayload,
  serializeEventRequest,
  validateEventRequest,
} from "../src/events/index.js";
import type { EventValidationError, XmlSignatureError } from "../src/index.js";
import { parseEventRequestXml } from "../src/parsing/index.js";
import {
  createPemSigner,
  signEventRequestXml,
  verifyNationalXmlSignature,
} from "../src/signing/index.js";
import { validateEventRequestXml } from "../src/validation/index.js";

const ACCESS_KEY = "1".repeat(50);
const OTHER_ACCESS_KEY = "2".repeat(50);
const AUTHOR_CNPJ = "12345678000195";
const AGENT_CPF = "12345678909";
const NOW = new Date("2026-06-12T12:00:00Z");
const REASON = "Documento emitido incorretamente";
const REFERENCE_ID = "3".repeat(59);

const PAYLOADS: readonly EventRequestPayload[] = [
  { code: "e101101", cMotivo: "1", xMotivo: REASON },
  {
    code: "e105102",
    cMotivo: "01",
    xMotivo: REASON,
    chSubstituta: OTHER_ACCESS_KEY,
  },
  { code: "e101103", cMotivo: "2", xMotivo: REASON },
  {
    code: "e105104",
    CPFAgTrib: AGENT_CPF,
    nProcAdm: "123",
    cMotivo: "1",
    xMotivo: REASON,
  },
  {
    code: "e105105",
    CPFAgTrib: AGENT_CPF,
    cMotivo: "2",
    xMotivo: REASON,
  },
  { code: "e202201" },
  { code: "e203202" },
  { code: "e204203" },
  { code: "e205204" },
  { code: "e202205", cMotivo: "1", xMotivo: REASON },
  { code: "e203206", cMotivo: "2" },
  { code: "e204207", cMotivo: "9", xMotivo: REASON },
  {
    code: "e205208",
    CPFAgTrib: AGENT_CPF,
    idEvManifRej: REFERENCE_ID,
    xMotivo: REASON,
  },
  {
    code: "e305101",
    CPFAgTrib: AGENT_CPF,
    nProcAdm: "456",
    xProcAdm: REASON,
  },
  {
    code: "e305102",
    CPFAgTrib: AGENT_CPF,
    codEvento: "e101101",
    xMotivo: REASON,
  },
  { code: "e305103", CPFAgTrib: AGENT_CPF, idBloqOfic: REFERENCE_ID },
];

let credentials: { readonly privateKey: string; readonly certificate: string };

beforeAll(() => {
  credentials = createTestCredentials();
});

describe("National event construction", () => {
  it("builds official request and registered-event identifiers", () => {
    const requestId = buildEventRequestId(ACCESS_KEY, "e101101");
    expect(requestId).toBe(`PRE${ACCESS_KEY}101101`);
    expect(buildRegisteredEventId(requestId, 1)).toBe(`EVT${ACCESS_KEY}101101001`);
    expect(buildRegisteredEventId(requestId, "123")).toBe(`EVT${ACCESS_KEY}101101123`);

    expect(() => buildEventRequestId("1", "e101101")).toThrowError(TypeError);
    expect(() => buildRegisteredEventId("PRE1", 1)).toThrowError(TypeError);
    expect(() => buildRegisteredEventId(requestId, 1_000)).toThrowError(TypeError);
  });

  it.each(
    PAYLOADS.map((payload) => [payload.code, payload] as const),
  )("serializes %s in schema order and round-trips through the parser", async (_code, payload) => {
    const request = createEventRequest({
      infPedReg: {
        tpAmb: "2",
        verAplic: "nfse-js-test",
        dhEvento: "2026-06-11T11:00:00-03:00",
        autor: { CNPJAutor: AUTHOR_CNPJ },
        chNFSe: ACCESS_KEY,
        evento: payload,
      },
    });
    const xml = serializeEventRequest(request);
    const parsed = parseEventRequestXml(xml);

    expect(request.infPedReg.Id).toBe(buildEventRequestId(ACCESS_KEY, payload.code));
    expect(parsed.document.infPedReg.evento.code).toBe(payload.code);
    expect(parsed.document.infPedReg.evento.details.xDesc).toEqual(expect.any(String));
    await expect(validateEventRequestXml(xml)).resolves.toEqual(
      expect.objectContaining({ valid: true }),
    );
  });

  it("supports pretty output, CPF authors, signing, and verification", async () => {
    const xml = serializeEventRequest(
      {
        infPedReg: {
          tpAmb: "2",
          verAplic: "nfse-js-test",
          dhEvento: "2026-06-11T11:00:00-03:00",
          autor: { CPFAutor: AGENT_CPF },
          chNFSe: ACCESS_KEY,
          evento: { code: "e202201" },
        },
      },
      { pretty: true, declaration: false },
    );
    expect(xml).toContain("\n");
    expect(xml).not.toContain("<?xml");

    const signer = createPemSigner({
      privateKey: credentials.privateKey,
      certificateChain: [credentials.certificate],
    });
    const signed = await signEventRequestXml(xml, signer, { now: NOW });
    await expect(validateEventRequestXml(signed)).resolves.toEqual(
      expect.objectContaining({ valid: true }),
    );
    expect(
      verifyNationalXmlSignature(signed, {
        trustedCertificates: [credentials.certificate],
        requireTrustedCertificate: true,
        now: NOW,
      }).valid,
    ).toBe(true);
  });

  it("reports local facet and identifier failures together", () => {
    const input = {
      versao: "1.01" as const,
      infPedReg: {
        Id: `PRE${"9".repeat(56)}`,
        tpAmb: "2" as const,
        verAplic: "",
        dhEvento: "2026-02-30T11:00:00-03:00",
        autor: { CPFAutor: "11111111111" },
        chNFSe: ACCESS_KEY,
        evento: {
          code: "e101101" as const,
          cMotivo: "1" as const,
          xMotivo: "short",
        },
      },
    };
    const result = validateEventRequest(input);

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "event.application-version",
        "event.timestamp",
        "event.author-cpf",
        "event.id",
        "event.reason",
      ]),
    );
    expect(() => createEventRequest(input)).toThrowError(
      expect.objectContaining<Partial<EventValidationError>>({
        issues: expect.arrayContaining([expect.objectContaining({ code: "event.id" })]),
      }),
    );
  });

  it("rejects malformed payload references before XML generation", async () => {
    const input = {
      infPedReg: {
        tpAmb: "2" as const,
        verAplic: "nfse-js-test",
        dhEvento: "2026-06-11T11:00:00-03:00",
        autor: { CNPJAutor: AUTHOR_CNPJ },
        chNFSe: ACCESS_KEY,
        evento: {
          code: "e305103" as const,
          CPFAgTrib: AGENT_CPF,
          idBloqOfic: "invalid",
        },
      },
    };
    expect(validateEventRequest(input).issues).toContainEqual(
      expect.objectContaining({ code: "event.reference-id" }),
    );
    await expect(
      signEventRequestXml("<pedRegEvento/>", {
        certificateChainPem: [credentials.certificate],
        async sign() {
          return new Uint8Array();
        },
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<XmlSignatureError>>({ code: "unsupported-document" }),
    );
  });
});

function createTestCredentials(): { readonly privateKey: string; readonly certificate: string } {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date("2025-01-01T00:00:00Z");
  certificate.validity.notAfter = new Date("2030-01-01T00:00:00Z");
  const attributes = [{ name: "commonName", value: "nfse-js event test signer" }];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  return {
    privateKey: forge.pki.privateKeyToPem(keys.privateKey),
    certificate: forge.pki.certificateToPem(certificate),
  };
}
