import type { NationalEventCode } from "./types.js";

const ACCESS_KEY = /^\d{50}$/;
const REQUEST_ID = /^PRE\d{56}$/;
const SEQUENCE = /^\d{3}$/;

export function buildEventRequestId(accessKey: string, eventCode: NationalEventCode): string {
  if (!ACCESS_KEY.test(accessKey)) {
    throw new TypeError("accessKey must contain exactly 50 digits");
  }
  return `PRE${accessKey}${eventCode.slice(1)}`;
}

export function buildRegisteredEventId(eventRequestId: string, sequence: string | number): string {
  if (!REQUEST_ID.test(eventRequestId)) {
    throw new TypeError("eventRequestId must match PRE followed by 56 digits");
  }
  const normalizedSequence =
    typeof sequence === "number" ? String(sequence).padStart(3, "0") : sequence;
  if (!SEQUENCE.test(normalizedSequence)) {
    throw new TypeError("sequence must contain exactly three digits");
  }
  return `EVT${eventRequestId.slice(3)}${normalizedSequence}`;
}
