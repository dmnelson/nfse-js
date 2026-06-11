import { describe, expect, it } from "vitest";
import {
  createDps,
  type DpsDocument,
  DpsValidationError,
  serializeDps,
  validateDps,
} from "../src/index.js";
import { validDpsInput } from "./fixtures.js";

describe("DPS documents", () => {
  it("creates an ID and produces deterministic National DPS XML", () => {
    const dps = createDps(validDpsInput());
    const xml = serializeDps(dps);

    expect(dps.infDPS.Id).toHaveLength(45);
    expect(xml).toContain('<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">');
    expect(xml).toContain(`<infDPS Id="${dps.infDPS.Id}">`);
    expect(xml).toContain("<vServ>100.00</vServ>");
    expect(xml).not.toContain("undefined");
  });

  it("collects semantic validation issues", () => {
    const dps = createDps(validDpsInput());
    const invalid = {
      ...dps,
      infDPS: {
        ...dps.infDPS,
        dCompet: "11/06/2026",
      },
    };

    expect(validateDps(invalid)).toEqual({
      valid: false,
      issues: [
        {
          path: "infDPS.dCompet",
          code: "format",
          message: "must use YYYY-MM-DD",
        },
      ],
    });
  });

  it("supports compact fragments without an XML declaration", () => {
    const xml = serializeDps(validDpsInput(), { declaration: false, pretty: true });

    expect(xml.startsWith("<?xml")).toBe(false);
    expect(xml).toContain("\n");
  });

  it("covers alternate identity and conditional business rules", () => {
    const base = createDps(validDpsInput());
    const invalid: DpsDocument = {
      ...base,
      infDPS: {
        ...base.infDPS,
        Id: "bad",
        cLocEmi: "1",
        serie: "ABC",
        nDPS: "01",
        dCompet: "20260611",
        dhEmi: "2026-06-11",
        tpEmit: "2",
        prest: {
          CNPJ: "123",
          end: {
            endNac: { cMun: "1", CEP: "2" },
            xLgr: "Street",
            nro: "1",
            xBairro: "Centre",
          },
          regTrib: base.infDPS.prest.regTrib,
        },
        toma: {
          CPF: "123",
          xNome: "Customer",
        },
        interm: {
          CPF: "456",
          xNome: "Intermediary",
        },
        serv: {
          ...base.infDPS.serv,
          locPrest: { cPaisPrestacao: "BR" },
          cServ: {
            ...base.infDPS.serv.cServ,
            cTribNac: "1",
          },
        },
        valores: {
          ...base.infDPS.valores,
          vServPrest: { vServ: "bad" as never },
        },
        subst: {
          chSubstda: "1".repeat(50),
          cMotivo: "99",
        },
      },
    };

    const result = validateDps(invalid);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "infDPS.Id",
        "infDPS.prest.CNPJ",
        "infDPS.toma.CPF",
        "infDPS.interm.CPF",
        "infDPS.serv.locPrest.cPaisPrestacao",
        "infDPS.cMotivoEmisTI",
        "infDPS.subst.xMotivo",
      ]),
    );
    expect(() => serializeDps(invalid)).toThrow(DpsValidationError);
  });

  it("rejects a provider-only issuer reason", () => {
    const dps = createDps(validDpsInput());
    const invalid = {
      ...dps,
      infDPS: {
        ...dps.infDPS,
        cMotivoEmisTI: "1" as const,
      },
    };

    expect(validateDps(invalid).issues).toContainEqual(
      expect.objectContaining({ path: "infDPS.cMotivoEmisTI", code: "unexpected" }),
    );
  });

  it("generates IDs for CPF providers and rejects non-Brazilian IDs", () => {
    const input = validDpsInput();
    const cpfDps = createDps({
      ...input,
      infDPS: {
        ...input.infDPS,
        prest: {
          CPF: "12345678909",
          regTrib: input.infDPS.prest.regTrib,
        },
      },
    });
    expect(cpfDps.infDPS.Id).toHaveLength(45);

    for (const prest of [
      { NIF: "GB123", regTrib: input.infDPS.prest.regTrib },
      { cNaoNIF: "1" as const, regTrib: input.infDPS.prest.regTrib },
    ]) {
      expect(() =>
        createDps({
          ...input,
          infDPS: { ...input.infDPS, prest },
        }),
      ).toThrow();
    }
  });
});
