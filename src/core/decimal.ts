import { NfseError } from "../errors.js";
import type { Decimal, Decimal1V2, Decimal2V2, Decimal3V2, Decimal15V2 } from "./types.js";

export interface DecimalOptions {
  readonly integerDigits?: number;
  readonly fractionDigits?: number;
}

export function decimal(value: string): Decimal15V2;
export function decimal(value: string, options: DecimalOptions): Decimal<"custom">;
export function decimal(value: string, options?: DecimalOptions): Decimal15V2 | Decimal<"custom"> {
  if (options === undefined) {
    return decimal15v2(value);
  }

  const integerDigits = options.integerDigits ?? 13;
  const fractionDigits = options.fractionDigits ?? 2;

  if (!Number.isInteger(integerDigits) || integerDigits < 1) {
    throw new NfseError("integerDigits must be a positive integer");
  }
  if (!Number.isInteger(fractionDigits) || fractionDigits < 0) {
    throw new NfseError("fractionDigits must be a non-negative integer");
  }

  const expression =
    fractionDigits === 0
      ? new RegExp(`^\\d{1,${integerDigits}}$`)
      : new RegExp(`^\\d{1,${integerDigits}}(?:\\.\\d{1,${fractionDigits}})?$`);

  if (!expression.test(value)) {
    throw new NfseError(
      `Invalid decimal "${value}": expected up to ${integerDigits} integer and ${fractionDigits} fractional digits`,
    );
  }

  return value as Decimal<"custom">;
}

export function decimal15v2(value: string): Decimal15V2 {
  return xsdDecimal(value, 15, "TSDec15V2");
}

export function decimal3v2(value: string): Decimal3V2 {
  return xsdDecimal(value, 3, "TSDec3V2");
}

export function decimal2v2(value: string): Decimal2V2 {
  return xsdDecimal(value, 2, "TSDec2V2");
}

export function decimal1v2(value: string): Decimal1V2 {
  return xsdDecimal(value, 1, "TSDec1V2");
}

function xsdDecimal<Schema extends string>(
  value: string,
  integerDigits: number,
  typeName: Schema,
): Decimal<Schema> {
  const expression = new RegExp(
    `^(?:0|0\\.\\d{2}|[1-9]\\d{0,${integerDigits - 1}}(?:\\.\\d{2})?)$`,
  );

  if (!expression.test(value)) {
    throw new NfseError(
      `Invalid ${typeName} decimal "${value}": expected up to ${integerDigits} integer digits and exactly 2 fractional digits when present`,
    );
  }

  return value as Decimal<Schema>;
}
