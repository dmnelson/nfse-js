import { describe, expect, it } from "vitest";
import {
  createDps,
  decimal1v2,
  decimal2v2,
  decimal3v2,
  decimal15v2,
  isValidCnpj,
  isValidCpf,
  NATIONAL_DPS_RULES,
  validateDps,
  validateDpsWithMunicipalParameters,
} from "../src/index.js";
import { validDpsInput } from "./fixtures.js";

describe("semantic validation", () => {
  it("validates CPF and CNPJ check digits", () => {
    expect(isValidCpf("12345678909")).toBe(true);
    expect(isValidCpf("12345678900")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCnpj("12345678000195")).toBe(true);
    expect(isValidCnpj("12345678000190")).toBe(false);
    expect(isValidCnpj("11111111111111")).toBe(false);
  });

  it("rejects impossible calendar dates and unsupported timestamps", () => {
    const base = createDps(validDpsInput());
    const invalid = {
      ...base,
      infDPS: {
        ...base.infDPS,
        dCompet: "2026-02-29",
        dhEmi: "2026-04-31T10:30:00+01:00",
      },
    };

    expect(validateDps(invalid).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "infDPS.dCompet", code: "invalid-date" }),
        expect.objectContaining({ path: "infDPS.dhEmi", code: "invalid-date-time" }),
      ]),
    );
  });

  it("checks supplied identifiers against their source fields", () => {
    const base = createDps(validDpsInput());
    const invalid = {
      ...base,
      infDPS: {
        ...base.infDPS,
        Id: `${base.infDPS.Id.slice(0, -1)}2`,
      },
    };

    expect(validateDps(invalid).issues).toContainEqual(
      expect.objectContaining({
        path: "infDPS.Id",
        code: "E0004",
        officialCode: "E0004",
        category: "business",
      }),
    );
  });

  it("builds the DPS identifier from the selected customer issuer", () => {
    const input = validDpsInput();
    const dps = createDps({
      ...input,
      infDPS: {
        ...input.infDPS,
        tpEmit: "2",
        cMotivoEmisTI: "1",
        toma: {
          CNPJ: "12345678000195",
          xNome: "Customer issuer",
        },
      },
    });

    expect(dps.infDPS.Id).toContain("212345678000195");
  });

  it("applies the federal-tax CPF rule to the selected DPS issuer", () => {
    const input = validDpsInput();
    const federalTax = { vRetCP: decimal15v2("1.00") };
    const cpfCustomerIssuer = createDps({
      ...input,
      infDPS: {
        ...input.infDPS,
        tpEmit: "2",
        cMotivoEmisTI: "1",
        toma: {
          CPF: "12345678909",
          xNome: "Individual customer issuer",
        },
        valores: {
          ...input.infDPS.valores,
          trib: {
            ...input.infDPS.valores.trib,
            tribFed: federalTax,
          },
        },
      },
    });
    expect(validateDps(cpfCustomerIssuer).issues).toContainEqual(
      expect.objectContaining({ code: "E0675", path: "infDPS.valores.trib.tribFed" }),
    );

    const cnpjCustomerIssuer = createDps({
      ...input,
      infDPS: {
        ...input.infDPS,
        tpEmit: "2",
        cMotivoEmisTI: "1",
        prest: {
          CPF: "12345678909",
          regTrib: input.infDPS.prest.regTrib,
        },
        toma: {
          CNPJ: "12345678000195",
          xNome: "Corporate customer issuer",
        },
        valores: {
          ...input.infDPS.valores,
          trib: {
            ...input.infDPS.valores.trib,
            tribFed: federalTax,
          },
        },
      },
    });
    expect(validateDps(cnpjCustomerIssuer).issues).not.toContainEqual(
      expect.objectContaining({ code: "E0675" }),
    );

    const cpfIntermediaryIssuer = createDps({
      ...input,
      infDPS: {
        ...input.infDPS,
        tpEmit: "3",
        cMotivoEmisTI: "1",
        interm: {
          CPF: "12345678909",
          xNome: "Individual intermediary issuer",
        },
        valores: {
          ...input.infDPS.valores,
          vServPrest: {
            ...input.infDPS.valores.vServPrest,
            vReceb: decimal15v2("100.00"),
          },
          trib: {
            ...input.infDPS.valores.trib,
            tribFed: federalTax,
          },
        },
      },
    });
    expect(validateDps(cpfIntermediaryIssuer).issues).toContainEqual(
      expect.objectContaining({ code: "E0675", path: "infDPS.valores.trib.tribFed" }),
    );
  });

  it("includes percentage deductions in the aggregate reduction cap", () => {
    const input = validDpsInput();
    const invalid = createDps({
      ...input,
      infDPS: {
        ...input.infDPS,
        valores: {
          ...input.infDPS.valores,
          vDedRed: { pDR: decimal3v2("80.00") },
          vDescCondIncond: {
            vDescIncond: decimal15v2("20.00"),
          },
          trib: {
            ...input.infDPS.valores.trib,
            tribMun: {
              ...input.infDPS.valores.trib.tribMun,
              BM: {
                nBM: "35503080400001",
                vRedBCBM: decimal15v2("1.00"),
              },
            },
          },
        },
      },
    });

    expect(validateDps(invalid).issues).toContainEqual(
      expect.objectContaining({ code: "E0427", path: "infDPS.valores.vServPrest.vServ" }),
    );
  });

  it("validates full and simple address string facets", () => {
    const input = validDpsInput();
    const invalid = createDps({
      ...input,
      infDPS: {
        ...input.infDPS,
        prest: {
          ...input.infDPS.prest,
          end: {
            endNac: {
              cMun: "3550308",
              CEP: "01001000",
            },
            xLgr: "x".repeat(256),
            nro: " ",
            xCpl: " leading whitespace",
            xBairro: "x".repeat(61),
          },
        },
        serv: {
          ...input.infDPS.serv,
          obra: {
            end: {
              endExt: {
                cEndPost: "SW1A1AA",
                xCidade: "x".repeat(61),
                xEstProvReg: "x".repeat(61),
              },
              xLgr: "Road",
              nro: "1",
              xBairro: "District",
            },
          },
        },
      },
    });

    expect(validateDps(invalid).issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "infDPS.prest.end.xLgr",
        "infDPS.prest.end.nro",
        "infDPS.prest.end.xCpl",
        "infDPS.prest.end.xBairro",
        "infDPS.serv.obra.end.endExt.xCidade",
        "infDPS.serv.obra.end.endExt.xEstProvReg",
      ]),
    );
  });

  it("supports fail-fast validation", () => {
    const base = createDps(validDpsInput());
    const invalid = {
      ...base,
      infDPS: {
        ...base.infDPS,
        Id: "bad",
        dCompet: "bad",
        cLocEmi: "bad",
      },
    };

    expect(validateDps(invalid).issues.length).toBeGreaterThan(1);
    expect(validateDps(invalid, { mode: "fail-fast" }).issues).toHaveLength(1);
  });

  it("attaches unique official codes and source references to rule metadata", () => {
    expect(new Set(NATIONAL_DPS_RULES.map((rule) => rule.code)).size).toBe(
      NATIONAL_DPS_RULES.length,
    );
    expect(
      NATIONAL_DPS_RULES.every(
        (rule) =>
          rule.source.document.length > 0 &&
          rule.source.section === "RN DPS_NFS-e" &&
          rule.source.row !== undefined &&
          rule.source.url?.startsWith("https://www.gov.br/"),
      ),
    ).toBe(true);
  });

  it.each([
    [
      "Simples assessment",
      (input: ReturnType<typeof validDpsInput>) => ({
        ...input,
        infDPS: {
          ...input.infDPS,
          prest: {
            ...input.infDPS.prest,
            regTrib: {
              ...input.infDPS.prest.regTrib,
              regApTribSN: "1" as const,
            },
          },
        },
      }),
      "E0162",
    ],
    [
      "export data",
      (input: ReturnType<typeof validDpsInput>) => ({
        ...input,
        infDPS: {
          ...input.infDPS,
          serv: {
            ...input.infDPS.serv,
            locPrest: { cPaisPrestacao: "US" as const },
          },
        },
      }),
      "E0330",
    ],
    [
      "construction data",
      (input: ReturnType<typeof validDpsInput>) => ({
        ...input,
        infDPS: {
          ...input.infDPS,
          serv: {
            ...input.infDPS.serv,
            cServ: { ...input.infDPS.serv.cServ, cTribNac: "070201" },
          },
        },
      }),
      "E0370",
    ],
    [
      "event data",
      (input: ReturnType<typeof validDpsInput>) => ({
        ...input,
        infDPS: {
          ...input.infDPS,
          serv: {
            ...input.infDPS.serv,
            cServ: { ...input.infDPS.serv.cServ, cTribNac: "120101" },
          },
        },
      }),
      "E0390",
    ],
  ] as const)("enforces the documented %s dependency", (_name, mutate, expectedCode) => {
    const invalid = createDps(mutate(validDpsInput()));
    expect(validateDps(invalid).issues).toContainEqual(
      expect.objectContaining({ code: expectedCode, category: "business" }),
    );
  });

  it("enforces ISSQN and federal tax relationships", () => {
    const input = validDpsInput();
    const invalid = createDps({
      ...input,
      infDPS: {
        ...input.infDPS,
        valores: {
          ...input.infDPS.valores,
          trib: {
            tribMun: {
              tribISSQN: "2",
              tpRetISSQN: "2",
              pAliq: decimal1v2("6.00") as never,
            },
            tribFed: {
              piscofins: {
                CST: "01",
                vBCPisCofins: decimal15v2("100.00"),
                pAliqPis: decimal2v2("1.00"),
                vPis: decimal15v2("2.00"),
              },
            },
            totTrib: input.infDPS.valores.trib.totTrib,
          },
        },
      },
    });

    expect(validateDps(invalid).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "E0592" }),
        expect.objectContaining({ code: "E0580" }),
        expect.objectContaining({ code: "E0595" }),
        expect.objectContaining({ code: "E0694" }),
      ]),
    );
  });

  it("validates IBS/CBS dependencies and effective dates", () => {
    const input = validDpsInput();
    const invalid = createDps({
      ...input,
      infDPS: {
        ...input.infDPS,
        dCompet: "2025-12-31",
        dhEmi: "2025-12-31T10:30:00+00:00",
        IBSCBS: {
          finNFSe: "0",
          cIndOp: "999999",
          tpOper: "2",
          indDest: "0",
          dest: {
            CPF: "12345678909",
            xNome: "Unexpected destination",
          },
          valores: {
            trib: {
              gIBSCBS: {
                CST: "000",
                cClassTrib: "000001",
              },
            },
          },
        },
      },
    });

    expect(validateDps(invalid).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "E0850" }),
        expect.objectContaining({ code: "E0905" }),
        expect.objectContaining({ code: "E0910" }),
      ]),
    );
  });

  it("keeps municipal parameter validation separate from pure National rules", () => {
    const dps = createDps(validDpsInput());
    expect(validateDps(dps).valid).toBe(true);

    const result = validateDpsWithMunicipalParameters(dps, {
      municipality: "3304557",
      serviceCode: "999999",
      providerMunicipalRegistrationRequired: true,
      allowedDeductionModes: [],
      issqnRate: decimal1v2("5.00"),
      allowedWithholding: ["2"],
      resolvedAt: "2026-06-12T00:00:00Z",
      source: "Municipal parameter API fixture",
    });

    expect(result.issues.every((issue) => issue.category === "municipal-parameter")).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "municipal.municipality-mismatch",
        "municipal.service-mismatch",
        "municipal.registration-required",
        "municipal.withholding-not-allowed",
      ]),
    );
  });
});
