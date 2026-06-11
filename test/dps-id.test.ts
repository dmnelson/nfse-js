import { describe, expect, it } from "vitest";
import { buildDpsId, InvalidDpsIdError } from "../src/index.js";

describe("buildDpsId", () => {
  it("builds the 45-character identifier for a CNPJ", () => {
    const id = buildDpsId({
      cLocEmi: "3550308",
      emitente: { CNPJ: "12345678000195" },
      serie: "1",
      nDPS: "42",
    });

    expect(id).toBe("DPS355030821234567800019500001000000000000042");
    expect(id).toHaveLength(45);
  });

  it("left-pads a CPF to the federal registration width", () => {
    const id = buildDpsId({
      cLocEmi: "3550308",
      emitente: { CPF: "12345678909" },
      serie: "12",
      nDPS: "1",
    });

    expect(id).toBe("DPS355030810001234567890900012000000000000001");
  });

  it("rejects identifiers unsupported by the DPS ID format", () => {
    expect(() =>
      buildDpsId({
        cLocEmi: "3550308",
        emitente: { NIF: "GB123" },
        serie: "1",
        nDPS: "1",
      }),
    ).toThrow(InvalidDpsIdError);
  });

  it.each([
    [
      "municipality",
      { cLocEmi: "123", emitente: { CNPJ: "12345678000195" }, serie: "1", nDPS: "1" },
    ],
    [
      "series",
      { cLocEmi: "3550308", emitente: { CNPJ: "12345678000195" }, serie: "ABC", nDPS: "1" },
    ],
    [
      "number",
      { cLocEmi: "3550308", emitente: { CNPJ: "12345678000195" }, serie: "1", nDPS: "01" },
    ],
    ["CNPJ", { cLocEmi: "3550308", emitente: { CNPJ: "123" }, serie: "1", nDPS: "1" }],
    ["CPF", { cLocEmi: "3550308", emitente: { CPF: "123" }, serie: "1", nDPS: "1" }],
  ] as const)("rejects an invalid %s", (_label, options) => {
    expect(() => buildDpsId(options)).toThrow(InvalidDpsIdError);
  });
});
