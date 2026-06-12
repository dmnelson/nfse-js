import { describe, expect, it } from "vitest";
import {
  createDps,
  type DpsDocument,
  DpsValidationError,
  serializeDps,
  validateDps,
} from "../src/index.js";
import { schemaCoverageDpsInputs, validDpsInput } from "./fixtures.js";

describe("DPS documents", () => {
  it.each(schemaCoverageDpsInputs())("matches the canonical $name XML fixture", ({ input }) => {
    expect(serializeDps(input, { pretty: true })).toMatchSnapshot();
  });

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
        expect.objectContaining({
          path: "infDPS.dCompet",
          code: "facet",
          category: "schema",
        }),
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
          locPrest: { cPaisPrestacao: "BRA" },
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
      expect.objectContaining({ path: "infDPS.cMotivoEmisTI", code: "E0029" }),
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

  it("serializes repeated and mutually exclusive schema groups in order", () => {
    const fixture = schemaCoverageDpsInputs().find(({ name }) => name === "specialized groups");
    expect(fixture).toBeDefined();

    const xml = serializeDps(fixture?.input as never);

    expect(xml.match(/<docDedRed>/g)).toHaveLength(6);
    expect(xml.match(/<documentos>/g)).toHaveLength(4);
    expect(xml.match(/<refNFSe>/g)).toHaveLength(2);
    expect(xml).toContain("<comExt><mdPrestacao>1</mdPrestacao>");
    expect(xml).toContain("<obra><inscImobFisc>PROPERTY-1</inscImobFisc><cObra>CNO-123</cObra>");
    expect(xml).toContain("<atvEvento><xNome>Technology conference</xNome>");
    expect(xml).not.toContain("undefined");
  });

  it.each([
    ["order items", "infDPS.serv.infoCompl.gItemPed.xItemPed"],
    ["deduction documents", "infDPS.valores.vDedRed.documentos.docDedRed"],
    ["referenced NFS-e", "infDPS.IBSCBS.gRefNFSe.refNFSe"],
    ["reimbursement documents", "infDPS.IBSCBS.valores.gReeRepRes.documentos"],
  ])("rejects an empty repeated %s group", (_name, expectedPath) => {
    const fixture = schemaCoverageDpsInputs().find(({ name }) => name === "specialized groups");
    expect(fixture).toBeDefined();
    const dps = createDps(fixture?.input as never);
    const info = dps.infDPS;

    const invalid: DpsDocument =
      expectedPath === "infDPS.serv.infoCompl.gItemPed.xItemPed"
        ? {
            ...dps,
            infDPS: {
              ...info,
              serv: {
                ...info.serv,
                infoCompl: {
                  ...info.serv.infoCompl,
                  gItemPed: { xItemPed: [] },
                },
              },
            },
          }
        : expectedPath === "infDPS.valores.vDedRed.documentos.docDedRed"
          ? {
              ...dps,
              infDPS: {
                ...info,
                valores: {
                  ...info.valores,
                  vDedRed: { documentos: { docDedRed: [] } },
                },
              },
            }
          : expectedPath === "infDPS.IBSCBS.gRefNFSe.refNFSe"
            ? {
                ...dps,
                infDPS: {
                  ...info,
                  IBSCBS: {
                    ...info.IBSCBS,
                    gRefNFSe: { refNFSe: [] },
                  } as NonNullable<DpsDocument["infDPS"]["IBSCBS"]>,
                },
              }
            : {
                ...dps,
                infDPS: {
                  ...info,
                  IBSCBS: {
                    ...info.IBSCBS,
                    valores: {
                      ...info.IBSCBS?.valores,
                      gReeRepRes: { documentos: [] },
                    },
                  } as NonNullable<DpsDocument["infDPS"]["IBSCBS"]>,
                },
              };

    expect(validateDps(invalid).issues).toContainEqual(
      expect.objectContaining({ path: expectedPath, code: "length" }),
    );
    expect(() => serializeDps(invalid)).toThrow(DpsValidationError);
  });
});
