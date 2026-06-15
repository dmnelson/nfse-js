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
  cnpjValue,
  cpfValue,
  dateTimeValue,
  enumValue,
  facetValue,
  optionalEnumValue,
  optionalFacetValue,
  patternValue,
} from "./validation.js";
import {
  assertNationalNamespaceTree,
  assertNationalRoot,
  omitUndefined,
  optionalElement,
  optionalSignatureElement,
  optionalString,
  parseXmlRoot,
  requiredAttribute,
  requiredElement,
  requiredSignatureElement,
  requiredString,
} from "./xml.js";

const NFSE_GENERATORS = ["1", "2"] as const;
const NFSE_ISSUE_TYPES = ["1", "2"] as const;
const NFSE_ISSUE_PROCESSES = ["1", "2", "3"] as const;
const NFSE_STATUSES = ["100", "102", "103", "107"] as const;
const MUNICIPAL_BENEFIT_TYPES = ["1", "2", "3", "4"] as const;
export function parseNfseXml(xml: string, options: NfseParseOptions = {}): ParsedNfse {
  const root = parseXmlRoot(xml, options);
  if (root.name !== "NFSe") {
    throw new XmlParseError("unexpected-root", "$", `expected NFSe, found ${root.name}`);
  }
  assertNationalRoot(root.value, "NFSe");

  const info = requiredElement(root.value, "infNFSe", "NFSe");
  const signature = requiredSignatureElement(root.value, "NFSe");
  const embeddedDps = requiredElement(info, "DPS", "NFSe.infNFSe");

  return omitUndefined<ParsedNfse>({
    kind: "NFSe",
    document: {
      versao: NATIONAL_NFSE_VERSION,
      infNFSe: {
        Id: patternValue(
          requiredAttribute(info, "Id", "NFSe.infNFSe"),
          /^NFS\d{50}$/,
          "NFSe.infNFSe.@_Id",
          "expected an NFS identifier followed by 50 digits",
        ),
        xLocEmi: requiredString(info, "xLocEmi", "NFSe.infNFSe"),
        xLocPrestacao: requiredString(info, "xLocPrestacao", "NFSe.infNFSe"),
        nNFSe: patternValue(
          requiredString(info, "nNFSe", "NFSe.infNFSe"),
          /^[1-9]\d{0,12}$/,
          "NFSe.infNFSe.nNFSe",
          "expected a positive number containing at most 13 digits",
        ),
        cLocIncid: optionalFacetValue(
          optionalString(info, "cLocIncid", "NFSe.infNFSe"),
          "TSCodMunIBGE",
          "NFSe.infNFSe.cLocIncid",
        ),
        xLocIncid: optionalString(info, "xLocIncid", "NFSe.infNFSe"),
        xTribNac: requiredString(info, "xTribNac", "NFSe.infNFSe"),
        xTribMun: optionalString(info, "xTribMun", "NFSe.infNFSe"),
        xNBS: optionalString(info, "xNBS", "NFSe.infNFSe"),
        verAplic: patternValue(
          requiredString(info, "verAplic", "NFSe.infNFSe"),
          /^.{1,20}$/s,
          "NFSe.infNFSe.verAplic",
          "expected between 1 and 20 characters",
        ),
        ambGer: enumValue(
          requiredString(info, "ambGer", "NFSe.infNFSe"),
          NFSE_GENERATORS,
          "NFSe.infNFSe.ambGer",
        ),
        tpEmis: enumValue(
          requiredString(info, "tpEmis", "NFSe.infNFSe"),
          NFSE_ISSUE_TYPES,
          "NFSe.infNFSe.tpEmis",
        ),
        procEmi: optionalEnumValue(
          optionalString(info, "procEmi", "NFSe.infNFSe"),
          NFSE_ISSUE_PROCESSES,
          "NFSe.infNFSe.procEmi",
        ),
        cStat: enumValue(
          requiredString(info, "cStat", "NFSe.infNFSe"),
          NFSE_STATUSES,
          "NFSe.infNFSe.cStat",
        ),
        dhProc: dateTimeValue(
          requiredString(info, "dhProc", "NFSe.infNFSe"),
          "NFSe.infNFSe.dhProc",
        ),
        nDFSe: patternValue(
          requiredString(info, "nDFSe", "NFSe.infNFSe"),
          /^[1-9]\d{0,12}$/,
          "NFSe.infNFSe.nDFSe",
          "expected a positive number containing at most 13 digits",
        ),
        emit: parseIssuer(requiredElement(info, "emit", "NFSe.infNFSe")),
        valores: parseValues(requiredElement(info, "valores", "NFSe.infNFSe")),
        xOutInf: optionalString(info, "xOutInf", "NFSe.infNFSe"),
        IBSCBS: parseOptionalNationalSubtree(info, "IBSCBS", "NFSe.infNFSe"),
        DPS: parseDpsElement(
          embeddedDps,
          options.validate === undefined ? {} : { validate: options.validate },
        ),
        dpsSignature: optionalSignatureElement(embeddedDps, "NFSe.infNFSe.DPS"),
      },
    },
    originalXml: xml,
    raw: root.value,
    signature,
  });
}

function parseOptionalNationalSubtree(
  parent: XmlElement,
  name: string,
  path: string,
): XmlElement | undefined {
  const value = optionalElement(parent, name, path);
  if (value) {
    assertNationalNamespaceTree(value, `${path}.${name}`);
  }
  return value;
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
    ? omitUndefined<NfseIssuer>({ CNPJ: cnpjValue(cnpj, `${path}.CNPJ`), ...common })
    : omitUndefined<NfseIssuer>({ CPF: cpfValue(cpf as string, `${path}.CPF`), ...common });
}

function parseIssuerAddress(value: XmlElement): NfseIssuerAddress {
  const path = "NFSe.infNFSe.emit.enderNac";
  const federalUnit = requiredString(value, "UF", path);
  return omitUndefined<NfseIssuerAddress>({
    xLgr: requiredString(value, "xLgr", path),
    nro: requiredString(value, "nro", path),
    xCpl: optionalString(value, "xCpl", path),
    xBairro: requiredString(value, "xBairro", path),
    cMun: facetValue(requiredString(value, "cMun", path), "TSCodMunIBGE", `${path}.cMun`),
    UF: patternValue(
      federalUnit,
      /^(?:AC|AL|AM|AP|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO)$/,
      `${path}.UF`,
      `expected a Brazilian federal unit, found ${federalUnit}`,
    ),
    CEP: facetValue(requiredString(value, "CEP", path), "TSCEP", `${path}.CEP`),
  });
}

function parseValues(value: XmlElement): NfseValues {
  const path = "NFSe.infNFSe.valores";
  return omitUndefined<NfseValues>({
    vCalcDR: optionalFacetValue(
      optionalString(value, "vCalcDR", path),
      "TSDec15V2",
      `${path}.vCalcDR`,
    ) as Decimal15V2 | undefined,
    tpBM: optionalEnumValue(
      optionalString(value, "tpBM", path),
      MUNICIPAL_BENEFIT_TYPES,
      `${path}.tpBM`,
    ),
    vCalcBM: optionalFacetValue(
      optionalString(value, "vCalcBM", path),
      "TSDec15V2",
      `${path}.vCalcBM`,
    ) as Decimal15V2 | undefined,
    vBC: optionalFacetValue(optionalString(value, "vBC", path), "TSDec15V2", `${path}.vBC`) as
      | Decimal15V2
      | undefined,
    pAliqAplic: optionalFacetValue(
      optionalString(value, "pAliqAplic", path),
      "TSDec1V2",
      `${path}.pAliqAplic`,
    ) as Decimal1V2 | undefined,
    vISSQN: optionalFacetValue(
      optionalString(value, "vISSQN", path),
      "TSDec15V2",
      `${path}.vISSQN`,
    ) as Decimal15V2 | undefined,
    vTotalRet: optionalFacetValue(
      optionalString(value, "vTotalRet", path),
      "TSDec15V2",
      `${path}.vTotalRet`,
    ) as Decimal15V2 | undefined,
    vLiq: facetValue(
      requiredString(value, "vLiq", path),
      "TSDec15V2",
      `${path}.vLiq`,
    ) as Decimal15V2,
  });
}
