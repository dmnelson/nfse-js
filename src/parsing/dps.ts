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
  cnpjValue,
  cpfValue,
  enumValue,
  facetValue,
  optionalEnumValue,
  optionalFacetValue,
} from "./validation.js";
import {
  assertNationalRoot,
  elementValues,
  omitUndefined,
  optionalElement,
  optionalSignatureElement,
  optionalString,
  parseXmlRoot,
  requiredAttribute,
  requiredElement,
  requiredString,
  stringValues,
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
    signature: optionalSignatureElement(root.value, "DPS"),
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
  const path = "DPS.infDPS";
  return omitUndefined<DpsInfo>({
    Id: requiredAttribute(info, "Id", path),
    tpAmb: enumValue(requiredString(info, "tpAmb", path), ["1", "2"], `${path}.tpAmb`),
    dhEmi: requiredString(info, "dhEmi", path),
    verAplic: requiredString(info, "verAplic", path),
    serie: requiredString(info, "serie", path),
    nDPS: requiredString(info, "nDPS", path),
    dCompet: requiredString(info, "dCompet", path),
    tpEmit: enumValue(requiredString(info, "tpEmit", path), ["1", "2", "3"], `${path}.tpEmit`),
    cMotivoEmisTI: optionalEnumValue(
      optionalString(info, "cMotivoEmisTI", path),
      ["1", "2", "3", "4"],
      `${path}.cMotivoEmisTI`,
    ),
    chNFSeRej: optionalString(info, "chNFSeRej", path),
    cLocEmi: requiredString(info, "cLocEmi", path),
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
        cMotivo: enumValue(
          requiredString(substitution, "cMotivo", "DPS.infDPS.subst"),
          ["01", "02", "03", "04", "05", "99"],
          "DPS.infDPS.subst.cMotivo",
        ),
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
  const path = "DPS.infDPS.prest.regTrib";
  return omitUndefined<Provider["regTrib"]>({
    opSimpNac: enumValue(
      requiredString(regime, "opSimpNac", path),
      ["1", "2", "3"],
      `${path}.opSimpNac`,
    ),
    regApTribSN: optionalEnumValue(
      optionalString(regime, "regApTribSN", path),
      ["1", "2", "3"],
      `${path}.regApTribSN`,
    ),
    regEspTrib: enumValue(
      requiredString(regime, "regEspTrib", path),
      ["0", "1", "2", "3", "4", "5", "6", "9"],
      `${path}.regEspTrib`,
    ),
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
    return { CNPJ: cnpjValue(value, `${path}.CNPJ`) };
  }
  if (name === "CPF") {
    return { CPF: cpfValue(value, `${path}.CPF`) };
  }
  if (name === "NIF") {
    return { NIF: value };
  }
  return { cNaoNIF: enumValue(value, ["0", "1", "2"], `${path}.cNaoNIF`) };
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
        mdPrestacao: enumValue(
          requiredString(value, "mdPrestacao", path),
          ["0", "1", "2", "3", "4"],
          `${path}.mdPrestacao`,
        ),
        vincPrest: enumValue(
          requiredString(value, "vincPrest", path),
          ["0", "1", "2", "3", "4", "5", "6", "9"],
          `${path}.vincPrest`,
        ),
        tpMoeda: requiredString(value, "tpMoeda", path),
        vServMoeda: facetValue(
          requiredString(value, "vServMoeda", path),
          "TSDec15V2",
          `${path}.vServMoeda`,
        ) as ForeignTrade["vServMoeda"],
        mecAFComexP: enumValue(
          requiredString(value, "mecAFComexP", path),
          ["00", "01", "02", "03", "04", "05", "06", "07", "08"],
          `${path}.mecAFComexP`,
        ),
        mecAFComexT: enumValue(
          requiredString(value, "mecAFComexT", path),
          [
            "00",
            "01",
            "02",
            "03",
            "04",
            "05",
            "06",
            "07",
            "08",
            "09",
            "10",
            "11",
            "12",
            "13",
            "14",
            "15",
            "16",
            "17",
            "18",
            "19",
            "20",
            "21",
            "22",
            "23",
            "24",
            "25",
            "26",
          ],
          `${path}.mecAFComexT`,
        ),
        movTempBens: enumValue(
          requiredString(value, "movTempBens", path),
          ["0", "1", "2", "3"],
          `${path}.movTempBens`,
        ),
        nDI: optionalString(value, "nDI", path),
        nRE: optionalString(value, "nRE", path),
        mdic: enumValue(requiredString(value, "mdic", path), ["0", "1"], `${path}.mdic`),
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
          xItemPed: stringValues(items, "xItemPed", `${path}.gItemPed`),
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
      vReceb: optionalFacetValue(
        optionalString(service, "vReceb", `${path}.vServPrest`),
        "TSDec15V2",
        `${path}.vServPrest.vReceb`,
      ) as Values["vServPrest"]["vReceb"],
      vServ: facetValue(
        requiredString(service, "vServ", `${path}.vServPrest`),
        "TSDec15V2",
        `${path}.vServPrest.vServ`,
      ) as Values["vServPrest"]["vServ"],
    },
    vDescCondIncond: discounts
      ? {
          vDescIncond: optionalFacetValue(
            optionalString(discounts, "vDescIncond", `${path}.vDescCondIncond`),
            "TSDec15V2",
            `${path}.vDescCondIncond.vDescIncond`,
          ) as NonNullable<Values["vDescCondIncond"]>["vDescIncond"],
          vDescCond: optionalFacetValue(
            optionalString(discounts, "vDescCond", `${path}.vDescCondIncond`),
            "TSDec15V2",
            `${path}.vDescCondIncond.vDescCond`,
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
    return {
      pDR: facetValue(percentage, "TSDec3V2", `${path}.pDR`) as Extract<
        DeductionReduction,
        { pDR: unknown }
      >["pDR"],
    };
  }
  if (amount) {
    return {
      vDR: facetValue(amount, "TSDec15V2", `${path}.vDR`) as Extract<
        DeductionReduction,
        { vDR: unknown }
      >["vDR"],
    };
  }
  return {
    documentos: {
      docDedRed: elementValues(documents as XmlElement, "docDedRed", `${path}.documentos`).map(
        parseDeductionDocument,
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
    tpDedRed: enumValue(
      requiredString(value, "tpDedRed", path),
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "99"],
      `${path}.tpDedRed`,
    ),
    xDescOutDed: optionalString(value, "xDescOutDed", path),
    dtEmiDoc: requiredString(value, "dtEmiDoc", path),
    vDedutivelRedutivel: facetValue(
      requiredString(value, "vDedutivelRedutivel", path),
      "TSDec15V2",
      `${path}.vDedutivelRedutivel`,
    ) as DeductionDocument["vDedutivelRedutivel"],
    vDeducaoReducao: facetValue(
      requiredString(value, "vDeducaoReducao", path),
      "TSDec15V2",
      `${path}.vDeducaoReducao`,
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
    tribISSQN: enumValue(
      requiredString(value, "tribISSQN", path),
      ["1", "2", "3", "4"],
      `${path}.tribISSQN`,
    ),
    cPaisResult: optionalString(value, "cPaisResult", path),
    tpImunidade: optionalEnumValue(
      optionalString(value, "tpImunidade", path),
      ["0", "1", "2", "3", "4", "5"],
      `${path}.tpImunidade`,
    ),
    exigSusp: suspension
      ? {
          tpSusp: enumValue(
            requiredString(suspension, "tpSusp", `${path}.exigSusp`),
            ["1", "2"],
            `${path}.exigSusp.tpSusp`,
          ),
          nProcesso: requiredString(suspension, "nProcesso", `${path}.exigSusp`),
        }
      : undefined,
    BM: benefit ? parseMunicipalBenefit(benefit) : undefined,
    tpRetISSQN: enumValue(
      requiredString(value, "tpRetISSQN", path),
      ["1", "2", "3"],
      `${path}.tpRetISSQN`,
    ),
    pAliq: optionalFacetValue(
      optionalString(value, "pAliq", path),
      "TSDec1V2",
      `${path}.pAliq`,
    ) as MunicipalTax["pAliq"],
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
      vRedBCBM: facetValue(amount, "TSDec15V2", `${path}.vRedBCBM`) as Extract<
        MunicipalBenefit,
        { vRedBCBM: unknown }
      >["vRedBCBM"],
    };
  }
  if (percentage) {
    return {
      ...common,
      pRedBCBM: facetValue(percentage, "TSDec3V2", `${path}.pRedBCBM`) as Extract<
        MunicipalBenefit,
        { pRedBCBM: unknown }
      >["pRedBCBM"],
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
    vRetCP: optionalFacetValue(
      optionalString(federal, "vRetCP", path),
      "TSDec15V2",
      `${path}.vRetCP`,
    ) as FederalTax["vRetCP"],
    vRetIRRF: optionalFacetValue(
      optionalString(federal, "vRetIRRF", path),
      "TSDec15V2",
      `${path}.vRetIRRF`,
    ) as FederalTax["vRetIRRF"],
    vRetCSLL: optionalFacetValue(
      optionalString(federal, "vRetCSLL", path),
      "TSDec15V2",
      `${path}.vRetCSLL`,
    ) as FederalTax["vRetCSLL"],
  });
}

function parsePisCofins(value: XmlElement): PisCofins {
  const path = "DPS.infDPS.valores.trib.tribFed.piscofins";
  return omitUndefined<PisCofins>({
    CST: requiredString(value, "CST", path),
    vBCPisCofins: optionalFacetValue(
      optionalString(value, "vBCPisCofins", path),
      "TSDec15V2",
      `${path}.vBCPisCofins`,
    ) as PisCofins["vBCPisCofins"],
    pAliqPis: optionalFacetValue(
      optionalString(value, "pAliqPis", path),
      "TSDec2V2",
      `${path}.pAliqPis`,
    ) as PisCofins["pAliqPis"],
    pAliqCofins: optionalFacetValue(
      optionalString(value, "pAliqCofins", path),
      "TSDec2V2",
      `${path}.pAliqCofins`,
    ) as PisCofins["pAliqCofins"],
    vPis: optionalFacetValue(
      optionalString(value, "vPis", path),
      "TSDec15V2",
      `${path}.vPis`,
    ) as PisCofins["vPis"],
    vCofins: optionalFacetValue(
      optionalString(value, "vCofins", path),
      "TSDec15V2",
      `${path}.vCofins`,
    ) as PisCofins["vCofins"],
    tpRetPisCofins: optionalEnumValue(
      optionalString(value, "tpRetPisCofins", path),
      ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
      `${path}.tpRetPisCofins`,
    ),
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
        vTotTribFed: facetValue(
          requiredString(amounts, "vTotTribFed", `${path}.vTotTrib`),
          "TSDec15V2",
          `${path}.vTotTrib.vTotTribFed`,
        ) as Extract<TotalTax, { vTotTrib: unknown }>["vTotTrib"]["vTotTribFed"],
        vTotTribEst: facetValue(
          requiredString(amounts, "vTotTribEst", `${path}.vTotTrib`),
          "TSDec15V2",
          `${path}.vTotTrib.vTotTribEst`,
        ) as Extract<TotalTax, { vTotTrib: unknown }>["vTotTrib"]["vTotTribEst"],
        vTotTribMun: facetValue(
          requiredString(amounts, "vTotTribMun", `${path}.vTotTrib`),
          "TSDec15V2",
          `${path}.vTotTrib.vTotTribMun`,
        ) as Extract<TotalTax, { vTotTrib: unknown }>["vTotTrib"]["vTotTribMun"],
      },
    };
  }
  if (percentages) {
    return {
      pTotTrib: {
        pTotTribFed: facetValue(
          requiredString(percentages, "pTotTribFed", `${path}.pTotTrib`),
          "TSDec3V2",
          `${path}.pTotTrib.pTotTribFed`,
        ) as Extract<TotalTax, { pTotTrib: unknown }>["pTotTrib"]["pTotTribFed"],
        pTotTribEst: facetValue(
          requiredString(percentages, "pTotTribEst", `${path}.pTotTrib`),
          "TSDec3V2",
          `${path}.pTotTrib.pTotTribEst`,
        ) as Extract<TotalTax, { pTotTrib: unknown }>["pTotTrib"]["pTotTribEst"],
        pTotTribMun: facetValue(
          requiredString(percentages, "pTotTribMun", `${path}.pTotTrib`),
          "TSDec3V2",
          `${path}.pTotTrib.pTotTribMun`,
        ) as Extract<TotalTax, { pTotTrib: unknown }>["pTotTrib"]["pTotTribMun"],
      },
    };
  }
  return indicator
    ? { indTotTrib: enumValue(indicator, ["0"], `${path}.indTotTrib`) }
    : {
        pTotTribSN: facetValue(simples as string, "TSDec2V2", `${path}.pTotTribSN`) as Extract<
          TotalTax,
          { pTotTribSN: unknown }
        >["pTotTribSN"],
      };
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
    finNFSe: enumValue(requiredString(value, "finNFSe", path), ["0"], `${path}.finNFSe`),
    indFinal: optionalEnumValue(
      optionalString(value, "indFinal", path),
      ["0", "1"],
      `${path}.indFinal`,
    ),
    cIndOp: requiredString(value, "cIndOp", path),
    tpOper: optionalEnumValue(
      optionalString(value, "tpOper", path),
      ["1", "2", "3", "4", "5"],
      `${path}.tpOper`,
    ),
    gRefNFSe: references
      ? {
          refNFSe: stringValues(references, "refNFSe", `${path}.gRefNFSe`),
        }
      : undefined,
    tpEnteGov: optionalEnumValue(
      optionalString(value, "tpEnteGov", path),
      ["1", "2", "3", "4"],
      `${path}.tpEnteGov`,
    ),
    indDest: enumValue(requiredString(value, "indDest", path), ["0", "1"], `${path}.indDest`),
    dest: destination ? parseIbsCbsDestination(destination) : undefined,
    imovel: property ? parseIbsCbsProperty(property) : undefined,
    valores: {
      gReeRepRes: reimbursements
        ? {
            documentos: elementValues(
              reimbursements,
              "documentos",
              `${path}.valores.gReeRepRes`,
            ).map(parseReimbursementDocument),
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
    tpReeRepRes: enumValue(
      requiredString(value, "tpReeRepRes", path),
      ["01", "02", "03", "04", "99"],
      `${path}.tpReeRepRes`,
    ),
    xTpReeRepRes: optionalString(value, "xTpReeRepRes", path),
    vlrReeRepRes: facetValue(
      requiredString(value, "vlrReeRepRes", path),
      "TSDec15V2",
      `${path}.vlrReeRepRes`,
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
        tipoChaveDFe: enumValue(
          requiredString(national, "tipoChaveDFe", `${path}.dFeNacional`),
          ["1", "2", "3", "9"],
          `${path}.dFeNacional.tipoChaveDFe`,
        ),
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
        pDifUF: facetValue(
          requiredString(deferral, "pDifUF", path),
          "TSDec3V2",
          `${path}.pDifUF`,
        ) as NonNullable<IbsCbs["valores"]["trib"]["gIBSCBS"]["gDif"]>["pDifUF"],
        pDifMun: facetValue(
          requiredString(deferral, "pDifMun", path),
          "TSDec3V2",
          `${path}.pDifMun`,
        ) as NonNullable<IbsCbs["valores"]["trib"]["gIBSCBS"]["gDif"]>["pDifMun"],
        pDifCBS: facetValue(
          requiredString(deferral, "pDifCBS", path),
          "TSDec3V2",
          `${path}.pDifCBS`,
        ) as NonNullable<IbsCbs["valores"]["trib"]["gIBSCBS"]["gDif"]>["pDifCBS"],
      }
    : undefined;
}
