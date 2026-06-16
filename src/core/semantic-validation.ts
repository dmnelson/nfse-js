import {
  DpsValidationError,
  type ValidationCategory,
  type ValidationIssue,
  type ValidationSource,
} from "../errors.js";
import { buildDpsId } from "./dps-id.js";
import {
  DPS_XSD_FACETS,
  type DpsFacetName,
  isValidXsdDate,
  isValidXsdDateTime,
  validateFacet,
} from "./facets.js";
import { getNationalDpsRule } from "./rules.js";
import { isValidCnpj, isValidCpf } from "./tax-id.js";
import type {
  Address,
  Decimal1V2,
  DeductionDocument,
  DpsDocument,
  FederalTaxId,
  IbsCbsDestination,
  IbsCbsSupplier,
  Person,
  Provider,
  ReimbursementDocument,
  SimpleAddress,
} from "./types.js";

const XSD_URL =
  "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/leiautes-nfs-e-versao-1-01-20260209.zip";
const FAIL_FAST = Symbol("fail-fast");
const CUSTOMER_REQUIRED_OPERATION_INDICATORS = new Set([
  "030102",
  "050102",
  "100101",
  "100301",
  "100501",
  "030103",
  "050103",
  "100102",
  "100201",
  "100302",
  "100401",
  "100502",
  "100601",
]);
const CONSTRUCTION_SERVICE_CODES = new Set([
  "070201",
  "070202",
  "070401",
  "070501",
  "070502",
  "070601",
  "070602",
  "070701",
  "070801",
  "071701",
  "071901",
  "141403",
  "141404",
]);
const IBS_PROPERTY_FORBIDDEN_SERVICE_CODES = new Set(
  [...CONSTRUCTION_SERVICE_CODES].filter((code) => !code.startsWith("1414")),
);
const IBS_OPERATION_TYPE_SERVICE_CODES = new Set(["250500", "150900", "171200", "100500"]);
// Incidence categories from the v1.01 MUN.INCID_INFO.SERV. annex table.
const SERVICE_LOCATION_INCIDENCE_SUBITEMS = new Set([
  "0304",
  "0305",
  "0702",
  "0704",
  "0705",
  "0709",
  "0710",
  "0711",
  "0712",
  "0716",
  "0717",
  "0718",
  "0719",
  "1101",
  "1102",
  "1104",
  "1201",
  "1202",
  "1203",
  "1204",
  "1205",
  "1206",
  "1207",
  "1208",
  "1209",
  "1210",
  "1211",
  "1212",
  "1214",
  "1215",
  "1216",
  "1217",
  "1414",
  "1710",
  "2002",
  "2003",
  "2201",
]);
const CUSTOMER_INCIDENCE_SUBITEMS = new Set(["1705"]);

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

export interface DpsValidationOptions {
  readonly mode?: "collect" | "fail-fast";
  readonly issuanceChannel?: "own-application" | "mobile" | "web" | "manual-web";
}

export interface ResolvedMunicipalParameters {
  readonly municipality: string;
  readonly serviceCode: string;
  readonly providerMunicipalRegistrationRequired?: boolean;
  readonly allowedDeductionModes?: readonly ("percentage" | "value" | "documents")[];
  readonly issqnRate?: Decimal1V2;
  readonly allowedWithholding?: readonly ("1" | "2" | "3")[];
  readonly allowedBenefitIds?: readonly string[];
  readonly resolvedAt?: string;
  readonly source?: string;
}

export function validateDps(
  dps: DpsDocument,
  options: DpsValidationOptions = {},
): ValidationResult {
  const collector = new IssueCollector(options.mode ?? "collect");

  try {
    validateDocument(collector, dps, options);
  } catch (error) {
    if (error !== FAIL_FAST) {
      throw error;
    }
  }

  return { valid: collector.issues.length === 0, issues: collector.issues };
}

export function validateDpsWithMunicipalParameters(
  dps: DpsDocument,
  parameters: ResolvedMunicipalParameters,
  options: DpsValidationOptions = {},
): ValidationResult {
  const collector = new IssueCollector(options.mode ?? "collect");

  try {
    validateDocument(collector, dps, options);
    validateMunicipalParameters(collector, dps, parameters);
  } catch (error) {
    if (error !== FAIL_FAST) {
      throw error;
    }
  }

  return { valid: collector.issues.length === 0, issues: collector.issues };
}

export function assertValidDps(dps: DpsDocument, options?: DpsValidationOptions): void {
  const result = validateDps(dps, options);
  if (!result.valid) {
    throw new DpsValidationError(result.issues);
  }
}

function validateDocument(
  collector: IssueCollector,
  dps: DpsDocument,
  options: DpsValidationOptions,
): void {
  const info = dps.infDPS;

  facet(collector, info.Id, "TSIdDPS", "infDPS.Id");
  facet(collector, info.cLocEmi, "TSCodMunIBGE", "infDPS.cLocEmi");
  facet(collector, info.serie, "TSSerieDPS", "infDPS.serie");
  facet(collector, info.nDPS, "TSNumDPS", "infDPS.nDPS");
  date(collector, info.dCompet, "infDPS.dCompet");
  dateTime(collector, info.dhEmi, "infDPS.dhEmi");
  stringLength(collector, info.verAplic, 1, 20, "infDPS.verAplic", "TSVerAplic");

  validateFederalTaxId(collector, info.prest, "infDPS.prest", {
    cnpj: "E0080",
    cpf: "E0096",
  });
  validateProvider(collector, info.prest, "infDPS.prest");

  if (info.toma) {
    validateFederalTaxId(collector, info.toma, "infDPS.toma", { cnpj: "E0188" });
    validatePerson(collector, info.toma, "infDPS.toma");
  }
  if (info.interm) {
    validateFederalTaxId(collector, info.interm, "infDPS.interm", { cnpj: "E0248" });
    validatePerson(collector, info.interm, "infDPS.interm");
  }

  validateService(collector, dps);
  validateValues(collector, dps);
  validateIbsCbs(collector, dps);
  validateDocumentRules(collector, dps, options);
}

function validateProvider(collector: IssueCollector, provider: Provider, path: string): void {
  commonPersonFields(collector, provider, path);

  if (provider.regTrib.regApTribSN !== undefined && provider.regTrib.opSimpNac !== "3") {
    national(collector, "E0162", `${path}.regTrib.regApTribSN`);
  }
}

function validatePerson(collector: IssueCollector, person: Person, path: string): void {
  commonPersonFields(collector, person, path);
}

function commonPersonFields(
  collector: IssueCollector,
  person: Provider | Person | IbsCbsDestination,
  path: string,
): void {
  if ("CAEPF" in person && person.CAEPF !== undefined) {
    facet(collector, person.CAEPF, "TSCAEPF", `${path}.CAEPF`);
  }
  if ("IM" in person && person.IM !== undefined) {
    facet(collector, person.IM, "TSInscMun", `${path}.IM`);
  }
  if (person.xNome !== undefined) {
    stringLength(collector, person.xNome, 1, 300, `${path}.xNome`, "TSNomeRazaoSocial");
  }
  if (person.fone !== undefined) {
    facet(collector, person.fone, "TSTelefone", `${path}.fone`);
  }
  if (person.email !== undefined) {
    facet(collector, person.email, "TSEmail", `${path}.email`);
  }
  if (person.end) {
    validateAddress(collector, person.end, `${path}.end`);
  }
}

function validateAddress(collector: IssueCollector, address: Address, path: string): void {
  if ("endNac" in address) {
    facet(collector, address.endNac.cMun, "TSCodMunIBGE", `${path}.endNac.cMun`);
    facet(collector, address.endNac.CEP, "TSCEP", `${path}.endNac.CEP`);
  } else {
    facet(collector, address.endExt.cPais, "TSCodPaisISO", `${path}.endExt.cPais`);
    stringLength(
      collector,
      address.endExt.cEndPost,
      1,
      11,
      `${path}.endExt.cEndPost`,
      "TSCodigoEndPostal",
    );
    stringLength(collector, address.endExt.xCidade, 1, 60, `${path}.endExt.xCidade`, "TSCidade");
    stringLength(
      collector,
      address.endExt.xEstProvReg,
      1,
      60,
      `${path}.endExt.xEstProvReg`,
      "TSEstadoProvRegiao",
    );
  }
  validateAddressTextFields(collector, address, path);
}

function validateService(collector: IssueCollector, dps: DpsDocument): void {
  const { serv } = dps.infDPS;

  if ("cLocPrestacao" in serv.locPrest) {
    facet(
      collector,
      serv.locPrest.cLocPrestacao,
      "TSCodMunIBGE",
      "infDPS.serv.locPrest.cLocPrestacao",
    );
  } else {
    facet(
      collector,
      serv.locPrest.cPaisPrestacao,
      "TSCodPaisISO",
      "infDPS.serv.locPrest.cPaisPrestacao",
    );
  }

  facet(collector, serv.cServ.cTribNac, "TSCodTribNac", "infDPS.serv.cServ.cTribNac");
  stringLength(
    collector,
    serv.cServ.xDescServ,
    1,
    2000,
    "infDPS.serv.cServ.xDescServ",
    "TSDesc2000",
  );
  if (serv.cServ.cNBS !== undefined) {
    facet(collector, serv.cServ.cNBS, "TSCodNBS", "infDPS.serv.cServ.cNBS");
  }
  if (serv.cServ.cTribMun !== undefined) {
    pattern(
      collector,
      serv.cServ.cTribMun,
      /^\d{3}$/,
      "infDPS.serv.cServ.cTribMun",
      "TCCodTribMun",
    );
  }
  if (serv.cServ.cIntContrib !== undefined) {
    pattern(
      collector,
      serv.cServ.cIntContrib,
      /^[A-Za-z0-9]{1,20}$/,
      "infDPS.serv.cServ.cIntContrib",
      "TSCodigoInternoContribuinte",
    );
  }

  if (serv.comExt) {
    facet(collector, serv.comExt.tpMoeda, "TSCodMoeda", "infDPS.serv.comExt.tpMoeda");
    decimalFacet(collector, serv.comExt.vServMoeda, "TSDec15V2", "infDPS.serv.comExt.vServMoeda");
    if (serv.comExt.nDI !== undefined) {
      xsdString(collector, serv.comExt.nDI, 1, 12, "infDPS.serv.comExt.nDI", "TSNumDocImport");
    }
    if (serv.comExt.nRE !== undefined) {
      xsdString(collector, serv.comExt.nRE, 1, 12, "infDPS.serv.comExt.nRE", "TSNumRegExport");
    }
  }

  if (serv.obra) {
    if ("cCIB" in serv.obra && serv.obra.cCIB !== undefined) {
      facet(collector, serv.obra.cCIB, "TSCodCIB", "infDPS.serv.obra.cCIB");
    }
    if ("end" in serv.obra && serv.obra.end) {
      validateSimpleAddress(collector, serv.obra.end, "infDPS.serv.obra.end");
    }
  }

  if (serv.atvEvento) {
    date(collector, serv.atvEvento.dtIni, "infDPS.serv.atvEvento.dtIni");
    date(collector, serv.atvEvento.dtFim, "infDPS.serv.atvEvento.dtFim");
    if (serv.atvEvento.dtIni > serv.atvEvento.dtFim) {
      custom(
        collector,
        "infDPS.serv.atvEvento.dtFim",
        "event-date-order",
        "business",
        "event end date cannot precede its start date",
      );
    }
    if ("end" in serv.atvEvento && serv.atvEvento.end) {
      validateSimpleAddress(collector, serv.atvEvento.end, "infDPS.serv.atvEvento.end");
    }
  }

  if (serv.infoCompl?.gItemPed) {
    arrayLength(
      collector,
      serv.infoCompl.gItemPed.xItemPed,
      1,
      99,
      "infDPS.serv.infoCompl.gItemPed.xItemPed",
    );
  }
}

function validateSimpleAddress(
  collector: IssueCollector,
  address: SimpleAddress,
  path: string,
): void {
  if (address.CEP !== undefined) {
    facet(collector, address.CEP, "TSCEP", `${path}.CEP`);
  }
  if (address.endExt) {
    stringLength(
      collector,
      address.endExt.cEndPost,
      1,
      11,
      `${path}.endExt.cEndPost`,
      "TSCodigoEndPostal",
    );
    stringLength(collector, address.endExt.xCidade, 1, 60, `${path}.endExt.xCidade`, "TSCidade");
    stringLength(
      collector,
      address.endExt.xEstProvReg,
      1,
      60,
      `${path}.endExt.xEstProvReg`,
      "TSEstadoProvRegiao",
    );
  }
  validateAddressTextFields(collector, address, path);
}

function validateAddressTextFields(
  collector: IssueCollector,
  address: Address | SimpleAddress,
  path: string,
): void {
  xsdString(collector, address.xLgr, 1, 255, `${path}.xLgr`, "TSLogradouro");
  xsdString(collector, address.nro, 1, 60, `${path}.nro`, "TSNumeroEndereco");
  if (address.xCpl !== undefined) {
    xsdString(collector, address.xCpl, 1, 156, `${path}.xCpl`, "TSComplementoEndereco");
  }
  xsdString(collector, address.xBairro, 1, 60, `${path}.xBairro`, "TSBairro");
}

function validateValues(collector: IssueCollector, dps: DpsDocument): void {
  const { valores } = dps.infDPS;
  const serviceValue = valores.vServPrest.vServ;

  decimalFacet(collector, serviceValue, "TSDec15V2", "infDPS.valores.vServPrest.vServ");
  if (valores.vServPrest.vReceb !== undefined) {
    decimalFacet(
      collector,
      valores.vServPrest.vReceb,
      "TSDec15V2",
      "infDPS.valores.vServPrest.vReceb",
    );
  }
  if (valores.vDescCondIncond?.vDescIncond !== undefined) {
    decimalFacet(
      collector,
      valores.vDescCondIncond.vDescIncond,
      "TSDec15V2",
      "infDPS.valores.vDescCondIncond.vDescIncond",
    );
  }
  if (valores.vDescCondIncond?.vDescCond !== undefined) {
    decimalFacet(
      collector,
      valores.vDescCondIncond.vDescCond,
      "TSDec15V2",
      "infDPS.valores.vDescCondIncond.vDescCond",
    );
  }

  const deduction = valores.vDedRed;
  if (deduction) {
    if ("pDR" in deduction) {
      decimalFacet(collector, deduction.pDR, "TSDec3V2", "infDPS.valores.vDedRed.pDR");
    } else if ("vDR" in deduction) {
      decimalFacet(collector, deduction.vDR, "TSDec15V2", "infDPS.valores.vDedRed.vDR");
    } else {
      arrayLength(
        collector,
        deduction.documentos.docDedRed,
        1,
        1000,
        "infDPS.valores.vDedRed.documentos.docDedRed",
      );
      deduction.documentos.docDedRed.forEach((document, index) => {
        validateDeductionDocument(collector, document, index, dps);
      });
    }
  }

  validateMunicipalTaxFacets(collector, dps);
  validateFederalTaxFacets(collector, dps);
  validateTotalTaxFacets(collector, dps);
}

function validateDeductionDocument(
  collector: IssueCollector,
  document: DeductionDocument,
  index: number,
  dps: DpsDocument,
): void {
  const path = `infDPS.valores.vDedRed.documentos.docDedRed[${index}]`;
  date(collector, document.dtEmiDoc, `${path}.dtEmiDoc`);
  decimalFacet(collector, document.vDedutivelRedutivel, "TSDec15V2", `${path}.vDedutivelRedutivel`);
  decimalFacet(collector, document.vDeducaoReducao, "TSDec15V2", `${path}.vDeducaoReducao`);

  if ("chNFSe" in document && document.chNFSe !== undefined) {
    facet(collector, document.chNFSe, "TSChaveNFSe", `${path}.chNFSe`);
  } else if ("chNFe" in document && document.chNFe !== undefined) {
    facet(collector, document.chNFe, "TSChaveNFe", `${path}.chNFe`);
  } else if ("NFSeMun" in document && document.NFSeMun !== undefined) {
    facet(collector, document.NFSeMun.cMunNFSeMun, "TSCodMunIBGE", `${path}.NFSeMun.cMunNFSeMun`);
  }

  if (document.fornec) {
    validateFederalTaxId(collector, document.fornec, `${path}.fornec`, {
      cnpj: "E0478",
      cpf: "E0484",
    });
    validatePerson(collector, document.fornec, `${path}.fornec`);
  }

  if (document.tpDedRed === "99" && !document.xDescOutDed) {
    national(collector, "E0468", `${path}.xDescOutDed`);
  }
  if (isValidXsdDate(document.dtEmiDoc) && document.dtEmiDoc > dps.infDPS.dCompet) {
    national(collector, "E0472", `${path}.dtEmiDoc`);
  }
  if (greaterThan(document.vDeducaoReducao, document.vDedutivelRedutivel)) {
    national(collector, "E0474", `${path}.vDeducaoReducao`);
  }
  if (!("chNFSe" in document) && !("chNFe" in document) && document.fornec === undefined) {
    national(collector, "E0477", `${path}.fornec`);
  }
}

function validateMunicipalTaxFacets(collector: IssueCollector, dps: DpsDocument): void {
  const tax = dps.infDPS.valores.trib.tribMun;
  if (tax.cPaisResult !== undefined) {
    facet(collector, tax.cPaisResult, "TSCodPaisISO", "infDPS.valores.trib.tribMun.cPaisResult");
  }
  if (tax.pAliq !== undefined) {
    decimalFacet(collector, tax.pAliq, "TSDec1V2", "infDPS.valores.trib.tribMun.pAliq");
  }
  if (tax.BM) {
    facet(collector, tax.BM.nBM, "TSNumBeneficioMunicipal", "infDPS.valores.trib.tribMun.BM.nBM");
    if ("vRedBCBM" in tax.BM && tax.BM.vRedBCBM !== undefined) {
      decimalFacet(
        collector,
        tax.BM.vRedBCBM,
        "TSDec15V2",
        "infDPS.valores.trib.tribMun.BM.vRedBCBM",
      );
    }
    if ("pRedBCBM" in tax.BM && tax.BM.pRedBCBM !== undefined) {
      decimalFacet(
        collector,
        tax.BM.pRedBCBM,
        "TSDec3V2",
        "infDPS.valores.trib.tribMun.BM.pRedBCBM",
      );
    }
  }
  if (tax.exigSusp) {
    facet(
      collector,
      tax.exigSusp.nProcesso,
      "TSNumProcExigSuspensa",
      "infDPS.valores.trib.tribMun.exigSusp.nProcesso",
    );
  }
}

function validateFederalTaxFacets(collector: IssueCollector, dps: DpsDocument): void {
  const federal = dps.infDPS.valores.trib.tribFed;
  if (!federal) {
    return;
  }
  const decimalFields = [
    ["vRetCP", federal.vRetCP],
    ["vRetIRRF", federal.vRetIRRF],
    ["vRetCSLL", federal.vRetCSLL],
  ] as const;
  for (const [field, value] of decimalFields) {
    if (value !== undefined) {
      decimalFacet(collector, value, "TSDec15V2", `infDPS.valores.trib.tribFed.${field}`);
    }
  }

  const pis = federal.piscofins;
  if (!pis) {
    return;
  }
  const amountFields = [
    ["vBCPisCofins", pis.vBCPisCofins],
    ["vPis", pis.vPis],
    ["vCofins", pis.vCofins],
  ] as const;
  for (const [field, value] of amountFields) {
    if (value !== undefined) {
      decimalFacet(collector, value, "TSDec15V2", `infDPS.valores.trib.tribFed.piscofins.${field}`);
    }
  }
  const rateFields = [
    ["pAliqPis", pis.pAliqPis],
    ["pAliqCofins", pis.pAliqCofins],
  ] as const;
  for (const [field, value] of rateFields) {
    if (value !== undefined) {
      decimalFacet(collector, value, "TSDec2V2", `infDPS.valores.trib.tribFed.piscofins.${field}`);
    }
  }
}

function validateTotalTaxFacets(collector: IssueCollector, dps: DpsDocument): void {
  const total = dps.infDPS.valores.trib.totTrib;
  if ("vTotTrib" in total) {
    for (const [field, value] of Object.entries(total.vTotTrib)) {
      decimalFacet(collector, value, "TSDec15V2", `infDPS.valores.trib.totTrib.vTotTrib.${field}`);
    }
  } else if ("pTotTrib" in total) {
    for (const [field, value] of Object.entries(total.pTotTrib)) {
      decimalFacet(collector, value, "TSDec3V2", `infDPS.valores.trib.totTrib.pTotTrib.${field}`);
    }
  } else if ("pTotTribSN" in total) {
    decimalFacet(collector, total.pTotTribSN, "TSDec2V2", "infDPS.valores.trib.totTrib.pTotTribSN");
  }
}

function validateIbsCbs(collector: IssueCollector, dps: DpsDocument): void {
  const ibs = dps.infDPS.IBSCBS;
  if (!ibs) {
    return;
  }

  facet(collector, ibs.cIndOp, "TSRTCCodIndOp", "infDPS.IBSCBS.cIndOp");
  if (ibs.dest) {
    validateFederalTaxId(collector, ibs.dest, "infDPS.IBSCBS.dest", {
      cnpj: "E0911",
      cpf: "E0913",
    });
    commonPersonFields(collector, ibs.dest, "infDPS.IBSCBS.dest");
  }
  if (ibs.imovel && "cCIB" in ibs.imovel) {
    facet(collector, ibs.imovel.cCIB, "TSCodCIB", "infDPS.IBSCBS.imovel.cCIB");
  }
  if (ibs.imovel && "end" in ibs.imovel) {
    validateSimpleAddress(collector, ibs.imovel.end, "infDPS.IBSCBS.imovel.end");
  }
  if (ibs.gRefNFSe) {
    arrayLength(collector, ibs.gRefNFSe.refNFSe, 1, 99, "infDPS.IBSCBS.gRefNFSe.refNFSe");
    ibs.gRefNFSe.refNFSe.forEach((key, index) => {
      facet(collector, key, "TSChaveNFSe", `infDPS.IBSCBS.gRefNFSe.refNFSe[${index}]`);
    });
  }
  if (ibs.valores.gReeRepRes) {
    arrayLength(
      collector,
      ibs.valores.gReeRepRes.documentos,
      1,
      1000,
      "infDPS.IBSCBS.valores.gReeRepRes.documentos",
    );
    ibs.valores.gReeRepRes.documentos.forEach((document, index) => {
      validateReimbursementDocument(collector, document, index, dps);
    });
  }

  const classification = ibs.valores.trib.gIBSCBS;
  pattern(
    collector,
    classification.CST,
    /^\d{3}$/,
    "infDPS.IBSCBS.valores.trib.gIBSCBS.CST",
    "TSRTCCodSitTrib",
  );
  pattern(
    collector,
    classification.cClassTrib,
    /^\d{6}$/,
    "infDPS.IBSCBS.valores.trib.gIBSCBS.cClassTrib",
    "TSRTCCodClassTrib",
  );
  if (classification.gDif) {
    for (const [field, value] of Object.entries(classification.gDif)) {
      decimalFacet(
        collector,
        value,
        "TSDec3V2",
        `infDPS.IBSCBS.valores.trib.gIBSCBS.gDif.${field}`,
      );
    }
  }
}

function validateReimbursementDocument(
  collector: IssueCollector,
  document: ReimbursementDocument,
  index: number,
  dps: DpsDocument,
): void {
  const path = `infDPS.IBSCBS.valores.gReeRepRes.documentos[${index}]`;
  date(collector, document.dtEmiDoc, `${path}.dtEmiDoc`);
  date(collector, document.dtCompDoc, `${path}.dtCompDoc`);
  decimalFacet(collector, document.vlrReeRepRes, "TSDec15V2", `${path}.vlrReeRepRes`);

  if ("dFeNacional" in document) {
    stringLength(
      collector,
      document.dFeNacional.chaveDFe,
      1,
      50,
      `${path}.dFeNacional.chaveDFe`,
      "TSRTCChaveDFe",
    );
    if (document.dFeNacional.tipoChaveDFe === "9" && !document.dFeNacional.xTipoChaveDFe) {
      custom(
        collector,
        `${path}.dFeNacional.xTipoChaveDFe`,
        "required",
        "business",
        "is required when tipoChaveDFe is 9",
      );
    }
    if (
      document.dFeNacional.tipoChaveDFe !== "9" &&
      document.dFeNacional.xTipoChaveDFe !== undefined
    ) {
      custom(
        collector,
        `${path}.dFeNacional.xTipoChaveDFe`,
        "unexpected",
        "business",
        "must not be supplied unless tipoChaveDFe is 9",
      );
    }
  } else if ("docFiscalOutro" in document) {
    facet(
      collector,
      document.docFiscalOutro.cMunDocFiscal,
      "TSCodMunIBGE",
      `${path}.docFiscalOutro.cMunDocFiscal`,
    );
    if (isValidXsdDate(document.dtCompDoc) && document.dtCompDoc > "2025-12-31") {
      national(collector, "E0942", `${path}.docFiscalOutro`);
    }
  }

  if (document.fornec) {
    validateFederalTaxId(collector, document.fornec, `${path}.fornec`, {
      cnpj: "E0945",
      cpf: "E0947",
    });
    validateSupplier(collector, document.fornec, `${path}.fornec`);
  }

  if (
    isValidXsdDate(document.dtEmiDoc) &&
    isValidXsdDate(document.dtCompDoc) &&
    document.dtEmiDoc < document.dtCompDoc
  ) {
    national(collector, "E0950", `${path}.dtEmiDoc`);
  }
  if (document.tpReeRepRes !== "99" && document.xTpReeRepRes !== undefined) {
    national(collector, "E0952", `${path}.xTpReeRepRes`);
  }
  if (greaterThan(document.vlrReeRepRes, dps.infDPS.valores.vServPrest.vServ)) {
    national(collector, "E0953", `${path}.vlrReeRepRes`);
  }
}

function validateSupplier(collector: IssueCollector, supplier: IbsCbsSupplier, path: string): void {
  stringLength(collector, supplier.xNome, 1, 150, `${path}.xNome`, "TSDesc150");
}

function validateDocumentRules(
  collector: IssueCollector,
  dps: DpsDocument,
  options: DpsValidationOptions,
): void {
  const info = dps.infDPS;
  const expectedId = expectedDpsId(dps);
  if (expectedId !== undefined && info.Id !== expectedId) {
    national(collector, "E0004", "infDPS.Id");
  }

  if (
    isValidXsdDate(info.dCompet) &&
    isValidXsdDateTime(info.dhEmi) &&
    info.dCompet > info.dhEmi.slice(0, 10)
  ) {
    national(collector, "E0015", "infDPS.dCompet");
  }

  validateSeriesChannel(collector, info.serie, options.issuanceChannel);

  if (info.tpEmit === "1" && info.cMotivoEmisTI !== undefined) {
    national(collector, "E0029", "infDPS.cMotivoEmisTI");
  }
  if (info.tpEmit !== "1" && info.cMotivoEmisTI === undefined) {
    custom(
      collector,
      "infDPS.cMotivoEmisTI",
      "required",
      "business",
      "is required when the issuer is the customer or intermediary",
    );
  }
  if (info.chNFSeRej !== undefined && (info.tpEmit === "1" || info.cMotivoEmisTI !== "4")) {
    national(collector, "E0034", "infDPS.chNFSeRej");
  }
  if (info.chNFSeRej !== undefined) {
    facet(collector, info.chNFSeRej, "TSChaveNFSe", "infDPS.chNFSeRej");
  }
  if (info.cMotivoEmisTI === "4" && info.chNFSeRej === undefined) {
    custom(
      collector,
      "infDPS.chNFSeRej",
      "required",
      "business",
      "is required when cMotivoEmisTI is 4",
    );
  }

  if (info.subst) {
    facet(collector, info.subst.chSubstda, "TSChaveNFSe", "infDPS.subst.chSubstda");
    if (info.subst.cMotivo === "99" && !info.subst.xMotivo) {
      national(collector, "E0078", "infDPS.subst.xMotivo");
    }
  }

  if (info.tpEmit === "1") {
    if ("NIF" in info.prest) {
      national(collector, "E0112", "infDPS.prest.NIF");
    }
    if (info.prest.xNome !== undefined) {
      national(collector, "E0121", "infDPS.prest.xNome");
    }
  }
  if (info.tpEmit === "2" && info.toma && "NIF" in info.toma) {
    national(collector, "E0222", "infDPS.toma.NIF");
  }
  if (info.tpEmit === "3" && info.interm && "NIF" in info.interm) {
    national(collector, "E0280", "infDPS.interm.NIF");
  }

  const operation = info.IBSCBS?.cIndOp;
  if (operation && CUSTOMER_REQUIRED_OPERATION_INDICATORS.has(operation)) {
    if (!info.toma) {
      national(collector, "E0187", "infDPS.toma");
    } else if (!info.toma.end) {
      national(collector, "E0234", "infDPS.toma.end");
    }
  }
  if (
    info.tpEmit === "1" &&
    info.toma &&
    "CNPJ" in info.toma &&
    (!info.toma.end || !("endNac" in info.toma.end))
  ) {
    national(collector, "E0235", "infDPS.toma.end.endNac");
  }
  if (
    info.toma &&
    isForeignAddress(info.toma.end) &&
    !("NIF" in info.toma) &&
    !("cNaoNIF" in info.toma)
  ) {
    national(collector, "E0223", "infDPS.toma.NIF");
  }
  if (info.toma && "cNaoNIF" in info.toma && info.toma.cNaoNIF === "0") {
    national(collector, "E0226", "infDPS.toma.cNaoNIF");
  }
  if (info.tpEmit === "1" && info.toma && "NIF" in info.toma && !isForeignAddress(info.toma.end)) {
    national(collector, "E0242", "infDPS.toma.end.endExt");
  }

  if ("cPaisPrestacao" in info.serv.locPrest && info.serv.locPrest.cPaisPrestacao === "BR") {
    national(collector, "E0304", "infDPS.serv.locPrest.cPaisPrestacao");
  }

  const foreignLocationScenario =
    isForeignAddress(info.toma?.end) ||
    isForeignAddress(info.interm?.end) ||
    "cPaisPrestacao" in info.serv.locPrest;
  if (info.tpEmit === "1" && foreignLocationScenario && info.serv.cServ.cNBS === undefined) {
    national(collector, "E0318", "infDPS.serv.cServ.cNBS");
  }

  const exportScenario = foreignLocationScenario || info.valores.trib.tribMun.tribISSQN === "3";
  if (info.tpEmit === "1" && exportScenario && !info.serv.comExt) {
    national(collector, "E0330", "infDPS.serv.comExt");
  }
  const foreignTrade = info.serv.comExt;
  if (foreignTrade) {
    if (foreignTrade.mdPrestacao === "0") {
      national(collector, "E0333", "infDPS.serv.comExt.mdPrestacao");
    }
    if (foreignTrade.mecAFComexP === "00") {
      national(collector, "E0341", "infDPS.serv.comExt.mecAFComexP");
    }
    if (foreignTrade.mecAFComexT === "00") {
      national(collector, "E0343", "infDPS.serv.comExt.mecAFComexT");
    }
    if (foreignTrade.movTempBens === "0") {
      national(collector, "E0345", "infDPS.serv.comExt.movTempBens");
    }
    if (foreignTrade.movTempBens === "2" && !foreignTrade.nDI) {
      national(collector, "E0352", "infDPS.serv.comExt.nDI");
    }
    if (foreignTrade.movTempBens === "1" && (foreignTrade.nDI || foreignTrade.nRE)) {
      national(
        collector,
        "E0354",
        foreignTrade.nDI ? "infDPS.serv.comExt.nDI" : "infDPS.serv.comExt.nRE",
      );
    }
    if (foreignTrade.movTempBens === "3" && !foreignTrade.nRE) {
      national(collector, "E0356", "infDPS.serv.comExt.nRE");
    }
  }
  if (CONSTRUCTION_SERVICE_CODES.has(info.serv.cServ.cTribNac) && info.serv.obra === undefined) {
    national(collector, "E0370", "infDPS.serv.obra");
  }
  if (info.serv.cServ.cTribNac.startsWith("12") && info.serv.atvEvento === undefined) {
    national(collector, "E0390", "infDPS.serv.atvEvento");
  }

  validateValueRules(collector, dps);
  validateIbsCbsRules(collector, dps);
}

function validateValueRules(collector: IssueCollector, dps: DpsDocument): void {
  const info = dps.infDPS;
  const values = info.valores;
  const serviceValue = values.vServPrest.vServ;
  const municipal = values.trib.tribMun;

  if (info.tpEmit === "3" && values.vServPrest.vReceb === undefined) {
    national(collector, "E0423", "infDPS.valores.vServPrest.vReceb");
  }

  const unconditional = values.vDescCondIncond?.vDescIncond;
  const conditional = values.vDescCondIncond?.vDescCond;
  if (unconditional !== undefined && !positiveAndBelow(unconditional, serviceValue)) {
    national(collector, "E0431", "infDPS.valores.vDescCondIncond.vDescIncond");
  }
  if (conditional !== undefined && !positiveAndBelow(conditional, serviceValue)) {
    national(collector, "E0432", "infDPS.valores.vDescCondIncond.vDescCond");
  }

  if (values.vDedRed && municipal.tribISSQN !== "1") {
    national(collector, "E0435", "infDPS.valores.vDedRed");
  }
  if (values.vDedRed && "pDR" in values.vDedRed && !percentageInRange(values.vDedRed.pDR, false)) {
    national(collector, "E0453", "infDPS.valores.vDedRed.pDR");
  }

  const serviceCents = scaledInteger(serviceValue);
  const discountCents = scaledInteger(unconditional ?? "0");
  const knownReduction = knownReductionCents(dps, serviceCents);
  const benefitCents =
    municipal.BM && "vRedBCBM" in municipal.BM ? scaledInteger(municipal.BM.vRedBCBM ?? "0") : 0n;
  if (
    serviceCents !== undefined &&
    discountCents !== undefined &&
    knownReduction !== undefined &&
    benefitCents !== undefined &&
    discountCents + knownReduction + benefitCents > serviceCents
  ) {
    national(collector, "E0427", "infDPS.valores.vServPrest.vServ");
  }

  const immunityExpected = municipal.tribISSQN === "2";
  if (immunityExpected !== (municipal.tpImunidade !== undefined)) {
    national(collector, "E0592", "infDPS.valores.trib.tribMun.tpImunidade");
  }
  if (municipal.tribISSQN !== "1" && municipal.exigSusp !== undefined) {
    national(collector, "E0585", "infDPS.valores.trib.tribMun.exigSusp");
  }
  if (municipal.tribISSQN !== "1" && municipal.tpRetISSQN !== "1") {
    national(collector, "E0580", "infDPS.valores.trib.tribMun.tpRetISSQN");
  }
  validateResultCountryRules(collector, dps);
  if (municipal.pAliq !== undefined && greaterThan(municipal.pAliq, "5.00")) {
    national(collector, "E0595", "infDPS.valores.trib.tribMun.pAliq");
  }

  const federal = values.trib.tribFed;
  const issuer = info.tpEmit === "1" ? info.prest : info.tpEmit === "2" ? info.toma : info.interm;
  if (issuer && "CPF" in issuer && federal !== undefined) {
    national(collector, "E0675", "infDPS.valores.trib.tribFed");
  }
  if (federal?.piscofins?.vBCPisCofins !== undefined) {
    if (greaterThan(federal.piscofins.vBCPisCofins, serviceValue)) {
      national(collector, "E0677", "infDPS.valores.trib.tribFed.piscofins.vBCPisCofins");
    }
  }
  if (
    federal?.piscofins?.pAliqPis !== undefined &&
    !percentageInRange(federal.piscofins.pAliqPis, true)
  ) {
    national(collector, "E0686", "infDPS.valores.trib.tribFed.piscofins.pAliqPis");
  }
  if (
    federal?.piscofins?.pAliqCofins !== undefined &&
    !percentageInRange(federal.piscofins.pAliqCofins, true)
  ) {
    national(collector, "E0692", "infDPS.valores.trib.tribFed.piscofins.pAliqCofins");
  }
  if (
    federal?.piscofins?.vBCPisCofins !== undefined &&
    federal.piscofins.pAliqPis !== undefined &&
    federal.piscofins.vPis !== undefined &&
    !matchesPercentageCalculation(
      federal.piscofins.vBCPisCofins,
      federal.piscofins.pAliqPis,
      federal.piscofins.vPis,
    )
  ) {
    national(collector, "E0694", "infDPS.valores.trib.tribFed.piscofins.vPis");
  }
  if (
    federal?.piscofins?.vBCPisCofins !== undefined &&
    federal.piscofins.pAliqCofins !== undefined &&
    federal.piscofins.vCofins !== undefined &&
    !matchesPercentageCalculation(
      federal.piscofins.vBCPisCofins,
      federal.piscofins.pAliqCofins,
      federal.piscofins.vCofins,
    )
  ) {
    national(collector, "E0696", "infDPS.valores.trib.tribFed.piscofins.vCofins");
  }
  if (federal?.vRetCP !== undefined && !positiveAndBelow(federal.vRetCP, serviceValue)) {
    national(collector, "E0699", "infDPS.valores.trib.tribFed.vRetCP");
  }
  if (federal?.vRetIRRF !== undefined && !positiveAndBelow(federal.vRetIRRF, serviceValue)) {
    national(collector, "E0700", "infDPS.valores.trib.tribFed.vRetIRRF");
  }
  if (federal?.piscofins?.tpRetPisCofins === "0" && federal.vRetCSLL !== undefined) {
    national(collector, "E0720", "infDPS.valores.trib.tribFed.vRetCSLL");
  }

  const total = values.trib.totTrib;
  if ("vTotTrib" in total) {
    const fields = [
      ["vTotTribFed", total.vTotTrib.vTotTribFed, "E0702"],
      ["vTotTribEst", total.vTotTrib.vTotTribEst, "E0703"],
      ["vTotTribMun", total.vTotTrib.vTotTribMun, "E0704"],
    ] as const;
    for (const [field, value, code] of fields) {
      if (greaterThan(value, serviceValue)) {
        national(collector, code, `infDPS.valores.trib.totTrib.vTotTrib.${field}`);
      }
    }
  } else if ("pTotTrib" in total) {
    const fields = [
      ["pTotTribFed", total.pTotTrib.pTotTribFed, "E0706"],
      ["pTotTribEst", total.pTotTrib.pTotTribEst, "E0707"],
      ["pTotTribMun", total.pTotTrib.pTotTribMun, "E0708"],
    ] as const;
    for (const [field, value, code] of fields) {
      if (!percentageInRange(value, true)) {
        national(collector, code, `infDPS.valores.trib.totTrib.pTotTrib.${field}`);
      }
    }
  } else if ("indTotTrib" in total && info.prest.regTrib.opSimpNac === "3") {
    national(collector, "E0712", "infDPS.valores.trib.totTrib.indTotTrib");
  }
}

function validateIbsCbsRules(collector: IssueCollector, dps: DpsDocument): void {
  const info = dps.infDPS;
  const ibs = info.IBSCBS;
  if (!ibs) {
    return;
  }

  if (isValidXsdDate(info.dCompet) && info.dCompet < "2026-01-01") {
    national(collector, "E0850", "infDPS.IBSCBS");
  }
  if (
    (ibs.tpEnteGov !== undefined ||
      IBS_OPERATION_TYPE_SERVICE_CODES.has(info.serv.cServ.cTribNac)) &&
    ibs.tpOper === undefined
  ) {
    national(collector, "E0903", "infDPS.IBSCBS.tpOper");
  }
  if ((ibs.tpOper === "2" || ibs.tpOper === "3") && ibs.gRefNFSe === undefined) {
    national(collector, "E0905", "infDPS.IBSCBS.gRefNFSe");
  }
  if (ibs.indDest === "0" && ibs.dest !== undefined) {
    national(collector, "E0910", "infDPS.IBSCBS.dest");
  }
  if (ibs.indDest === "1" && ibs.dest === undefined) {
    custom(
      collector,
      "infDPS.IBSCBS.dest",
      "required",
      "business",
      "is required when indDest is 1",
    );
  }
  if (
    IBS_PROPERTY_FORBIDDEN_SERVICE_CODES.has(info.serv.cServ.cTribNac) &&
    ibs.imovel !== undefined
  ) {
    national(collector, "E0931", "infDPS.IBSCBS.imovel");
  }
}

function validateMunicipalParameters(
  collector: IssueCollector,
  dps: DpsDocument,
  parameters: ResolvedMunicipalParameters,
): void {
  const info = dps.infDPS;
  const source: ValidationSource = {
    document: parameters.source ?? "Resolved National NFS-e municipal parameters",
    version: parameters.resolvedAt ?? "unspecified",
  };

  if (parameters.municipality !== info.cLocEmi) {
    municipal(
      collector,
      "infDPS.cLocEmi",
      "municipal.municipality-mismatch",
      "resolved parameters belong to a different municipality",
      source,
    );
  }
  if (parameters.serviceCode !== info.serv.cServ.cTribNac) {
    municipal(
      collector,
      "infDPS.serv.cServ.cTribNac",
      "municipal.service-mismatch",
      "resolved parameters belong to a different service code",
      source,
    );
  }
  if (parameters.providerMunicipalRegistrationRequired && !info.prest.IM) {
    municipal(
      collector,
      "infDPS.prest.IM",
      "municipal.registration-required",
      "municipal registration is required by the resolved parameters",
      source,
    );
  }

  const deduction = info.valores.vDedRed;
  if (deduction && parameters.allowedDeductionModes) {
    const mode = "pDR" in deduction ? "percentage" : "vDR" in deduction ? "value" : "documents";
    if (!parameters.allowedDeductionModes.includes(mode)) {
      municipal(
        collector,
        "infDPS.valores.vDedRed",
        "municipal.deduction-not-allowed",
        `deduction mode ${mode} is not allowed by the resolved parameters`,
        source,
      );
    }
  }

  const municipalTax = info.valores.trib.tribMun;
  if (
    parameters.issqnRate !== undefined &&
    municipalTax.pAliq !== undefined &&
    parameters.issqnRate !== municipalTax.pAliq
  ) {
    municipal(
      collector,
      "infDPS.valores.trib.tribMun.pAliq",
      "municipal.rate-mismatch",
      "ISSQN rate differs from the resolved municipal rate",
      source,
    );
  }
  if (
    parameters.allowedWithholding &&
    !parameters.allowedWithholding.includes(municipalTax.tpRetISSQN)
  ) {
    municipal(
      collector,
      "infDPS.valores.trib.tribMun.tpRetISSQN",
      "municipal.withholding-not-allowed",
      "withholding mode is not allowed by the resolved parameters",
      source,
    );
  }
  if (
    municipalTax.BM &&
    parameters.allowedBenefitIds &&
    !parameters.allowedBenefitIds.includes(municipalTax.BM.nBM)
  ) {
    municipal(
      collector,
      "infDPS.valores.trib.tribMun.BM.nBM",
      "municipal.benefit-not-allowed",
      "benefit is not present in the resolved municipal parameters",
      source,
    );
  }
}

function validateFederalTaxId(
  collector: IssueCollector,
  subject: FederalTaxId,
  path: string,
  officialCodes: { readonly cnpj?: string; readonly cpf?: string } = {},
): void {
  if ("CNPJ" in subject && subject.CNPJ !== undefined) {
    const shapeValid = facet(collector, subject.CNPJ, "TSCNPJ", `${path}.CNPJ`);
    if (shapeValid && !isValidCnpj(subject.CNPJ)) {
      if (officialCodes.cnpj) {
        national(collector, officialCodes.cnpj, `${path}.CNPJ`);
      } else {
        custom(
          collector,
          `${path}.CNPJ`,
          "invalid-cnpj",
          "format",
          "CNPJ check digits are invalid",
        );
      }
    }
  } else if ("CPF" in subject && subject.CPF !== undefined) {
    const shapeValid = facet(collector, subject.CPF, "TSCPF", `${path}.CPF`);
    if (shapeValid && !isValidCpf(subject.CPF)) {
      if (officialCodes.cpf) {
        national(collector, officialCodes.cpf, `${path}.CPF`);
      } else {
        custom(collector, `${path}.CPF`, "invalid-cpf", "format", "CPF check digits are invalid");
      }
    }
  } else if ("NIF" in subject && subject.NIF !== undefined) {
    facet(collector, subject.NIF, "TSNIF", `${path}.NIF`);
  }
}

function expectedDpsId(dps: DpsDocument): string | undefined {
  const info = dps.infDPS;
  const issuer = info.tpEmit === "1" ? info.prest : info.tpEmit === "2" ? info.toma : info.interm;
  if (!issuer || (!("CNPJ" in issuer) && !("CPF" in issuer))) {
    return undefined;
  }

  try {
    return buildDpsId({
      cLocEmi: info.cLocEmi,
      emitente: issuer,
      serie: info.serie,
      nDPS: info.nDPS,
    });
  } catch {
    return undefined;
  }
}

function validateSeriesChannel(
  collector: IssueCollector,
  series: string,
  channel: DpsValidationOptions["issuanceChannel"],
): void {
  if (!channel || !/^\d{1,5}$/.test(series)) {
    return;
  }
  const value = Number(series);
  const valid =
    channel === "own-application"
      ? value >= 1 && value <= 49999
      : channel === "mobile"
        ? value >= 50000 && value <= 69999
        : channel === "web"
          ? value >= 70000 && value <= 79999
          : value >= 80000 && value <= 89999;
  if (!valid) {
    const entry = getNationalDpsRule("E0010");
    collector.add({
      path: "infDPS.serie",
      code: entry.code,
      officialCode: entry.code,
      category: "business",
      message: entry.summary,
      source: entry.source,
    });
  }
}

function knownReductionCents(
  dps: DpsDocument,
  serviceCents: bigint | undefined,
): bigint | undefined {
  const deduction = dps.infDPS.valores.vDedRed;
  if (!deduction) {
    return 0n;
  }
  if ("pDR" in deduction) {
    const rate = scaledInteger(deduction.pDR);
    if (serviceCents === undefined || rate === undefined) {
      return undefined;
    }
    return (serviceCents * rate + 5000n) / 10000n;
  }
  if ("vDR" in deduction) {
    return scaledInteger(deduction.vDR);
  }
  return deduction.documentos.docDedRed.reduce<bigint | undefined>((total, document) => {
    const value = scaledInteger(document.vDeducaoReducao);
    return total === undefined || value === undefined ? undefined : total + value;
  }, 0n);
}

function scaledInteger(value: string): bigint | undefined {
  if (!DPS_XSD_FACETS.TSDec15V2.pattern.test(value)) {
    return undefined;
  }
  const [integer, fraction = ""] = value.split(".");
  return BigInt(`${integer}${fraction.padEnd(2, "0")}`);
}

function greaterThan(left: string, right: string): boolean {
  const leftValue = scaledInteger(left);
  const rightValue = scaledInteger(right);
  return leftValue !== undefined && rightValue !== undefined && leftValue > rightValue;
}

function positiveAndBelow(value: string, upperBound: string): boolean {
  const amount = scaledInteger(value);
  const upper = scaledInteger(upperBound);
  return amount !== undefined && upper !== undefined && amount > 0n && amount < upper;
}

function percentageInRange(value: string, allowZero: boolean): boolean {
  const amount = scaledInteger(value);
  return amount !== undefined && (allowZero ? amount >= 0n : amount > 0n) && amount <= 10000n;
}

function matchesPercentageCalculation(base: string, rate: string, result: string): boolean {
  const baseAmount = scaledInteger(base);
  const rateAmount = scaledInteger(rate);
  const resultAmount = scaledInteger(result);
  if (baseAmount === undefined || rateAmount === undefined || resultAmount === undefined) {
    return true;
  }
  const rounded = (baseAmount * rateAmount + 5000n) / 10000n;
  return rounded === resultAmount;
}

function isForeignAddress(address: Address | undefined): boolean {
  return address !== undefined && "endExt" in address;
}

function isDomesticAddress(address: Address | undefined): boolean {
  return address !== undefined && "endNac" in address;
}

function validateResultCountryRules(collector: IssueCollector, dps: DpsDocument): void {
  const info = dps.infDPS;
  const municipal = info.valores.trib.tribMun;
  const incidence = serviceIncidence(info.serv.cServ.cTribNac);
  const domesticServiceLocation = "cLocPrestacao" in info.serv.locPrest;
  const customerIsDomestic = isDomesticAddress(info.toma?.end);
  const resultCountryRequired =
    municipal.tribISSQN === "3" &&
    domesticServiceLocation &&
    (incidence === "provider" || (incidence === "customer" && !customerIsDomestic));

  if (resultCountryRequired && municipal.cPaisResult === undefined) {
    national(collector, "E0590", "infDPS.valores.trib.tribMun.cPaisResult");
  } else if (!resultCountryRequired && municipal.cPaisResult !== undefined) {
    national(collector, "E0591", "infDPS.valores.trib.tribMun.cPaisResult");
  }
}

function serviceIncidence(
  serviceCode: string,
): "provider" | "customer" | "service-location" | undefined {
  if (!/^\d{6}$/.test(serviceCode) || serviceCode === "990101") {
    return undefined;
  }
  const subitem = serviceCode.slice(0, 4);
  if (SERVICE_LOCATION_INCIDENCE_SUBITEMS.has(subitem)) {
    return "service-location";
  }
  if (CUSTOMER_INCIDENCE_SUBITEMS.has(subitem)) {
    return "customer";
  }
  return "provider";
}

function facet(
  collector: IssueCollector,
  value: string,
  facetName: DpsFacetName,
  path: string,
): boolean {
  const failure = validateFacet(facetName, value);
  if (!failure) {
    return true;
  }

  const definition = DPS_XSD_FACETS[facetName];
  collector.add({
    path,
    code: "facet",
    category: "schema",
    message: failure.detail,
    source: {
      document: "tiposSimples_v1.01.xsd",
      version: "1.01 (2026-02-09)",
      section: facetName,
      row: definition.sourceLine,
      url: XSD_URL,
    },
  });
  return false;
}

function date(collector: IssueCollector, value: string, path: string): void {
  if (!facet(collector, value, "TSData", path)) {
    return;
  }
  if (!isValidXsdDate(value)) {
    custom(
      collector,
      path,
      "invalid-date",
      "format",
      "must be a real calendar date from 2000-2099",
    );
  }
}

function dateTime(collector: IssueCollector, value: string, path: string): void {
  if (!facet(collector, value, "TSDateTimeUTC", path)) {
    return;
  }
  if (!isValidXsdDateTime(value)) {
    custom(
      collector,
      path,
      "invalid-date-time",
      "format",
      "must contain a real calendar date and a supported whole-hour UTC offset",
    );
  }
}

function decimalFacet(
  collector: IssueCollector,
  value: string,
  facetName: "TSDec15V2" | "TSDec1V2" | "TSDec2V2" | "TSDec3V2",
  path: string,
): void {
  facet(collector, value, facetName, path);
}

function stringLength(
  collector: IssueCollector,
  value: string,
  minimum: number,
  maximum: number,
  path: string,
  type: string,
): void {
  if (value.length < minimum || value.length > maximum) {
    custom(
      collector,
      path,
      "facet",
      "schema",
      `must contain between ${minimum} and ${maximum} characters for ${type}`,
    );
  }
}

function xsdString(
  collector: IssueCollector,
  value: string,
  minimum: number,
  maximum: number,
  path: string,
  type: string,
): void {
  stringLength(collector, value, minimum, maximum, path, type);
  pattern(collector, value, /^(?:[!-\u00ff]|[!-\u00ff][ -\u00ff]*[!-\u00ff])$/, path, type);
}

function pattern(
  collector: IssueCollector,
  value: string,
  expected: RegExp,
  path: string,
  type: string,
): void {
  if (!expected.test(value)) {
    custom(collector, path, "facet", "schema", `does not match ${type}`);
  }
}

function arrayLength(
  collector: IssueCollector,
  values: readonly unknown[],
  minimum: number,
  maximum: number,
  path: string,
): void {
  if (values.length < minimum || values.length > maximum) {
    custom(
      collector,
      path,
      "length",
      "schema",
      `must contain between ${minimum} and ${maximum} items`,
    );
  }
}

function national(collector: IssueCollector, code: string, path: string, message?: string): void {
  const entry = getNationalDpsRule(code);
  collector.add({
    path,
    code,
    officialCode: code,
    category: "business",
    message: message ?? entry.summary,
    source: entry.source,
  });
}

function municipal(
  collector: IssueCollector,
  path: string,
  code: string,
  message: string,
  source: ValidationSource,
): void {
  collector.add({ path, code, category: "municipal-parameter", message, source });
}

function custom(
  collector: IssueCollector,
  path: string,
  code: string,
  category: ValidationCategory,
  message: string,
): void {
  collector.add({ path, code, category, message });
}

class IssueCollector {
  readonly issues: ValidationIssue[] = [];

  constructor(private readonly mode: "collect" | "fail-fast") {}

  add(issue: ValidationIssue): void {
    this.issues.push(issue);
    if (this.mode === "fail-fast") {
      throw FAIL_FAST;
    }
  }
}
