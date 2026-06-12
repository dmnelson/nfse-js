import { describe, expect, it } from "vitest";
import { serializeDps } from "../src/core/index.js";
import { DpsValidationError, XsdValidationError } from "../src/errors.js";
import { getNationalNfseSchema, getNationalNfseSchemas } from "../src/schemas/index.js";
import {
  validateDpsXml,
  validateEventRequestXml,
  validateEventXml,
  validateNfseXml,
} from "../src/validation/index.js";
import { schemaCoverageDpsInputs, validDps } from "./fixtures.js";

describe("XSD validation", () => {
  it("validates generated DPS XML against the bundled official schema", async () => {
    const result = await validateDpsXml(serializeDps(validDps()), {
      throwOnInvalid: false,
    });

    expect(result).toEqual({ valid: true, violations: [] });
  });

  it.each(schemaCoverageDpsInputs())("validates the $name DPS fixture", async ({ input }) => {
    const result = await validateDpsXml(serializeDps(input), {
      throwOnInvalid: false,
    });

    expect(result).toEqual({ valid: true, violations: [] });
  });

  it("returns violations when requested", async () => {
    const result = await validateDpsXml("<DPS />", {
      throwOnInvalid: false,
    });

    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("throws a structured error by default", async () => {
    await expect(validateDpsXml("<DPS />")).rejects.toBeInstanceOf(XsdValidationError);
  });

  it("exposes validators for other National document roots", async () => {
    const results = await Promise.all([
      validateNfseXml("<NFSe />", { throwOnInvalid: false }),
      validateEventRequestXml("<pedRegEvento />", { throwOnInvalid: false }),
      validateEventXml("<evento />", { throwOnInvalid: false }),
    ]);

    expect(results.every((result) => !result.valid)).toBe(true);
  });

  it("exposes the bundled schema set", () => {
    expect(getNationalNfseSchemas()).toHaveLength(10);
    expect(getNationalNfseSchema("DPS_v1.01.xsd").contents).toContain('name="DPS"');
    expect(() => getNationalNfseSchema("missing.xsd" as never)).toThrow(
      "Bundled National NFS-e schema not found",
    );
  });

  it("formats aggregate validation errors", () => {
    const dpsError = new DpsValidationError([
      { path: "a", code: "bad", message: "first" },
      { path: "b", code: "bad", message: "second" },
    ]);
    const xsdError = new XsdValidationError([{ message: "first" }, { message: "second", line: 2 }]);

    expect(dpsError.message).toContain("(+1 more)");
    expect(xsdError.message).toContain("(+1 more)");
  });
});
