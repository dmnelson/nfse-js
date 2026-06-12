import { type Decimal1V2, type Decimal15V2, NATIONAL_NFSE_VERSION } from "../core/types.js";
import { XmlParseError } from "../errors.js";
import { parseDpsElement } from "./dps.js";
import type {
  NfseIssuer,
  NfseIssuerAddress,
  NfseParseOptions,
  NfseValues,
  ParsedNfse,
  XmlElement,
} from "./types.js";
import {
  assertNationalRoot,
  omitUndefined,
  optionalElement,
  optionalString,
  parseXmlRoot,
  requiredAttribute,
  requiredElement,
  requiredString,
} from "./xml.js";

export function parseNfseXml(xml: string, options: NfseParseOptions = {}): ParsedNfse {
  const root = parseXmlRoot(xml, options);
  if (root.name !== "NFSe") {
    throw new XmlParseError("unexpected-root", "$", `expected NFSe, found ${root.name}`);
  }
  assertNationalRoot(root.value, "NFSe");

  const info = requiredElement(root.value, "infNFSe", "NFSe");
  const signature = requiredElement(root.value, "Signature", "NFSe");
  const embeddedDps = requiredElement(info, "DPS", "NFSe.infNFSe");

  return omitUndefined<ParsedNfse>({
    kind: "NFSe",
    document: {
      versao: NATIONAL_NFSE_VERSION,
      infNFSe: {
        Id: requiredAttribute(info, "Id", "NFSe.infNFSe"),
        xLocEmi: requiredString(info, "xLocEmi", "NFSe.infNFSe"),
        xLocPrestacao: requiredString(info, "xLocPrestacao", "NFSe.infNFSe"),
        nNFSe: requiredString(info, "nNFSe", "NFSe.infNFSe"),
        cLocIncid: optionalString(info, "cLocIncid", "NFSe.infNFSe"),
        xLocIncid: optionalString(info, "xLocIncid", "NFSe.infNFSe"),
        xTribNac: requiredString(info, "xTribNac", "NFSe.infNFSe"),
        xTribMun: optionalString(info, "xTribMun", "NFSe.infNFSe"),
        xNBS: optionalString(info, "xNBS", "NFSe.infNFSe"),
        verAplic: requiredString(info, "verAplic", "NFSe.infNFSe"),
        ambGer: requiredString(info, "ambGer", "NFSe.infNFSe") as "1" | "2",
        tpEmis: requiredString(info, "tpEmis", "NFSe.infNFSe") as "1" | "2",
        procEmi: optionalString(info, "procEmi", "NFSe.infNFSe") as "1" | "2" | "3" | undefined,
        cStat: requiredString(info, "cStat", "NFSe.infNFSe") as "100" | "102" | "103" | "107",
        dhProc: requiredString(info, "dhProc", "NFSe.infNFSe"),
        nDFSe: requiredString(info, "nDFSe", "NFSe.infNFSe"),
        emit: parseIssuer(requiredElement(info, "emit", "NFSe.infNFSe")),
        valores: parseValues(requiredElement(info, "valores", "NFSe.infNFSe")),
        xOutInf: optionalString(info, "xOutInf", "NFSe.infNFSe"),
        IBSCBS: optionalElement(info, "IBSCBS", "NFSe.infNFSe"),
        DPS: parseDpsElement(
          embeddedDps,
          options.validate === undefined ? {} : { validate: options.validate },
        ),
        dpsSignature: optionalElement(embeddedDps, "Signature", "NFSe.infNFSe.DPS"),
      },
    },
    originalXml: xml,
    raw: root.value,
    signature,
  });
}

function parseIssuer(value: XmlElement): NfseIssuer {
  const path = "NFSe.infNFSe.emit";
  const cnpj = optionalString(value, "CNPJ", path);
  const cpf = optionalString(value, "CPF", path);
  if ((cnpj ? 1 : 0) + (cpf ? 1 : 0) !== 1) {
    throw new XmlParseError("invalid-value", path, "expected one issuer identity");
  }

  const common = {
    IM: optionalString(value, "IM", path),
    xNome: requiredString(value, "xNome", path),
    xFant: optionalString(value, "xFant", path),
    enderNac: parseIssuerAddress(requiredElement(value, "enderNac", path)),
    fone: optionalString(value, "fone", path),
    email: optionalString(value, "email", path),
  };
  return cnpj
    ? omitUndefined<NfseIssuer>({ CNPJ: cnpj, ...common })
    : omitUndefined<NfseIssuer>({ CPF: cpf, ...common });
}

function parseIssuerAddress(value: XmlElement): NfseIssuerAddress {
  const path = "NFSe.infNFSe.emit.enderNac";
  return omitUndefined<NfseIssuerAddress>({
    xLgr: requiredString(value, "xLgr", path),
    nro: requiredString(value, "nro", path),
    xCpl: optionalString(value, "xCpl", path),
    xBairro: requiredString(value, "xBairro", path),
    cMun: requiredString(value, "cMun", path),
    UF: requiredString(value, "UF", path),
    CEP: requiredString(value, "CEP", path),
  });
}

function parseValues(value: XmlElement): NfseValues {
  const path = "NFSe.infNFSe.valores";
  return omitUndefined<NfseValues>({
    vCalcDR: optionalString(value, "vCalcDR", path) as Decimal15V2 | undefined,
    tpBM: optionalString(value, "tpBM", path) as NfseValues["tpBM"],
    vCalcBM: optionalString(value, "vCalcBM", path) as Decimal15V2 | undefined,
    vBC: optionalString(value, "vBC", path) as Decimal15V2 | undefined,
    pAliqAplic: optionalString(value, "pAliqAplic", path) as Decimal1V2 | undefined,
    vISSQN: optionalString(value, "vISSQN", path) as Decimal15V2 | undefined,
    vTotalRet: optionalString(value, "vTotalRet", path) as Decimal15V2 | undefined,
    vLiq: requiredString(value, "vLiq", path) as Decimal15V2,
  });
}
