import { describe, expect, it } from "vitest";
import {
  createDps,
  DPS_REFERENCE_DATA_FIELD_COVERAGE,
  DPS_REFERENCE_DATA_SETS,
  type DpsInput,
  type DpsReferenceCodeSet,
  type DpsReferenceDataProvider,
  type DpsReferenceDataSetId,
  validateDps,
  validateDpsWithReferenceData,
} from "../src/core/index.js";
import { foreignServiceExportInput, schemaCoverageDpsInputs, validDpsInput } from "./fixtures.js";

describe("reference-data validation", () => {
  it("accepts known codes from a complete supplied provider", () => {
    const input = requiredFixture("specialized groups");
    const result = validateDpsWithReferenceData(createDps(input), completeReferenceDataProvider());

    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("reports lexically valid but unknown country, service, NBS, and currency codes", () => {
    const input = foreignServiceExportInput("NIF");
    const invalid = createDps({
      ...input,
      infDPS: {
        ...input.infDPS,
        toma: {
          NIF: "ZZ123",
          xNome: "Unknown country customer",
          end: {
            endExt: {
              cPais: "ZZ",
              cEndPost: "99999",
              xCidade: "Nowhere",
              xEstProvReg: "Nowhere",
            },
            xLgr: "Reference Road",
            nro: "1",
            xBairro: "Reference District",
          },
        },
        serv: {
          ...input.infDPS.serv,
          locPrest: { cPaisPrestacao: "ZZ" },
          cServ: {
            ...input.infDPS.serv.cServ,
            cTribNac: "999999",
            cNBS: "999999999",
          },
          comExt: {
            ...requiredForeignTrade(input),
            tpMoeda: "999",
          },
        },
      },
    });

    expect(
      referenceIssuePaths(validateDpsWithReferenceData(invalid, completeReferenceDataProvider())),
    ).toEqual(
      expect.arrayContaining([
        "infDPS.toma.end.endExt.cPais",
        "infDPS.serv.locPrest.cPaisPrestacao",
        "infDPS.serv.cServ.cTribNac",
        "infDPS.serv.cServ.cNBS",
        "infDPS.serv.comExt.tpMoeda",
      ]),
    );
  });

  it("reports unknown IBS/CBS operation, CST, classification, and presumed-credit codes", () => {
    const input = requiredFixture("specialized groups");
    const invalid = createDps({
      ...input,
      infDPS: {
        ...input.infDPS,
        IBSCBS: {
          ...requiredIbsCbs(input),
          cIndOp: "999999",
          valores: {
            ...requiredIbsCbs(input).valores,
            trib: {
              gIBSCBS: {
                CST: "999",
                cClassTrib: "999999",
                cCredPres: "99",
                gTribRegular: {
                  CSTReg: "998",
                  cClassTribReg: "999998",
                },
              },
            },
          },
        },
      },
    });

    const issues = validateDpsWithReferenceData(invalid, completeReferenceDataProvider()).issues;
    expect(referenceIssuePaths({ issues })).toEqual(
      expect.arrayContaining([
        "infDPS.IBSCBS.cIndOp",
        "infDPS.IBSCBS.valores.trib.gIBSCBS.CST",
        "infDPS.IBSCBS.valores.trib.gIBSCBS.cClassTrib",
        "infDPS.IBSCBS.valores.trib.gIBSCBS.cCredPres",
        "infDPS.IBSCBS.valores.trib.gIBSCBS.gTribRegular.CSTReg",
        "infDPS.IBSCBS.valores.trib.gIBSCBS.gTribRegular.cClassTribReg",
      ]),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        path: "infDPS.IBSCBS.valores.trib.gIBSCBS.cCredPres",
        code: "reference-data.unknown-code",
        category: "reference-data",
        source: expect.objectContaining({
          hash: "sha256:test",
          retrievedAt: "2026-06-16",
        }),
      }),
    );
  });

  it("distinguishes unavailable datasets from confirmed unknown codes", () => {
    const dps = createDps(validDpsInput());
    const result = validateDpsWithReferenceData(dps, providerWithOnly("location-codes"));

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        path: "infDPS.serv.cServ.cTribNac",
        code: "reference-data.unavailable",
        category: "reference-data",
      }),
    );
    expect(result.issues).not.toContainEqual(
      expect.objectContaining({
        path: "infDPS.serv.cServ.cTribNac",
        code: "reference-data.unknown-code",
      }),
    );
  });

  it("can skip missing datasets when consumers intentionally supply a partial provider", () => {
    const dps = createDps(validDpsInput());
    const result = validateDpsWithReferenceData(dps, providerWithOnly("location-codes"), {
      referenceDataOptions: { missingCodeSet: "skip" },
    });

    expect(result.issues).not.toContainEqual(
      expect.objectContaining({ code: "reference-data.unavailable" }),
    );
  });

  it("accepts aliases supplied by normalized reference records", () => {
    const input = foreignServiceExportInput("NIF");
    const dps = createDps({
      ...input,
      infDPS: {
        ...input.infDPS,
        toma: {
          NIF: "UK123",
          xNome: "Alias country customer",
          end: {
            endExt: {
              cPais: "UK",
              cEndPost: "SW1A1AA",
              xCidade: "London",
              xEstProvReg: "London",
            },
            xLgr: "Parliament Square",
            nro: "1",
            xBairro: "Westminster",
          },
        },
        serv: {
          ...input.infDPS.serv,
          locPrest: { cPaisPrestacao: "UK" },
        },
      },
    });

    expect(validateDpsWithReferenceData(dps, completeReferenceDataProvider())).toEqual({
      valid: true,
      issues: [],
    });
  });

  it("falls back to codes when a custom lookup has no answer", () => {
    const input = validDpsInput();
    const provider = {
      codeSets: {
        "location-codes": codeSet(["3550308"]),
        "national-service-codes": {
          ...codeSet(["010101"]),
          lookup: () => undefined,
        },
      },
    } satisfies DpsReferenceDataProvider;

    const result = validateDpsWithReferenceData(createDps(input), provider, {
      referenceDataOptions: { missingCodeSet: "skip" },
    });

    expect(result).toEqual({ valid: true, issues: [] });
  });

  it.each([
    { name: "boolean true", lookup: () => true },
    { name: "canonical string", lookup: () => "010101" },
    { name: "record", lookup: () => ({ code: "010101" }) },
    { name: "found match", lookup: () => ({ found: true, canonicalCode: "010101" }) },
  ] satisfies readonly {
    readonly name: string;
    readonly lookup: NonNullable<DpsReferenceCodeSet["lookup"]>;
  }[])("accepts lookup return shape $name", ({ lookup }) => {
    const provider = {
      codeSets: {
        "location-codes": codeSet(["3550308"]),
        "national-service-codes": {
          source: referenceSource(),
          lookup,
        },
      },
    } satisfies DpsReferenceDataProvider;

    const result = validateDpsWithReferenceData(createDps(validDpsInput()), provider, {
      referenceDataOptions: { missingCodeSet: "skip" },
    });

    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("treats a false lookup result as a confirmed unknown even when codes are supplied", () => {
    const provider = {
      codeSets: {
        "location-codes": codeSet(["3550308"]),
        "national-service-codes": {
          ...codeSet(["010101"]),
          lookup: () => false,
        },
      },
    } satisfies DpsReferenceDataProvider;

    const result = validateDpsWithReferenceData(createDps(validDpsInput()), provider, {
      referenceDataOptions: { missingCodeSet: "skip" },
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        path: "infDPS.serv.cServ.cTribNac",
        code: "reference-data.unknown-code",
      }),
    );
  });

  it("reports lookup-only providers without an answer as unavailable reference data", () => {
    const provider = {
      codeSets: {
        "location-codes": codeSet(["3550308"]),
        "national-service-codes": {
          source: referenceSource(),
          lookup: () => undefined,
        },
      },
    } satisfies DpsReferenceDataProvider;

    const result = validateDpsWithReferenceData(createDps(validDpsInput()), provider, {
      referenceDataOptions: { missingCodeSet: "skip" },
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        path: "infDPS.serv.cServ.cTribNac",
        code: "reference-data.unavailable",
      }),
    );
  });

  it("supports the validateDps referenceData option", () => {
    const input = validDpsInput();
    const invalid = createDps({
      ...input,
      infDPS: {
        ...input.infDPS,
        serv: {
          ...input.infDPS.serv,
          cServ: {
            ...input.infDPS.serv.cServ,
            cTribNac: "999999",
          },
        },
      },
    });

    expect(
      validateDps(invalid, { referenceData: completeReferenceDataProvider() }).issues,
    ).toContainEqual(
      expect.objectContaining({
        path: "infDPS.serv.cServ.cTribNac",
        code: "reference-data.unknown-code",
      }),
    );
  });

  it("documents every exported reference-data field against a known dataset", () => {
    const dataSetIds = new Set(DPS_REFERENCE_DATA_SETS.map((definition) => definition.id));

    expect(DPS_REFERENCE_DATA_FIELD_COVERAGE.length).toBeGreaterThan(0);
    expect(DPS_REFERENCE_DATA_FIELD_COVERAGE.every((field) => dataSetIds.has(field.dataSet))).toBe(
      true,
    );
    expect(
      DPS_REFERENCE_DATA_FIELD_COVERAGE.every(
        (field) => field.path.length > 0 && field.authoritativeSource.length > 0,
      ),
    ).toBe(true);
  });
});

function completeReferenceDataProvider(): DpsReferenceDataProvider {
  return {
    codeSets: {
      "location-codes": codeSet(["3550308"]),
      "country-codes": codeSet([{ code: "GB", aliases: ["UK"] }, "US"]),
      "currency-codes": codeSet(["220", "826"]),
      "national-service-codes": codeSet(["010101"]),
      "nbs-codes": codeSet(["123456789"]),
      "ibs-cbs-operation-codes": codeSet(["100101"]),
      "ibs-cbs-tax-situation-codes": codeSet(["000"]),
      "ibs-cbs-tax-classification-codes": codeSet(["000001"]),
      "ibs-cbs-presumed-credit-codes": codeSet(["01"]),
    },
  };
}

function providerWithOnly(dataSet: DpsReferenceDataSetId): DpsReferenceDataProvider {
  return {
    getCodeSet(id) {
      return id === dataSet ? codeSet(["3550308"]) : undefined;
    },
  };
}

function codeSet(codes: NonNullable<DpsReferenceCodeSet["codes"]>): DpsReferenceCodeSet {
  return {
    codes,
    source: referenceSource(),
  };
}

function referenceSource(): DpsReferenceCodeSet["source"] {
  return {
    document: "Test authoritative reference data",
    version: "2026-06-16",
    section: "fixture",
    url: "https://example.invalid/reference-data",
    identifier: "test-reference-data",
    hash: "sha256:test",
    retrievedAt: "2026-06-16",
  };
}

function referenceIssuePaths(result: { readonly issues: readonly { readonly path: string }[] }) {
  return result.issues.map((issue) => issue.path);
}

function requiredFixture(name: string): DpsInput {
  const fixture = schemaCoverageDpsInputs().find((candidate) => candidate.name === name);
  if (!fixture) {
    throw new Error(`missing fixture ${name}`);
  }
  return fixture.input;
}

function requiredForeignTrade(input: DpsInput): NonNullable<DpsInput["infDPS"]["serv"]["comExt"]> {
  if (!input.infDPS.serv.comExt) {
    throw new Error("foreign-service fixture must include foreign-trade data");
  }
  return input.infDPS.serv.comExt;
}

function requiredIbsCbs(input: DpsInput): NonNullable<DpsInput["infDPS"]["IBSCBS"]> {
  if (!input.infDPS.IBSCBS) {
    throw new Error("fixture must include IBS/CBS data");
  }
  return input.infDPS.IBSCBS;
}
