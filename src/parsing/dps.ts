import { assertValidDps } from "../core/semantic-validation.js";
import {
  type Address,
  type Construction,
  type DeductionDocument,
  type DeductionReduction,
  type DpsDocument,
  type DpsInfo,
  type EventActivity,
  type FederalTax,
  type FederalTaxId,
  type ForeignTrade,
  type IbsCbs,
  type IbsCbsDestination,
  type IbsCbsProperty,
  type IbsCbsSupplier,
  type MunicipalBenefit,
  type MunicipalTax,
  NATIONAL_NFSE_VERSION,
  type Person,
  type PisCofins,
  type Provider,
  type ReimbursementDocument,
  type Service,
  type SimpleAddress,
  type Taxes,
  type TotalTax,
  type Values,
} from "../core/types.js";
import { XmlParseError } from "../errors.js";
import type { DpsParseOptions, ParsedDps, XmlElement } from "./types.js";
import {
  assertNationalRoot,
  element,
  omitUndefined,
  optionalElement,
  optionalString,
  parseXmlRoot,
  requiredAttribute,
  requiredElement,
  requiredString,
  values,
} from "./xml.js";

export function parseDpsXml(xml: string, options: DpsParseOptions = {}): ParsedDps {
  const root = parseXmlRoot(xml, options);
  if (root.name !== "DPS") {
    throw new XmlParseError("unexpected-root", "$", `expected DPS, found ${root.name}`);
  }
  const document = parseDpsElement(root.value, options);

  return omitUndefined<ParsedDps>({
    kind: "DPS",
    document,
    originalXml: xml,
    raw: root.value,
    signature: optionalElement(root.value, "Signature", "DPS"),
  });
}

export function parseDpsElement(
  root: XmlElement,
  options: Pick<DpsParseOptions, "validate"> = {},
): DpsDocument {
  assertNationalRoot(root, "DPS");
  const document: DpsDocument = {
    versao: NATIONAL_NFSE_VERSION,
    infDPS: parseDpsInfo(requiredElement(root, "infDPS", "DPS")),
  };

  if (options.validate !== false) {
    assertValidDps(document);
  }
  return document;
}

function parseDpsInfo(info: XmlElement): DpsInfo {
  return omitUndefined<DpsInfo>({
    Id: requiredAttribute(info, "Id", "DPS.infDPS"),
    tpAmb: requiredString(info, "tpAmb", "DPS.infDPS") as DpsInfo["tpAmb"],
    dhEmi: requiredString(info, "dhEmi", "DPS.infDPS"),
    verAplic: requiredString(info, "verAplic", "DPS.infDPS"),
    serie: requiredString(info, "serie", "DPS.infDPS"),
    nDPS: requiredString(info, "nDPS", "DPS.infDPS"),
    dCompet: requiredString(info, "dCompet", "DPS.infDPS"),
    tpEmit: requiredString(info, "tpEmit", "DPS.infDPS") as DpsInfo["tpEmit"],
    cMotivoEmisTI: optionalString(info, "cMotivoEmisTI", "DPS.infDPS") as DpsInfo["cMotivoEmisTI"],
    chNFSeRej: optionalString(info, "chNFSeRej", "DPS.infDPS"),
    cLocEmi: requiredString(info, "cLocEmi", "DPS.infDPS"),
    subst: parseOptionalSubstitution(info),
    prest: parseProvider(requiredElement(info, "prest", "DPS.infDPS")),
    toma: parseOptionalPerson(info, "toma"),
    interm: parseOptionalPerson(info, "interm"),
    serv: parseService(requiredElement(info, "serv", "DPS.infDPS")),
    valores: parseValues(requiredElement(info, "valores", "DPS.infDPS")),
    IBSCBS: parseOptionalIbsCbs(info),
  });
}

function parseOptionalSubstitution(info: XmlElement): DpsInfo["subst"] {
  const substitution = optionalElement(info, "subst", "DPS.infDPS");
  return substitution
    ? omitUndefined<NonNullable<DpsInfo["subst"]>>({
        chSubstda: requiredString(substitution, "chSubstda", "DPS.infDPS.subst"),
        cMotivo: requiredString(substitution, "cMotivo", "DPS.infDPS.subst") as NonNullable<
          DpsInfo["subst"]
        >["cMotivo"],
        xMotivo: optionalString(substitution, "xMotivo", "DPS.infDPS.subst"),
      })
    : undefined;
}

function parseProvider(provider: XmlElement): Provider {
  return omitUndefined<Provider>({
    ...parseFederalTaxId(provider, "DPS.infDPS.prest"),
    CAEPF: optionalString(provider, "CAEPF", "DPS.infDPS.prest"),
    IM: optionalString(provider, "IM", "DPS.infDPS.prest"),
    xNome: optionalString(provider, "xNome", "DPS.infDPS.prest"),
    end: parseOptionalAddress(provider, "DPS.infDPS.prest"),
    fone: optionalString(provider, "fone", "DPS.infDPS.prest"),
    email: optionalString(provider, "email", "DPS.infDPS.prest"),
    regTrib: parseTaxRegime(requiredElement(provider, "regTrib", "DPS.infDPS.prest")),
  });
}

function parseTaxRegime(regime: XmlElement): Provider["regTrib"] {
  return omitUndefined<Provider["regTrib"]>({
    opSimpNac: requiredString(
      regime,
      "opSimpNac",
      "DPS.infDPS.prest.regTrib",
    ) as Provider["regTrib"]["opSimpNac"],
    regApTribSN: optionalString(
      regime,
      "regApTribSN",
      "DPS.infDPS.prest.regTrib",
    ) as Provider["regTrib"]["regApTribSN"],
    regEspTrib: requiredString(
      regime,
      "regEspTrib",
      "DPS.infDPS.prest.regTrib",
    ) as Provider["regTrib"]["regEspTrib"],
  });
}

function parseOptionalPerson(info: XmlElement, name: "toma" | "interm"): Person | undefined {
  const person = optionalElement(info, name, "DPS.infDPS");
  return person ? parsePerson(person, `DPS.infDPS.${name}`) : undefined;
}

function parsePerson(person: XmlElement, path: string): Person {
  return omitUndefined<Person>({
    ...parseFederalTaxId(person, path),
    CAEPF: optionalString(person, "CAEPF", path),
    IM: optionalString(person, "IM", path),
    xNome: requiredString(person, "xNome", path),
    end: parseOptionalAddress(person, path),
    fone: optionalString(person, "fone", path),
    email: optionalString(person, "email", path),
  });
}

function parseFederalTaxId(subject: XmlElement, path: string): FederalTaxId {
  const identities = [
    ["CNPJ", optionalString(subject, "CNPJ", path)],
    ["CPF", optionalString(subject, "CPF", path)],
    ["NIF", optionalString(subject, "NIF", path)],
    ["cNaoNIF", optionalString(subject, "cNaoNIF", path)],
  ] as const;
  const present = identities.filter((entry) => entry[1] !== undefined);
  if (present.length !== 1) {
    throw new XmlParseError(
      "invalid-value",
      path,
      `expected one federal identity, found ${present.length}`,
    );
  }

  const [name, value] = present[0] as (typeof present)[number];
  if (value === undefined) {
    throw new XmlParseError("missing-value", path, "federal identity is missing");
  }
  if (name === "CNPJ") {
    return { CNPJ: value };
  }
  if (name === "CPF") {
    return { CPF: value };
  }
  if (name === "NIF") {
    return { NIF: value };
  }
  return { cNaoNIF: value as "0" | "1" | "2" };
}

function parseOptionalAddress(parent: XmlElement, path: string): Address | undefined {
  const address = optionalElement(parent, "end", path);
  return address ? parseAddress(address, `${path}.end`) : undefined;
}

function parseAddress(address: XmlElement, path: string): Address {
  const common = {
    xLgr: requiredString(address, "xLgr", path),
    nro: requiredString(address, "nro", path),
    xCpl: optionalString(address, "xCpl", path),
    xBairro: requiredString(address, "xBairro", path),
  };
  const domestic = optionalElement(address, "endNac", path);
  const foreign = optionalElement(address, "endExt", path);
  if ((domestic ? 1 : 0) + (foreign ? 1 : 0) !== 1) {
    throw new XmlParseError("invalid-value", path, "expected one address location");
  }
  if (domestic) {
    return omitUndefined<Address>({
      endNac: {
        cMun: requiredString(domestic, "cMun", `${path}.endNac`),
        CEP: requiredString(domestic, "CEP", `${path}.endNac`),
      },
      ...common,
    });
  }
  const location = foreign as XmlElement;
  return omitUndefined<Address>({
    endExt: {
      cPais: requiredString(location, "cPais", `${path}.endExt`),
      cEndPost: requiredString(location, "cEndPost", `${path}.endExt`),
      xCidade: requiredString(location, "xCidade", `${path}.endExt`),
      xEstProvReg: requiredString(location, "xEstProvReg", `${path}.endExt`),
    },
    ...common,
  });
}

function parseSimpleAddress(address: XmlElement, path: string): SimpleAddress {
  const common = {
    xLgr: requiredString(address, "xLgr", path),
    nro: requiredString(address, "nro", path),
    xCpl: optionalString(address, "xCpl", path),
    xBairro: requiredString(address, "xBairro", path),
  };
  const postalCode = optionalString(address, "CEP", path);
  const foreign = optionalElement(address, "endExt", path);
  if ((postalCode ? 1 : 0) + (foreign ? 1 : 0) !== 1) {
    throw new XmlParseError("invalid-value", path, "expected one simple address location");
  }
  if (postalCode) {
    return omitUndefined<SimpleAddress>({ CEP: postalCode, ...common });
  }
  const location = foreign as XmlElement;
  return omitUndefined<SimpleAddress>({
    endExt: {
      cEndPost: requiredString(location, "cEndPost", `${path}.endExt`),
      xCidade: requiredString(location, "xCidade", `${path}.endExt`),
      xEstProvReg: requiredString(location, "xEstProvReg", `${path}.endExt`),
    },
    ...common,
  });
}

function parseService(service: XmlElement): Service {
  const path = "DPS.infDPS.serv";
  const location = requiredElement(service, "locPrest", path);
  const domesticLocation = optionalString(location, "cLocPrestacao", `${path}.locPrest`);
  const foreignLocation = optionalString(location, "cPaisPrestacao", `${path}.locPrest`);
  if ((domesticLocation ? 1 : 0) + (foreignLocation ? 1 : 0) !== 1) {
    throw new XmlParseError("invalid-value", `${path}.locPrest`, "expected one service location");
  }
  const code = requiredElement(service, "cServ", path);

  return omitUndefined<Service>({
    locPrest: domesticLocation
      ? { cLocPrestacao: domesticLocation }
      : { cPaisPrestacao: foreignLocation as string },
    cServ: {
      cTribNac: requiredString(code, "cTribNac", `${path}.cServ`),
      cTribMun: optionalString(code, "cTribMun", `${path}.cServ`),
      xDescServ: requiredString(code, "xDescServ", `${path}.cServ`),
      cNBS: optionalString(code, "cNBS", `${path}.cServ`),
      cIntContrib: optionalString(code, "cIntContrib", `${path}.cServ`),
    },
    comExt: parseOptionalForeignTrade(service),
    obra: parseOptionalConstruction(service),
    atvEvento: parseOptionalEventActivity(service),
    infoCompl: parseOptionalComplementaryInformation(service),
  });
}

function parseOptionalForeignTrade(service: XmlElement): ForeignTrade | undefined {
  const value = optionalElement(service, "comExt", "DPS.infDPS.serv");
  const path = "DPS.infDPS.serv.comExt";
  return value
    ? omitUndefined<ForeignTrade>({
        mdPrestacao: requiredString(value, "mdPrestacao", path) as ForeignTrade["mdPrestacao"],
        vincPrest: requiredString(value, "vincPrest", path) as ForeignTrade["vincPrest"],
        tpMoeda: requiredString(value, "tpMoeda", path),
        vServMoeda: requiredString(value, "vServMoeda", path) as ForeignTrade["vServMoeda"],
        mecAFComexP: requiredString(value, "mecAFComexP", path) as ForeignTrade["mecAFComexP"],
        mecAFComexT: requiredString(value, "mecAFComexT", path) as ForeignTrade["mecAFComexT"],
        movTempBens: requiredString(value, "movTempBens", path) as ForeignTrade["movTempBens"],
        nDI: optionalString(value, "nDI", path),
        nRE: optionalString(value, "nRE", path),
        mdic: requiredString(value, "mdic", path) as ForeignTrade["mdic"],
      })
    : undefined;
}

function parseOptionalConstruction(service: XmlElement): Construction | undefined {
  const value = optionalElement(service, "obra", "DPS.infDPS.serv");
  if (!value) {
    return undefined;
  }
  const path = "DPS.infDPS.serv.obra";
  const common = { inscImobFisc: optionalString(value, "inscImobFisc", path) };
  const work = optionalString(value, "cObra", path);
  const cib = optionalString(value, "cCIB", path);
  const address = optionalElement(value, "end", path);
  if ((work ? 1 : 0) + (cib ? 1 : 0) + (address ? 1 : 0) !== 1) {
    throw new XmlParseError("invalid-value", path, "expected one construction location");
  }
  if (work) {
    return omitUndefined<Construction>({ ...common, cObra: work });
  }
  if (cib) {
    return omitUndefined<Construction>({ ...common, cCIB: cib });
  }
  return omitUndefined<Construction>({
    ...common,
    end: parseSimpleAddress(address as XmlElement, `${path}.end`),
  });
}

function parseOptionalEventActivity(service: XmlElement): EventActivity | undefined {
  const value = optionalElement(service, "atvEvento", "DPS.infDPS.serv");
  if (!value) {
    return undefined;
  }
  const path = "DPS.infDPS.serv.atvEvento";
  const common = {
    xNome: requiredString(value, "xNome", path),
    dtIni: requiredString(value, "dtIni", path),
    dtFim: requiredString(value, "dtFim", path),
  };
  const id = optionalString(value, "idAtvEvt", path);
  const address = optionalElement(value, "end", path);
  if ((id ? 1 : 0) + (address ? 1 : 0) !== 1) {
    throw new XmlParseError("invalid-value", path, "expected an event ID or address");
  }
  return id
    ? { ...common, idAtvEvt: id }
    : { ...common, end: parseSimpleAddress(address as XmlElement, `${path}.end`) };
}

function parseOptionalComplementaryInformation(service: XmlElement): Service["infoCompl"] {
  const value = optionalElement(service, "infoCompl", "DPS.infDPS.serv");
  if (!value) {
    return undefined;
  }
  const path = "DPS.infDPS.serv.infoCompl";
  const items = optionalElement(value, "gItemPed", path);
  return omitUndefined<NonNullable<Service["infoCompl"]>>({
    idDocTec: optionalString(value, "idDocTec", path),
    docRef: optionalString(value, "docRef", path),
    xPed: optionalString(value, "xPed", path),
    gItemPed: items
      ? {
          xItemPed: values(items.xItemPed).map((item, index) =>
            text(item, `${path}.gItemPed.xItemPed[${index}]`),
          ),
        }
      : undefined,
    xInfComp: optionalString(value, "xInfComp", path),
  });
}

function parseValues(value: XmlElement): Values {
  const path = "DPS.infDPS.valores";
  const service = requiredElement(value, "vServPrest", path);
  const discounts = optionalElement(value, "vDescCondIncond", path);
  const deduction = optionalElement(value, "vDedRed", path);
  return omitUndefined<Values>({
    vServPrest: {
      vReceb: optionalString(
        service,
        "vReceb",
        `${path}.vServPrest`,
      ) as Values["vServPrest"]["vReceb"],
      vServ: requiredString(
        service,
        "vServ",
        `${path}.vServPrest`,
      ) as Values["vServPrest"]["vServ"],
    },
    vDescCondIncond: discounts
      ? {
          vDescIncond: optionalString(
            discounts,
            "vDescIncond",
            `${path}.vDescCondIncond`,
          ) as NonNullable<Values["vDescCondIncond"]>["vDescIncond"],
          vDescCond: optionalString(
            discounts,
            "vDescCond",
            `${path}.vDescCondIncond`,
          ) as NonNullable<Values["vDescCondIncond"]>["vDescCond"],
        }
      : undefined,
    vDedRed: deduction ? parseDeductionReduction(deduction) : undefined,
    trib: parseTaxes(requiredElement(value, "trib", path)),
  });
}

function parseDeductionReduction(value: XmlElement): DeductionReduction {
  const path = "DPS.infDPS.valores.vDedRed";
  const percentage = optionalString(value, "pDR", path);
  const amount = optionalString(value, "vDR", path);
  const documents = optionalElement(value, "documentos", path);
  if ((percentage ? 1 : 0) + (amount ? 1 : 0) + (documents ? 1 : 0) !== 1) {
    throw new XmlParseError("invalid-value", path, "expected one deduction method");
  }
  if (percentage) {
    return { pDR: percentage as Extract<DeductionReduction, { pDR: unknown }>["pDR"] };
  }
  if (amount) {
    return { vDR: amount as Extract<DeductionReduction, { vDR: unknown }>["vDR"] };
  }
  return {
    documentos: {
      docDedRed: values((documents as XmlElement).docDedRed).map((document, index) =>
        parseDeductionDocument(element(document, `${path}.documentos.docDedRed[${index}]`), index),
      ),
    },
  };
}

function parseDeductionDocument(value: XmlElement, index: number): DeductionDocument {
  const path = `DPS.infDPS.valores.vDedRed.documentos.docDedRed[${index}]`;
  const reference = parseDeductionReference(value, path);
  const supplier = optionalElement(value, "fornec", path);
  return {
    ...reference,
    tpDedRed: requiredString(value, "tpDedRed", path) as DeductionDocument["tpDedRed"],
    xDescOutDed: optionalString(value, "xDescOutDed", path),
    dtEmiDoc: requiredString(value, "dtEmiDoc", path),
    vDedutivelRedutivel: requiredString(
      value,
      "vDedutivelRedutivel",
      path,
    ) as DeductionDocument["vDedutivelRedutivel"],
    vDeducaoReducao: requiredString(
      value,
      "vDeducaoReducao",
      path,
    ) as DeductionDocument["vDeducaoReducao"],
    fornec: supplier ? parsePerson(supplier, `${path}.fornec`) : undefined,
  } as DeductionDocument;
}

function parseDeductionReference(value: XmlElement, path: string) {
  const references = [
    ["chNFSe", optionalString(value, "chNFSe", path)],
    ["chNFe", optionalString(value, "chNFe", path)],
    ["NFSeMun", optionalElement(value, "NFSeMun", path)],
    ["NFNFS", optionalElement(value, "NFNFS", path)],
    ["nDocFisc", optionalString(value, "nDocFisc", path)],
    ["nDoc", optionalString(value, "nDoc", path)],
  ] as const;
  const present = references.filter((entry) => entry[1] !== undefined);
  if (present.length !== 1) {
    throw new XmlParseError("invalid-value", path, "expected one deduction reference");
  }
  const [name, reference] = present[0] as (typeof present)[number];
  if (name === "chNFSe") {
    return { chNFSe: reference as string };
  }
  if (name === "chNFe") {
    return { chNFe: reference as string };
  }
  if (name === "NFSeMun") {
    const document = reference as XmlElement;
    return {
      NFSeMun: {
        cMunNFSeMun: requiredString(document, "cMunNFSeMun", `${path}.NFSeMun`),
        nNFSeMun: requiredString(document, "nNFSeMun", `${path}.NFSeMun`),
        cVerifNFSeMun: requiredString(document, "cVerifNFSeMun", `${path}.NFSeMun`),
      },
    };
  }
  if (name === "NFNFS") {
    const document = reference as XmlElement;
    return {
      NFNFS: {
        nNFS: requiredString(document, "nNFS", `${path}.NFNFS`),
        modNFS: requiredString(document, "modNFS", `${path}.NFNFS`),
        serieNFS: requiredString(document, "serieNFS", `${path}.NFNFS`),
      },
    };
  }
  return name === "nDocFisc" ? { nDocFisc: reference as string } : { nDoc: reference as string };
}

function parseTaxes(value: XmlElement): Taxes {
  const path = "DPS.infDPS.valores.trib";
  return omitUndefined<Taxes>({
    tribMun: parseMunicipalTax(requiredElement(value, "tribMun", path)),
    tribFed: parseOptionalFederalTax(value),
    totTrib: parseTotalTax(requiredElement(value, "totTrib", path)),
  });
}

function parseMunicipalTax(value: XmlElement): MunicipalTax {
  const path = "DPS.infDPS.valores.trib.tribMun";
  const suspension = optionalElement(value, "exigSusp", path);
  const benefit = optionalElement(value, "BM", path);
  return omitUndefined<MunicipalTax>({
    tribISSQN: requiredString(value, "tribISSQN", path) as MunicipalTax["tribISSQN"],
    cPaisResult: optionalString(value, "cPaisResult", path),
    tpImunidade: optionalString(value, "tpImunidade", path) as MunicipalTax["tpImunidade"],
    exigSusp: suspension
      ? {
          tpSusp: requiredString(suspension, "tpSusp", `${path}.exigSusp`) as NonNullable<
            MunicipalTax["exigSusp"]
          >["tpSusp"],
          nProcesso: requiredString(suspension, "nProcesso", `${path}.exigSusp`),
        }
      : undefined,
    BM: benefit ? parseMunicipalBenefit(benefit) : undefined,
    tpRetISSQN: requiredString(value, "tpRetISSQN", path) as MunicipalTax["tpRetISSQN"],
    pAliq: optionalString(value, "pAliq", path) as MunicipalTax["pAliq"],
  });
}

function parseMunicipalBenefit(value: XmlElement): MunicipalBenefit {
  const path = "DPS.infDPS.valores.trib.tribMun.BM";
  const common = { nBM: requiredString(value, "nBM", path) };
  const amount = optionalString(value, "vRedBCBM", path);
  const percentage = optionalString(value, "pRedBCBM", path);
  if (amount && percentage) {
    throw new XmlParseError("invalid-value", path, "benefit reductions are mutually exclusive");
  }
  if (amount) {
    return {
      ...common,
      vRedBCBM: amount as Extract<MunicipalBenefit, { vRedBCBM: unknown }>["vRedBCBM"],
    };
  }
  if (percentage) {
    return {
      ...common,
      pRedBCBM: percentage as Extract<MunicipalBenefit, { pRedBCBM: unknown }>["pRedBCBM"],
    };
  }
  return common;
}

function parseOptionalFederalTax(value: XmlElement): FederalTax | undefined {
  const federal = optionalElement(value, "tribFed", "DPS.infDPS.valores.trib");
  if (!federal) {
    return undefined;
  }
  const path = "DPS.infDPS.valores.trib.tribFed";
  const pisCofins = optionalElement(federal, "piscofins", path);
  return omitUndefined<FederalTax>({
    piscofins: pisCofins ? parsePisCofins(pisCofins) : undefined,
    vRetCP: optionalString(federal, "vRetCP", path) as FederalTax["vRetCP"],
    vRetIRRF: optionalString(federal, "vRetIRRF", path) as FederalTax["vRetIRRF"],
    vRetCSLL: optionalString(federal, "vRetCSLL", path) as FederalTax["vRetCSLL"],
  });
}

function parsePisCofins(value: XmlElement): PisCofins {
  const path = "DPS.infDPS.valores.trib.tribFed.piscofins";
  return omitUndefined<PisCofins>({
    CST: requiredString(value, "CST", path),
    vBCPisCofins: optionalString(value, "vBCPisCofins", path) as PisCofins["vBCPisCofins"],
    pAliqPis: optionalString(value, "pAliqPis", path) as PisCofins["pAliqPis"],
    pAliqCofins: optionalString(value, "pAliqCofins", path) as PisCofins["pAliqCofins"],
    vPis: optionalString(value, "vPis", path) as PisCofins["vPis"],
    vCofins: optionalString(value, "vCofins", path) as PisCofins["vCofins"],
    tpRetPisCofins: optionalString(value, "tpRetPisCofins", path) as PisCofins["tpRetPisCofins"],
  });
}

function parseTotalTax(value: XmlElement): TotalTax {
  const path = "DPS.infDPS.valores.trib.totTrib";
  const amounts = optionalElement(value, "vTotTrib", path);
  const percentages = optionalElement(value, "pTotTrib", path);
  const indicator = optionalString(value, "indTotTrib", path);
  const simples = optionalString(value, "pTotTribSN", path);
  if ((amounts ? 1 : 0) + (percentages ? 1 : 0) + (indicator ? 1 : 0) + (simples ? 1 : 0) !== 1) {
    throw new XmlParseError("invalid-value", path, "expected one total-tax alternative");
  }
  if (amounts) {
    return {
      vTotTrib: {
        vTotTribFed: requiredString(amounts, "vTotTribFed", `${path}.vTotTrib`) as Extract<
          TotalTax,
          { vTotTrib: unknown }
        >["vTotTrib"]["vTotTribFed"],
        vTotTribEst: requiredString(amounts, "vTotTribEst", `${path}.vTotTrib`) as Extract<
          TotalTax,
          { vTotTrib: unknown }
        >["vTotTrib"]["vTotTribEst"],
        vTotTribMun: requiredString(amounts, "vTotTribMun", `${path}.vTotTrib`) as Extract<
          TotalTax,
          { vTotTrib: unknown }
        >["vTotTrib"]["vTotTribMun"],
      },
    };
  }
  if (percentages) {
    return {
      pTotTrib: {
        pTotTribFed: requiredString(percentages, "pTotTribFed", `${path}.pTotTrib`) as Extract<
          TotalTax,
          { pTotTrib: unknown }
        >["pTotTrib"]["pTotTribFed"],
        pTotTribEst: requiredString(percentages, "pTotTribEst", `${path}.pTotTrib`) as Extract<
          TotalTax,
          { pTotTrib: unknown }
        >["pTotTrib"]["pTotTribEst"],
        pTotTribMun: requiredString(percentages, "pTotTribMun", `${path}.pTotTrib`) as Extract<
          TotalTax,
          { pTotTrib: unknown }
        >["pTotTrib"]["pTotTribMun"],
      },
    };
  }
  return indicator
    ? { indTotTrib: indicator as "0" }
    : { pTotTribSN: simples as Extract<TotalTax, { pTotTribSN: unknown }>["pTotTribSN"] };
}

function parseOptionalIbsCbs(info: XmlElement): IbsCbs | undefined {
  const value = optionalElement(info, "IBSCBS", "DPS.infDPS");
  if (!value) {
    return undefined;
  }
  const path = "DPS.infDPS.IBSCBS";
  const references = optionalElement(value, "gRefNFSe", path);
  const destination = optionalElement(value, "dest", path);
  const property = optionalElement(value, "imovel", path);
  const valuesElement = requiredElement(value, "valores", path);
  const reimbursements = optionalElement(valuesElement, "gReeRepRes", `${path}.valores`);
  const taxes = requiredElement(valuesElement, "trib", `${path}.valores`);
  const classification = requiredElement(taxes, "gIBSCBS", `${path}.valores.trib`);

  return omitUndefined<IbsCbs>({
    finNFSe: requiredString(value, "finNFSe", path) as "0",
    indFinal: optionalString(value, "indFinal", path) as IbsCbs["indFinal"],
    cIndOp: requiredString(value, "cIndOp", path),
    tpOper: optionalString(value, "tpOper", path) as IbsCbs["tpOper"],
    gRefNFSe: references
      ? {
          refNFSe: values(references.refNFSe).map((entry, index) =>
            text(entry, `${path}.gRefNFSe.refNFSe[${index}]`),
          ),
        }
      : undefined,
    tpEnteGov: optionalString(value, "tpEnteGov", path) as IbsCbs["tpEnteGov"],
    indDest: requiredString(value, "indDest", path) as IbsCbs["indDest"],
    dest: destination ? parseIbsCbsDestination(destination) : undefined,
    imovel: property ? parseIbsCbsProperty(property) : undefined,
    valores: {
      gReeRepRes: reimbursements
        ? {
            documentos: values(reimbursements.documentos).map((document, index) =>
              parseReimbursementDocument(
                element(document, `${path}.valores.gReeRepRes.documentos[${index}]`),
                index,
              ),
            ),
          }
        : undefined,
      trib: {
        gIBSCBS: {
          CST: requiredString(classification, "CST", `${path}.valores.trib.gIBSCBS`),
          cClassTrib: requiredString(classification, "cClassTrib", `${path}.valores.trib.gIBSCBS`),
          cCredPres: optionalString(classification, "cCredPres", `${path}.valores.trib.gIBSCBS`),
          gTribRegular: parseOptionalRegularTaxation(classification),
          gDif: parseOptionalDeferral(classification),
        },
      },
    },
  });
}

function parseIbsCbsDestination(value: XmlElement): IbsCbsDestination {
  const path = "DPS.infDPS.IBSCBS.dest";
  return omitUndefined<IbsCbsDestination>({
    ...parseFederalTaxId(value, path),
    xNome: requiredString(value, "xNome", path),
    end: parseOptionalAddress(value, path),
    fone: optionalString(value, "fone", path),
    email: optionalString(value, "email", path),
  });
}

function parseIbsCbsProperty(value: XmlElement): IbsCbsProperty {
  const path = "DPS.infDPS.IBSCBS.imovel";
  const common = { inscImobFisc: optionalString(value, "inscImobFisc", path) };
  const cib = optionalString(value, "cCIB", path);
  const address = optionalElement(value, "end", path);
  if ((cib ? 1 : 0) + (address ? 1 : 0) !== 1) {
    throw new XmlParseError("invalid-value", path, "expected a CIB or property address");
  }
  return cib
    ? omitUndefined<IbsCbsProperty>({ ...common, cCIB: cib })
    : omitUndefined<IbsCbsProperty>({
        ...common,
        end: parseSimpleAddress(address as XmlElement, `${path}.end`),
      });
}

function parseReimbursementDocument(value: XmlElement, index: number): ReimbursementDocument {
  const path = `DPS.infDPS.IBSCBS.valores.gReeRepRes.documentos[${index}]`;
  const reference = parseReimbursementReference(value, path);
  const supplier = optionalElement(value, "fornec", path);
  return {
    ...reference,
    fornec: supplier ? parseIbsCbsSupplier(supplier, `${path}.fornec`) : undefined,
    dtEmiDoc: requiredString(value, "dtEmiDoc", path),
    dtCompDoc: requiredString(value, "dtCompDoc", path),
    tpReeRepRes: requiredString(value, "tpReeRepRes", path) as ReimbursementDocument["tpReeRepRes"],
    xTpReeRepRes: optionalString(value, "xTpReeRepRes", path),
    vlrReeRepRes: requiredString(
      value,
      "vlrReeRepRes",
      path,
    ) as ReimbursementDocument["vlrReeRepRes"],
  } as ReimbursementDocument;
}

function parseReimbursementReference(value: XmlElement, path: string) {
  const national = optionalElement(value, "dFeNacional", path);
  const fiscal = optionalElement(value, "docFiscalOutro", path);
  const other = optionalElement(value, "docOutro", path);
  if ((national ? 1 : 0) + (fiscal ? 1 : 0) + (other ? 1 : 0) !== 1) {
    throw new XmlParseError("invalid-value", path, "expected one reimbursement reference");
  }
  if (national) {
    return {
      dFeNacional: {
        tipoChaveDFe: requiredString(national, "tipoChaveDFe", `${path}.dFeNacional`) as
          | "1"
          | "2"
          | "3"
          | "9",
        xTipoChaveDFe: optionalString(national, "xTipoChaveDFe", `${path}.dFeNacional`),
        chaveDFe: requiredString(national, "chaveDFe", `${path}.dFeNacional`),
      },
    };
  }
  if (fiscal) {
    return {
      docFiscalOutro: {
        cMunDocFiscal: requiredString(fiscal, "cMunDocFiscal", `${path}.docFiscalOutro`),
        nDocFiscal: requiredString(fiscal, "nDocFiscal", `${path}.docFiscalOutro`),
        xDocFiscal: requiredString(fiscal, "xDocFiscal", `${path}.docFiscalOutro`),
      },
    };
  }
  const document = other as XmlElement;
  return {
    docOutro: {
      nDoc: requiredString(document, "nDoc", `${path}.docOutro`),
      xDoc: requiredString(document, "xDoc", `${path}.docOutro`),
    },
  };
}

function parseIbsCbsSupplier(value: XmlElement, path: string): IbsCbsSupplier {
  return {
    ...parseFederalTaxId(value, path),
    xNome: requiredString(value, "xNome", path),
  };
}

function parseOptionalRegularTaxation(
  value: XmlElement,
): IbsCbs["valores"]["trib"]["gIBSCBS"]["gTribRegular"] {
  const regular = optionalElement(value, "gTribRegular", "DPS.infDPS.IBSCBS.valores.trib.gIBSCBS");
  return regular
    ? {
        CSTReg: requiredString(
          regular,
          "CSTReg",
          "DPS.infDPS.IBSCBS.valores.trib.gIBSCBS.gTribRegular",
        ),
        cClassTribReg: requiredString(
          regular,
          "cClassTribReg",
          "DPS.infDPS.IBSCBS.valores.trib.gIBSCBS.gTribRegular",
        ),
      }
    : undefined;
}

function parseOptionalDeferral(value: XmlElement): IbsCbs["valores"]["trib"]["gIBSCBS"]["gDif"] {
  const deferral = optionalElement(value, "gDif", "DPS.infDPS.IBSCBS.valores.trib.gIBSCBS");
  const path = "DPS.infDPS.IBSCBS.valores.trib.gIBSCBS.gDif";
  return deferral
    ? {
        pDifUF: requiredString(deferral, "pDifUF", path) as NonNullable<
          IbsCbs["valores"]["trib"]["gIBSCBS"]["gDif"]
        >["pDifUF"],
        pDifMun: requiredString(deferral, "pDifMun", path) as NonNullable<
          IbsCbs["valores"]["trib"]["gIBSCBS"]["gDif"]
        >["pDifMun"],
        pDifCBS: requiredString(deferral, "pDifCBS", path) as NonNullable<
          IbsCbs["valores"]["trib"]["gIBSCBS"]["gDif"]
        >["pDifCBS"],
      }
    : undefined;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new XmlParseError("invalid-value", path, "expected text content");
  }
  return value;
}
