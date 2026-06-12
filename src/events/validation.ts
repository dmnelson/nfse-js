import { isValidXsdDateTime } from "../core/facets.js";
import { isValidCnpj, isValidCpf } from "../core/tax-id.js";
import { EventValidationError, type ValidationIssue } from "../errors.js";
import { buildEventRequestId } from "./ids.js";
import type {
  EventRequestInput,
  EventRequestPayload,
  EventValidationResult,
  NationalEventRequest,
} from "./types.js";

export function validateEventRequest(
  input: EventRequestInput | NationalEventRequest,
): EventValidationResult {
  const issues: ValidationIssue[] = [];
  const info = input.infPedReg;
  check(
    input.versao === undefined || input.versao === "1.01",
    "versao",
    "event.version",
    "must be 1.01",
    issues,
  );
  check(
    info.verAplic.length >= 1 && info.verAplic.length <= 20,
    "infPedReg.verAplic",
    "event.application-version",
    "must contain between 1 and 20 characters",
    issues,
  );
  check(
    isValidXsdDateTime(info.dhEvento),
    "infPedReg.dhEvento",
    "event.timestamp",
    "must be a real National NFS-e timestamp",
    issues,
  );
  check(
    /^\d{50}$/.test(info.chNFSe),
    "infPedReg.chNFSe",
    "event.access-key",
    "must contain exactly 50 digits",
    issues,
  );

  if ("CNPJAutor" in info.autor) {
    check(
      isValidCnpj(info.autor.CNPJAutor),
      "infPedReg.CNPJAutor",
      "event.author-cnpj",
      "must be a valid CNPJ",
      issues,
    );
  } else {
    check(
      isValidCpf(info.autor.CPFAutor),
      "infPedReg.CPFAutor",
      "event.author-cpf",
      "must be a valid CPF",
      issues,
    );
  }

  if (/^\d{50}$/.test(info.chNFSe)) {
    const expectedId = buildEventRequestId(info.chNFSe, info.evento.code);
    check(
      info.Id === undefined || info.Id === expectedId,
      "infPedReg.Id",
      "event.id",
      `must equal ${expectedId}`,
      issues,
    );
  }
  validatePayload(info.evento, issues);
  return { valid: issues.length === 0, issues };
}

export function assertValidEventRequest(input: EventRequestInput | NationalEventRequest): void {
  const result = validateEventRequest(input);
  if (!result.valid) {
    throw new EventValidationError(result.issues);
  }
}

function validatePayload(payload: EventRequestPayload, issues: ValidationIssue[]): void {
  switch (payload.code) {
    case "e101101":
    case "e101103":
      validateReason(payload.xMotivo, "infPedReg.evento.xMotivo", issues);
      return;
    case "e105102":
      if (payload.xMotivo !== undefined) {
        validateReason(payload.xMotivo, "infPedReg.evento.xMotivo", issues);
      }
      check(
        /^\d{50}$/.test(payload.chSubstituta),
        "infPedReg.evento.chSubstituta",
        "event.substitute-key",
        "must contain exactly 50 digits",
        issues,
      );
      return;
    case "e105104":
    case "e105105":
      validateAgent(payload.CPFAgTrib, issues);
      if (payload.nProcAdm !== undefined) {
        validateProcess(payload.nProcAdm, issues);
      }
      validateReason(payload.xMotivo, "infPedReg.evento.xMotivo", issues);
      return;
    case "e202205":
    case "e203206":
    case "e204207":
      if (payload.xMotivo !== undefined) {
        validateReason(payload.xMotivo, "infPedReg.evento.xMotivo", issues);
      }
      return;
    case "e205208":
      validateAgent(payload.CPFAgTrib, issues);
      check(
        /^\d{59}$/.test(payload.idEvManifRej),
        "infPedReg.evento.idEvManifRej",
        "event.reference-id",
        "must contain exactly 59 digits without the EVT prefix",
        issues,
      );
      validateReason(payload.xMotivo, "infPedReg.evento.xMotivo", issues);
      return;
    case "e305101":
      validateAgent(payload.CPFAgTrib, issues);
      validateProcess(payload.nProcAdm, issues);
      validateReason(payload.xProcAdm, "infPedReg.evento.xProcAdm", issues);
      return;
    case "e305102":
      validateAgent(payload.CPFAgTrib, issues);
      validateReason(payload.xMotivo, "infPedReg.evento.xMotivo", issues);
      return;
    case "e305103":
      validateAgent(payload.CPFAgTrib, issues);
      check(
        /^\d{59}$/.test(payload.idBloqOfic),
        "infPedReg.evento.idBloqOfic",
        "event.reference-id",
        "must contain exactly 59 digits without the EVT prefix",
        issues,
      );
      return;
    default:
      return;
  }
}

function validateAgent(value: string, issues: ValidationIssue[]): void {
  check(
    isValidCpf(value),
    "infPedReg.evento.CPFAgTrib",
    "event.agent-cpf",
    "must be a valid CPF",
    issues,
  );
}

function validateProcess(value: string, issues: ValidationIssue[]): void {
  check(
    /^\d{1,30}$/.test(value),
    "infPedReg.evento.nProcAdm",
    "event.process-number",
    "must contain between 1 and 30 digits",
    issues,
  );
}

function validateReason(value: string, path: string, issues: ValidationIssue[]): void {
  check(
    value.length >= 15 && value.length <= 255,
    path,
    "event.reason",
    "must contain between 15 and 255 characters",
    issues,
  );
}

function check(
  condition: boolean,
  path: string,
  code: string,
  message: string,
  issues: ValidationIssue[],
): void {
  if (!condition) {
    issues.push({ path, code, category: "schema", message });
  }
}
