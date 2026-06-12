export * from "./core/index.js";
export {
  DpsValidationError,
  InvalidDpsIdError,
  NfseError,
  type ValidationCategory,
  type ValidationIssue,
  type ValidationSource,
  XsdValidationError,
  type XsdViolation,
} from "./errors.js";
export {
  validateDpsXml,
  validateEventRequestXml,
  validateEventXml,
  validateNfseXml,
  validateXml,
  type XsdValidationOptions,
  type XsdValidationResult,
} from "./validation/index.js";
