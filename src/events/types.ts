import type { Environment } from "../core/types.js";
import type { ValidationIssue } from "../errors.js";

export const NATIONAL_EVENT_CODES = [
  "e101101",
  "e105102",
  "e101103",
  "e105104",
  "e105105",
  "e202201",
  "e203202",
  "e204203",
  "e205204",
  "e202205",
  "e203206",
  "e204207",
  "e205208",
  "e305101",
  "e305102",
  "e305103",
] as const;

export type NationalEventCode = (typeof NATIONAL_EVENT_CODES)[number];
export type CancellationReason = "1" | "2" | "9";
export type SubstitutionReason = "01" | "02" | "03" | "04" | "05" | "99";
export type RejectionReason = "1" | "2" | "3" | "4" | "5" | "9";
export type BlockableEventCode = "e101101" | "e105102" | "e105104" | "e105105" | "e305101";

export type EventRequestAuthor =
  | { readonly CNPJAutor: string; readonly CPFAutor?: never }
  | { readonly CPFAutor: string; readonly CNPJAutor?: never };

export type EventRequestPayload =
  | {
      readonly code: "e101101";
      readonly cMotivo: CancellationReason;
      readonly xMotivo: string;
    }
  | {
      readonly code: "e105102";
      readonly cMotivo: SubstitutionReason;
      readonly xMotivo?: string;
      readonly chSubstituta: string;
    }
  | {
      readonly code: "e101103";
      readonly cMotivo: CancellationReason;
      readonly xMotivo: string;
    }
  | {
      readonly code: "e105104";
      readonly CPFAgTrib: string;
      readonly nProcAdm?: string;
      readonly cMotivo: "1";
      readonly xMotivo: string;
    }
  | {
      readonly code: "e105105";
      readonly CPFAgTrib: string;
      readonly nProcAdm?: string;
      readonly cMotivo: "1" | "2";
      readonly xMotivo: string;
    }
  | { readonly code: "e202201" }
  | { readonly code: "e203202" }
  | { readonly code: "e204203" }
  | { readonly code: "e205204" }
  | {
      readonly code: "e202205";
      readonly cMotivo: RejectionReason;
      readonly xMotivo?: string;
    }
  | {
      readonly code: "e203206";
      readonly cMotivo: RejectionReason;
      readonly xMotivo?: string;
    }
  | {
      readonly code: "e204207";
      readonly cMotivo: RejectionReason;
      readonly xMotivo?: string;
    }
  | {
      readonly code: "e205208";
      readonly CPFAgTrib: string;
      readonly idEvManifRej: string;
      readonly xMotivo: string;
    }
  | {
      readonly code: "e305101";
      readonly CPFAgTrib: string;
      readonly nProcAdm: string;
      readonly xProcAdm: string;
    }
  | {
      readonly code: "e305102";
      readonly CPFAgTrib: string;
      readonly codEvento: BlockableEventCode;
      readonly xMotivo: string;
    }
  | {
      readonly code: "e305103";
      readonly CPFAgTrib: string;
      readonly idBloqOfic: string;
    };

export interface EventRequestInfoInput {
  readonly Id?: string;
  readonly tpAmb: Environment;
  readonly verAplic: string;
  readonly dhEvento: string;
  readonly autor: EventRequestAuthor;
  readonly chNFSe: string;
  readonly evento: EventRequestPayload;
}

export interface EventRequestInput {
  readonly versao?: "1.01";
  readonly infPedReg: EventRequestInfoInput;
}

export interface NationalEventRequest {
  readonly versao: "1.01";
  readonly infPedReg: Omit<EventRequestInfoInput, "Id"> & { readonly Id: string };
}

export interface SerializeEventRequestOptions {
  readonly pretty?: boolean;
  readonly declaration?: boolean;
}

export interface EventValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}
