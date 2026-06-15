import { type DpsFacetName, isValidXsdDateTime, validateFacet } from "../core/facets.js";
import { isValidCnpj, isValidCpf } from "../core/tax-id.js";
import { XmlParseError } from "../errors.js";

export function enumValue<const Values extends readonly string[]>(
  value: string,
  allowed: Values,
  path: string,
): Values[number] {
  if (!allowed.includes(value)) {
    throw new XmlParseError(
      "invalid-value",
      path,
      `expected one of ${allowed.join(", ")}, found ${value}`,
    );
  }
  return value as Values[number];
}

export function optionalEnumValue<const Values extends readonly string[]>(
  value: string | undefined,
  allowed: Values,
  path: string,
): Values[number] | undefined {
  return value === undefined ? undefined : enumValue(value, allowed, path);
}

export function facetValue(value: string, facet: DpsFacetName, path: string): string {
  const failure = validateFacet(facet, value);
  if (failure) {
    throw new XmlParseError("invalid-value", path, failure.detail);
  }
  return value;
}

export function optionalFacetValue(
  value: string | undefined,
  facet: DpsFacetName,
  path: string,
): string | undefined {
  return value === undefined ? undefined : facetValue(value, facet, path);
}

export function patternValue(
  value: string,
  pattern: RegExp,
  path: string,
  expected: string,
): string {
  if (!pattern.test(value)) {
    throw new XmlParseError("invalid-value", path, expected);
  }
  return value;
}

export function optionalPatternValue(
  value: string | undefined,
  pattern: RegExp,
  path: string,
  expected: string,
): string | undefined {
  return value === undefined ? undefined : patternValue(value, pattern, path, expected);
}

export function dateTimeValue(value: string, path: string): string {
  if (!isValidXsdDateTime(value)) {
    throw new XmlParseError("invalid-value", path, "expected a valid National NFS-e timestamp");
  }
  return value;
}

export function cnpjValue(value: string, path: string): string {
  if (!isValidCnpj(value)) {
    throw new XmlParseError("invalid-value", path, "expected a valid CNPJ");
  }
  return value;
}

export function cpfValue(value: string, path: string): string {
  if (!isValidCpf(value)) {
    throw new XmlParseError("invalid-value", path, "expected a valid CPF");
  }
  return value;
}
