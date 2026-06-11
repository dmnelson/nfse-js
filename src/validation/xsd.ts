import { XsdValidationError, type XsdViolation } from "../errors.js";
import {
  getNationalNfseSchema,
  getNationalNfseSchemas,
  type NationalNfseSchema,
} from "../schemas/index.js";

export interface XsdValidationResult {
  readonly valid: boolean;
  readonly violations: readonly XsdViolation[];
}

export interface XsdValidationOptions {
  readonly throwOnInvalid?: boolean;
}

export async function validateXml(
  xml: string,
  schema: NationalNfseSchema,
  options: XsdValidationOptions = {},
): Promise<XsdValidationResult> {
  const { validateXML } = await import("xmllint-wasm");
  const mainSchema = getNationalNfseSchema(schema);
  const preload = getNationalNfseSchemas()
    .filter((candidate) => candidate.fileName !== mainSchema.fileName)
    .map((candidate) => ({
      fileName: candidate.fileName,
      contents: candidate.contents,
    }));

  const output = await validateXML({
    xml: [{ fileName: "document.xml", contents: xml }],
    schema: [{ fileName: mainSchema.fileName, contents: mainSchema.contents }],
    preload,
  });

  const violations: XsdViolation[] = (output.errors ?? []).map((error) => {
    const message = error.message ?? error.rawMessage ?? "Unknown XSD violation";
    const line = error.loc?.lineNumber;
    return typeof line === "number" ? { message, line } : { message };
  });
  const result = { valid: output.valid, violations };

  if (!result.valid && (options.throwOnInvalid ?? true)) {
    throw new XsdValidationError(result.violations);
  }

  return result;
}

export function validateDpsXml(
  xml: string,
  options?: XsdValidationOptions,
): Promise<XsdValidationResult> {
  return validateXml(xml, "DPS_v1.01.xsd", options);
}

export function validateNfseXml(
  xml: string,
  options?: XsdValidationOptions,
): Promise<XsdValidationResult> {
  return validateXml(xml, "NFSe_v1.01.xsd", options);
}

export function validateEventRequestXml(
  xml: string,
  options?: XsdValidationOptions,
): Promise<XsdValidationResult> {
  return validateXml(xml, "pedRegEvento_v1.01.xsd", options);
}

export function validateEventXml(
  xml: string,
  options?: XsdValidationOptions,
): Promise<XsdValidationResult> {
  return validateXml(xml, "evento_v1.01.xsd", options);
}
