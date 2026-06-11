import { XMLBuilder } from "fast-xml-parser";
import { createDps } from "./create.js";
import { assertValidDps } from "./semantic-validation.js";
import {
  type DpsDocument,
  type DpsInput,
  type ExtensionGroup,
  NATIONAL_NFSE_NAMESPACE,
  type SerializeDpsOptions,
} from "./types.js";

export function serializeDps(
  input: DpsDocument | DpsInput,
  options: SerializeDpsOptions = {},
): string {
  const dps = createDps(input);
  assertValidDps(dps);

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    format: options.pretty ?? false,
    suppressEmptyNode: true,
    processEntities: true,
  });

  const xml = builder.build({
    DPS: {
      "@_xmlns": NATIONAL_NFSE_NAMESPACE,
      "@_versao": dps.versao,
      infDPS: {
        "@_Id": dps.infDPS.Id,
        tpAmb: dps.infDPS.tpAmb,
        dhEmi: dps.infDPS.dhEmi,
        verAplic: dps.infDPS.verAplic,
        serie: dps.infDPS.serie,
        nDPS: dps.infDPS.nDPS,
        dCompet: dps.infDPS.dCompet,
        tpEmit: dps.infDPS.tpEmit,
        cMotivoEmisTI: dps.infDPS.cMotivoEmisTI,
        chNFSeRej: dps.infDPS.chNFSeRej,
        cLocEmi: dps.infDPS.cLocEmi,
        subst: dps.infDPS.subst,
        prest: dps.infDPS.prest,
        toma: dps.infDPS.toma,
        interm: dps.infDPS.interm,
        serv: {
          locPrest: dps.infDPS.serv.locPrest,
          cServ: dps.infDPS.serv.cServ,
          comExt: extension(dps.infDPS.serv.comExt),
          obra: extension(dps.infDPS.serv.obra),
          atvEvento: extension(dps.infDPS.serv.atvEvento),
          infoCompl: dps.infDPS.serv.infoCompl,
        },
        valores: {
          vServPrest: dps.infDPS.valores.vServPrest,
          vDescCondIncond: dps.infDPS.valores.vDescCondIncond,
          vDedRed: extension(dps.infDPS.valores.vDedRed),
          trib: dps.infDPS.valores.trib,
        },
        IBSCBS: extension(dps.infDPS.IBSCBS),
      },
    },
  });

  return options.declaration === false ? xml : `<?xml version="1.0" encoding="UTF-8"?>${xml}`;
}

function extension(group: ExtensionGroup | undefined): ExtensionGroup | undefined {
  return group;
}
