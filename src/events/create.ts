import { NATIONAL_NFSE_VERSION } from "../core/types.js";
import { buildEventRequestId } from "./ids.js";
import type { EventRequestInput, NationalEventRequest } from "./types.js";
import { assertValidEventRequest } from "./validation.js";

export function createEventRequest(input: EventRequestInput): NationalEventRequest {
  assertValidEventRequest(input);
  const expectedId = buildEventRequestId(input.infPedReg.chNFSe, input.infPedReg.evento.code);
  return {
    versao: NATIONAL_NFSE_VERSION,
    infPedReg: {
      ...input.infPedReg,
      Id: input.infPedReg.Id ?? expectedId,
    },
  };
}
