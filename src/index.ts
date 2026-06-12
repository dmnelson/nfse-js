export * from "./core/index.js";
export {
  DpsValidationError,
  InvalidDpsIdError,
  NfseError,
  SefinResponseParseError,
  type SefinResponseParseErrorCode,
  type ValidationCategory,
  type ValidationIssue,
  type ValidationSource,
  XmlParseError,
  type XmlParseErrorCode,
  XmlSignatureError,
  type XmlSignatureErrorCode,
  XsdValidationError,
  type XsdViolation,
} from "./errors.js";
export * from "./parsing/index.js";
export * from "./signing/index.js";
export {
  validateDpsXml,
  validateEventRequestXml,
  validateEventXml,
  validateNfseXml,
  validateXml,
  type XsdValidationOptions,
  type XsdValidationResult,
} from "./validation/index.js";
