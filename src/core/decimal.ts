import { NfseError } from "../errors.js";
import type { Decimal } from "./types.js";

export interface DecimalOptions {
  readonly integerDigits?: number;
  readonly fractionDigits?: number;
}

export function decimal(value: string, options: DecimalOptions = {}): Decimal {
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

  return value as Decimal;
}
