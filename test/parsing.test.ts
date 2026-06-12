import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  createDps,
  type SefinResponseParseError,
  serializeDps,
  validateEventRequestXml,
  validateEventXml,
  validateNfseXml,
  type XmlParseError,
} from "../src/index.js";
import {
  parseDpsXml,
  parseEventRequestXml,
  parseNfseXml,
  parseRegisteredEventXml,
  parseSefinDocumentResponse,
  parseXmlRoot,
} from "../src/parsing/index.js";
import { schemaCoverageDpsInputs, validDpsInput } from "./fixtures.js";

const NAMESPACE = "http://www.sped.fazenda.gov.br/nfse";
const NFSE_KEY = "1".repeat(50);
const NFSE_ID = `NFS${NFSE_KEY}`;
const EVENT_REQUEST_ID = `PRE${NFSE_KEY}101101`;
const REGISTERED_EVENT_ID = `EVT${NFSE_KEY}101101001`;

describe("XML parsing", () => {
  it.each(schemaCoverageDpsInputs())("round-trips the '$name' DPS fixture", ({ input }) => {
    const expected = createDps(input);
    const xml = serializeDps(expected, { pretty: true });
    const parsed = parseDpsXml(xml);

    expect(parsed.kind).toBe("DPS");
    expect(parsed.document).toEqual(expected);
    expect(serializeDps(parsed.document)).toBe(serializeDps(expected));
    expect(parsed.originalXml).toBe(xml);
  });

  it("decodes built-in XML entities without accepting custom entities", () => {
    const input = validDpsInput();
    const xml = serializeDps({
      ...input,
      infDPS: {
        ...input.infDPS,
        serv: {
          ...input.infDPS.serv,
          cServ: {
            ...input.infDPS.serv.cServ,
            xDescServ: "Research & development",
          },
        },
      },
    });

    expect(xml).toContain("Research &amp; development");
    expect(parseDpsXml(xml).document.infDPS.serv.cServ.xDescServ).toBe("Research & development");
  });

  it("preserves the original XML and parsed signature node", () => {
    const xml = serializeDps(validDpsInput()).replace(
      "</DPS>",
      '<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignedInfo><ds:CanonicalizationMethod Algorithm="urn:test"/></ds:SignedInfo><ds:SignatureValue>abc</ds:SignatureValue></ds:Signature></DPS>',
    );
    const parsed = parseDpsXml(xml);

    expect(parsed.originalXml).toBe(xml);
    expect(parsed.signature).toEqual(
      expect.objectContaining({
        SignedInfo: expect.any(Object),
        SignatureValue: "abc",
      }),
    );
  });

  it.each([
    ["DOCTYPE", '<!DOCTYPE DPS [<!ENTITY x "expanded">]><DPS versao="1.01">&x;</DPS>'],
    ["ENTITY", '<!ENTITY x "expanded"><DPS versao="1.01"/>'],
  ])("rejects %s declarations", (_name, xml) => {
    expect(() => parseXmlRoot(xml)).toThrowError(
      expect.objectContaining<Partial<XmlParseError>>({ code: "unsafe-xml" }),
    );
  });

  it("rejects malformed XML and unexpected roots", () => {
    expect(() => parseDpsXml("<DPS>")).toThrowError(
      expect.objectContaining<Partial<XmlParseError>>({ code: "invalid-xml" }),
    );
    expect(() => parseDpsXml("<NFSe />")).toThrowError(
      expect.objectContaining<Partial<XmlParseError>>({ code: "unexpected-root" }),
    );
  });

  it("enforces byte and nesting limits before constructing a document", () => {
    const xml = serializeDps(validDpsInput());
    expect(() => parseDpsXml(xml, { maxBytes: 10 })).toThrowError(
      expect.objectContaining<Partial<XmlParseError>>({ code: "document-too-large" }),
    );
    expect(() => parseDpsXml(xml, { maxDepth: 2 })).toThrowError(
      expect.objectContaining<Partial<XmlParseError>>({ code: "invalid-xml" }),
    );
  });

  it("can parse a structurally complete DPS without running semantic validation", () => {
    const xml = serializeDps(validDpsInput()).replace(
      "<dCompet>2026-06-11</dCompet>",
      "<dCompet>2026-02-29</dCompet>",
    );

    expect(() => parseDpsXml(xml)).toThrow();
    expect(parseDpsXml(xml, { validate: false }).document.infDPS.dCompet).toBe("2026-02-29");
  });

  it("parses an issued NFS-e, its signature, and its embedded complete DPS", async () => {
    const xml = nfseXml();
    const parsed = parseNfseXml(xml);

    expect(parsed.kind).toBe("NFSe");
    expect(parsed.document.infNFSe.Id).toBe(NFSE_ID);
    expect(parsed.document.infNFSe.emit).toEqual(
      expect.objectContaining({
        CNPJ: "12345678000195",
        xNome: "Example Services Ltda",
      }),
    );
    expect(parsed.document.infNFSe.DPS).toEqual(createDps(validDpsInput()));
    expect(parsed.document.infNFSe.dpsSignature?.SignatureValue).toBe("AA==");
    expect(parsed.signature.SignatureValue).toBe("AA==");
    expect(parsed.originalXml).toBe(xml);
    await expect(validateNfseXml(xml)).resolves.toEqual(expect.objectContaining({ valid: true }));
  });

  it("preserves generated NFS-e subtrees that are not part of the declarant DPS model", () => {
    const xml = nfseXml().replace(
      "<DPS ",
      "<IBSCBS><cLocalidadeIncid>3550308</cLocalidadeIncid><generated><value>1.00</value></generated></IBSCBS><DPS ",
    );

    expect(parseNfseXml(xml).document.infNFSe.IBSCBS).toEqual({
      cLocalidadeIncid: "3550308",
      generated: { value: "1.00" },
    });
  });

  it("parses a signed event request and preserves its event-specific payload", async () => {
    const xml = eventRequestXml(true);
    const parsed = parseEventRequestXml(xml);

    expect(parsed.kind).toBe("pedRegEvento");
    expect(parsed.document.infPedReg.autor).toEqual({ CNPJAutor: "12345678000195" });
    expect(parsed.document.infPedReg.evento).toEqual({
      code: "e101101",
      details: {
        xDesc: "Cancelamento de NFS-e",
        cMotivo: "1",
        xMotivo: "Documento emitido incorretamente",
      },
    });
    expect(parsed.signature?.SignatureValue).toBe("AA==");
    await expect(validateEventRequestXml(xml)).resolves.toEqual(
      expect.objectContaining({ valid: true }),
    );
  });

  it("parses a registered event with its nested request and required signature", async () => {
    const xml = registeredEventXml();
    const parsed = parseRegisteredEventXml(xml);

    expect(parsed.kind).toBe("evento");
    expect(parsed.document.infEvento.Id).toBe(REGISTERED_EVENT_ID);
    expect(parsed.document.infEvento.pedRegEvento.infPedReg.evento.code).toBe("e101101");
    expect(parsed.document.infEvento.requestSignature?.SignatureValue).toBe("AA==");
    expect(parsed.signature.SignatureValue).toBe("AA==");
    await expect(validateEventXml(xml)).resolves.toEqual(expect.objectContaining({ valid: true }));
  });

  it("rejects missing required signatures and ambiguous event choices", () => {
    expect(() => parseNfseXml(nfseXml().replace(signatureXml(NFSE_ID), ""))).toThrowError(
      expect.objectContaining<Partial<XmlParseError>>({ code: "missing-value" }),
    );
    expect(() =>
      parseEventRequestXml(
        eventRequestXml(false).replace(
          "</infPedReg>",
          "<e202201><xDesc>Confirmação do Prestador</xDesc></e202201></infPedReg>",
        ),
      ),
    ).toThrowError(expect.objectContaining<Partial<XmlParseError>>({ code: "invalid-value" }));
  });

  it("parses SEFIN JSON success envelopes without depending on property names", () => {
    const xml = nfseXml();
    const response = parseSefinDocumentResponse(
      JSON.stringify({ arbitraryEnvelope: { generatedDocument: xml } }),
      { status: 200, contentType: "application/json" },
    );

    expect(response.kind).toBe("success");
    if (response.kind === "success") {
      expect(response.documents).toHaveLength(1);
      expect(response.documents[0]).toEqual(
        expect.objectContaining({
          path: "$.arbitraryEnvelope.generatedDocument",
          encoding: "xml",
        }),
      );
      expect(response.documents[0]?.parsed.kind).toBe("NFSe");
    }
  });

  it("discovers gzip/base64 event documents in SEFIN JSON envelopes", () => {
    const encoded = gzipSync(registeredEventXml()).toString("base64");
    const response = parseSefinDocumentResponse(JSON.stringify({ payload: encoded }));

    expect(response.kind).toBe("success");
    if (response.kind === "success") {
      expect(response.documents[0]?.encoding).toBe("gzip-base64");
      expect(response.documents[0]?.parsed.kind).toBe("evento");
    }
  });

  it("returns typed SEFIN rejections while preserving unknown official fields", () => {
    const body = JSON.stringify({
      ambiente: 2,
      erros: [{ codigo: "E001", descricao: "DPS rejeitada", complemento: "Teste" }],
    });
    const response = parseSefinDocumentResponse(body, { status: 422 });

    expect(response).toEqual({
      kind: "rejection",
      status: 422,
      originalBody: body,
      raw: {
        ambiente: 2,
        erros: [{ codigo: "E001", descricao: "DPS rejeitada", complemento: "Teste" }],
      },
      reason: "remote-rejection",
    });
  });

  it("bounds malformed, oversized, and deeply nested SEFIN responses", () => {
    expect(() => parseSefinDocumentResponse("{")).toThrowError(
      expect.objectContaining<Partial<SefinResponseParseError>>({ code: "invalid-json" }),
    );
    expect(() =>
      parseSefinDocumentResponse(JSON.stringify({ value: "large" }), { maxBytes: 5 }),
    ).toThrowError(
      expect.objectContaining<Partial<SefinResponseParseError>>({
        code: "document-too-large",
      }),
    );
    expect(() =>
      parseSefinDocumentResponse(JSON.stringify({ one: { two: { three: true } } }), {
        maxDepth: 1,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<SefinResponseParseError>>({ code: "nesting-too-deep" }),
    );
  });
});

function nfseXml(): string {
  const dpsDocument = createDps(validDpsInput());
  const dps = serializeDps(dpsDocument, { declaration: false }).replace(
    "</DPS>",
    `${signatureXml(dpsDocument.infDPS.Id)}</DPS>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?><NFSe xmlns="${NAMESPACE}" versao="1.01"><infNFSe Id="${NFSE_ID}"><xLocEmi>São Paulo</xLocEmi><xLocPrestacao>São Paulo</xLocPrestacao><nNFSe>1</nNFSe><cLocIncid>3550308</cLocIncid><xLocIncid>São Paulo</xLocIncid><xTribNac>Serviços de tecnologia</xTribNac><verAplic>nfse-js-test</verAplic><ambGer>2</ambGer><tpEmis>1</tpEmis><procEmi>1</procEmi><cStat>100</cStat><dhProc>2026-06-11T10:31:00+01:00</dhProc><nDFSe>1</nDFSe><emit><CNPJ>12345678000195</CNPJ><IM>12345</IM><xNome>Example Services Ltda</xNome><xFant>Example</xFant><enderNac><xLgr>Rua Exemplo</xLgr><nro>100</nro><xCpl>Sala 1</xCpl><xBairro>Centro</xBairro><cMun>3550308</cMun><UF>SP</UF><CEP>01001000</CEP></enderNac><fone>1130000000</fone><email>billing@example.com</email></emit><valores><vBC>100.00</vBC><pAliqAplic>5.00</pAliqAplic><vISSQN>5.00</vISSQN><vLiq>100.00</vLiq></valores>${dps}</infNFSe>${signatureXml(NFSE_ID)}</NFSe>`;
}

function eventRequestXml(signed: boolean): string {
  const signature = signed ? signatureXml(EVENT_REQUEST_ID) : "";
  return `<?xml version="1.0" encoding="UTF-8"?><pedRegEvento xmlns="${NAMESPACE}" versao="1.01"><infPedReg Id="${EVENT_REQUEST_ID}"><tpAmb>2</tpAmb><verAplic>nfse-js-test</verAplic><dhEvento>2026-06-11T11:00:00+01:00</dhEvento><CNPJAutor>12345678000195</CNPJAutor><chNFSe>${NFSE_KEY}</chNFSe><e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>1</cMotivo><xMotivo>Documento emitido incorretamente</xMotivo></e101101></infPedReg>${signature}</pedRegEvento>`;
}

function registeredEventXml(): string {
  const request = eventRequestXml(true).replace('<?xml version="1.0" encoding="UTF-8"?>', "");
  return `<?xml version="1.0" encoding="UTF-8"?><evento xmlns="${NAMESPACE}" versao="1.01"><infEvento Id="${REGISTERED_EVENT_ID}"><verAplic>nfse-js-test</verAplic><ambGer>2</ambGer><nSeqEvento>001</nSeqEvento><dhProc>2026-06-11T11:01:00+01:00</dhProc><nDFSe>1</nDFSe>${request}</infEvento>${signatureXml(REGISTERED_EVENT_ID)}</evento>`;
}

function signatureXml(referenceId: string): string {
  return `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignedInfo><ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><ds:Reference URI="#${referenceId}"><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>AA==</ds:DigestValue></ds:Reference></ds:SignedInfo><ds:SignatureValue>AA==</ds:SignatureValue></ds:Signature>`;
}
