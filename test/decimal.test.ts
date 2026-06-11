import { describe, expect, it } from "vitest";
import { decimal, NfseError } from "../src/index.js";

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
});
