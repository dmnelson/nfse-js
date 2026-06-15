import { describe, expect, it } from "vitest";
import {
  decimal,
  decimal1v2,
  decimal2v2,
  decimal3v2,
  decimal15v2,
  NfseError,
} from "../src/index.js";

describe("decimal", () => {
  it("preserves an exact decimal string", () => {
    expect(decimal("100.00")).toBe("100.00");
  });

  it("rejects exponent notation and excess precision", () => {
    expect(() => decimal("1e2")).toThrow(NfseError);
    expect(() => decimal("10.001")).toThrow(NfseError);
  });

  it("supports explicit precision and rejects invalid options", () => {
    expect(decimal("100", { integerDigits: 3, fractionDigits: 0 })).toBe("100");
    expect(() => decimal("1000", { integerDigits: 3 })).toThrow(NfseError);
    expect(() => decimal("1", { integerDigits: 0 })).toThrow(NfseError);
    expect(() => decimal("1", { fractionDigits: -1 })).toThrow(NfseError);
  });

  it("constructs the field-specific XSD decimal types", () => {
    expect(decimal15v2("123456789012345.00")).toBe("123456789012345.00");
    expect(decimal3v2("999.99")).toBe("999.99");
    expect(decimal2v2("99.99")).toBe("99.99");
    expect(decimal1v2("9.99")).toBe("9.99");
  });

  it("enforces exact XSD lexical forms and integer precision", () => {
    for (const value of ["01.00", "1.0", "1.001", "-1.00"]) {
      expect(() => decimal15v2(value)).toThrow(NfseError);
    }
    expect(() => decimal3v2("1000.00")).toThrow(NfseError);
    expect(() => decimal2v2("100.00")).toThrow(NfseError);
    expect(() => decimal1v2("10.00")).toThrow(NfseError);
  });
});
