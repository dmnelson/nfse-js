import { describe, expect, it } from "vitest";
import {
  createDps,
  type DpsInput,
  decimal1v2,
  decimal2v2,
  decimal3v2,
  decimal15v2,
  isValidCnpj,
  isValidCpf,
  NATIONAL_DPS_RULES,
  serializeDps,
  validateDps,
  validateDpsWithMunicipalParameters,
  validateDpsXml,
} from "../src/index.js";
import { parseDpsXml } from "../src/parsing/index.js";
import {
  type ForeignCustomerIdentity,
  foreignServiceExportInput,
  validDpsInput,
} from "./fixtures.js";

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

  it.each([
    "NIF",
    "cNaoNIF",
  ] as const)("round-trips a valid foreign-service export with %s customer identity", async (identity) => {
    const dps = createDps(foreignServiceExportInput(identity));

    expect(validateDps(dps)).toEqual({ valid: true, issues: [] });

    const xml = serializeDps(dps);
    await expect(validateDpsXml(xml)).resolves.toEqual({ valid: true, violations: [] });
    expect(parseDpsXml(xml).document).toEqual(dps);
  });

  it.each(foreignServiceRuleCases())("enforces foreign-service rule $code for $name", ({
    identity,
    mutate,
    code,
    path,
    row,
  }) => {
    const invalid = createDps(mutate(foreignServiceExportInput(identity)));

    expect(validateDps(invalid).issues).toContainEqual(
      expect.objectContaining({
        code,
        officialCode: code,
        path,
        category: "business",
        source: expect.objectContaining({ row }),
      }),
    );
  });

  it.each([
    { name: "provider incidence", serviceCode: "010101" },
    { name: "foreign-customer incidence", serviceCode: "170501" },
  ])("accepts cPaisResult for a domestic-location export with $name", ({ serviceCode }) => {
    const input = foreignServiceExportInput("NIF");
    const domesticExport = createDps({
      ...input,
      infDPS: {
        ...input.infDPS,
        serv: {
          ...input.infDPS.serv,
          locPrest: { cLocPrestacao: "3550308" },
          cServ: {
            ...input.infDPS.serv.cServ,
            cTribNac: serviceCode,
          },
        },
        valores: {
          ...input.infDPS.valores,
          trib: {
            ...input.infDPS.valores.trib,
            tribMun: {
              ...input.infDPS.valores.trib.tribMun,
              cPaisResult: "GB",
            },
          },
        },
      },
    });

    expect(validateDps(domesticExport)).toEqual({ valid: true, issues: [] });
  });

  it("does not require cPaisResult for service-location incidence", () => {
    const input = foreignServiceExportInput("NIF");
    const domesticExport = createDps({
      ...input,
      infDPS: {
        ...input.infDPS,
        serv: {
          ...input.infDPS.serv,
          locPrest: { cLocPrestacao: "3550308" },
          cServ: {
            ...input.infDPS.serv.cServ,
            cTribNac: "030401",
          },
        },
      },
    });

    expect(validateDps(domesticExport)).toEqual({ valid: true, issues: [] });
  });

  it("validates foreign declaration number facets", () => {
    const input = foreignServiceExportInput("NIF");
    const invalid = createDps({
      ...input,
      infDPS: {
        ...input.infDPS,
        serv: {
          ...input.infDPS.serv,
          comExt: {
            ...requiredForeignTrade(input),
            movTempBens: "3",
            nRE: " leading",
          },
        },
      },
    });

    expect(validateDps(invalid).issues).toContainEqual(
      expect.objectContaining({
        code: "facet",
        category: "schema",
        path: "infDPS.serv.comExt.nRE",
      }),
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

interface ForeignServiceRuleCase {
  readonly name: string;
  readonly identity: ForeignCustomerIdentity;
  readonly mutate: (input: DpsInput) => DpsInput;
  readonly code: string;
  readonly path: string;
  readonly row: number;
}

function foreignServiceRuleCases(): readonly ForeignServiceRuleCase[] {
  return [
    {
      name: "foreign address without foreign identity",
      identity: "NIF",
      mutate: (input) => {
        const customer = requiredForeignCustomer(input);
        return {
          ...input,
          infDPS: {
            ...input.infDPS,
            toma: {
              CPF: "12345678909",
              xNome: customer.xNome,
              end: customer.end,
            },
          },
        };
      },
      code: "E0223",
      path: "infDPS.toma.NIF",
      row: 245,
    },
    {
      name: "unsupported no-NIF reason",
      identity: "cNaoNIF",
      mutate: (input) => {
        const customer = requiredForeignCustomer(input);
        return {
          ...input,
          infDPS: {
            ...input.infDPS,
            toma: {
              cNaoNIF: "0",
              xNome: customer.xNome,
              end: customer.end,
            },
          },
        };
      },
      code: "E0226",
      path: "infDPS.toma.cNaoNIF",
      row: 248,
    },
    {
      name: "NIF customer without foreign address",
      identity: "NIF",
      mutate: (input) => {
        const customer = requiredForeignCustomer(input);
        return {
          ...input,
          infDPS: {
            ...input.infDPS,
            toma: {
              NIF: "GB123",
              xNome: customer.xNome,
            },
          },
        };
      },
      code: "E0242",
      path: "infDPS.toma.end.endExt",
      row: 261,
    },
    {
      name: "export without NBS",
      identity: "NIF",
      mutate: (input) => {
        const { cNBS: _cNBS, ...cServ } = input.infDPS.serv.cServ;
        return {
          ...input,
          infDPS: {
            ...input.infDPS,
            serv: {
              ...input.infDPS.serv,
              cServ,
            },
          },
        };
      },
      code: "E0318",
      path: "infDPS.serv.cServ.cNBS",
      row: 322,
    },
    {
      name: "unknown service mode",
      identity: "NIF",
      mutate: (input) =>
        withForeignTrade(input, {
          ...requiredForeignTrade(input),
          mdPrestacao: "0",
        }),
      code: "E0333",
      path: "infDPS.serv.comExt.mdPrestacao",
      row: 328,
    },
    {
      name: "unknown provider support mechanism",
      identity: "NIF",
      mutate: (input) =>
        withForeignTrade(input, {
          ...requiredForeignTrade(input),
          mecAFComexP: "00",
        }),
      code: "E0341",
      path: "infDPS.serv.comExt.mecAFComexP",
      row: 332,
    },
    {
      name: "unknown customer support mechanism",
      identity: "NIF",
      mutate: (input) =>
        withForeignTrade(input, {
          ...requiredForeignTrade(input),
          mecAFComexT: "00",
        }),
      code: "E0343",
      path: "infDPS.serv.comExt.mecAFComexT",
      row: 333,
    },
    {
      name: "unknown temporary-goods movement",
      identity: "NIF",
      mutate: (input) =>
        withForeignTrade(input, {
          ...requiredForeignTrade(input),
          movTempBens: "0",
        }),
      code: "E0345",
      path: "infDPS.serv.comExt.movTempBens",
      row: 334,
    },
    {
      name: "declaration supplied without temporary movement",
      identity: "NIF",
      mutate: (input) =>
        withForeignTrade(input, {
          ...requiredForeignTrade(input),
          movTempBens: "1",
          nDI: "DI123",
        }),
      code: "E0354",
      path: "infDPS.serv.comExt.nDI",
      row: 336,
    },
    {
      name: "temporary export without registration",
      identity: "NIF",
      mutate: (input) =>
        withForeignTrade(input, {
          ...requiredForeignTrade(input),
          movTempBens: "3",
        }),
      code: "E0356",
      path: "infDPS.serv.comExt.nRE",
      row: 338,
    },
    {
      name: "domestic-location export without result country",
      identity: "NIF",
      mutate: (input) => ({
        ...input,
        infDPS: {
          ...input.infDPS,
          serv: {
            ...input.infDPS.serv,
            locPrest: { cLocPrestacao: "3550308" },
          },
        },
      }),
      code: "E0590",
      path: "infDPS.valores.trib.tribMun.cPaisResult",
      row: 466,
    },
    {
      name: "foreign-location export with result country",
      identity: "NIF",
      mutate: (input) => ({
        ...input,
        infDPS: {
          ...input.infDPS,
          valores: {
            ...input.infDPS.valores,
            trib: {
              ...input.infDPS.valores.trib,
              tribMun: {
                ...input.infDPS.valores.trib.tribMun,
                cPaisResult: "GB",
              },
            },
          },
        },
      }),
      code: "E0591",
      path: "infDPS.valores.trib.tribMun.cPaisResult",
      row: 467,
    },
  ];
}

function withForeignTrade(
  input: DpsInput,
  comExt: NonNullable<DpsInput["infDPS"]["serv"]["comExt"]>,
): DpsInput {
  return {
    ...input,
    infDPS: {
      ...input.infDPS,
      serv: {
        ...input.infDPS.serv,
        comExt,
      },
    },
  };
}

function requiredForeignTrade(input: DpsInput): NonNullable<DpsInput["infDPS"]["serv"]["comExt"]> {
  const foreignTrade = input.infDPS.serv.comExt;
  if (!foreignTrade) {
    throw new Error("foreign-service fixture must include foreign-trade data");
  }
  return foreignTrade;
}

function requiredForeignCustomer(input: DpsInput): {
  readonly xNome: string;
  readonly end: NonNullable<NonNullable<DpsInput["infDPS"]["toma"]>["end"]>;
} {
  const customer = input.infDPS.toma;
  if (!customer?.xNome || !customer.end) {
    throw new Error("foreign-service fixture must include a named customer with an address");
  }
  return { xNome: customer.xNome, end: customer.end };
}
