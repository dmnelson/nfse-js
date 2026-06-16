import type { ValidationSource } from "../errors.js";

const ANNEX_URL =
  "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/anexo_i-sefin_adn-dps_nfse-snnfse-v1-01-20260209.xlsx";

export interface NationalDpsRule {
  readonly code: string;
  readonly field: string;
  readonly summary: string;
  readonly source: ValidationSource;
}

function rule(code: string, row: number, field: string, summary: string): NationalDpsRule {
  return {
    code,
    field,
    summary,
    source: {
      document: "Anexo I - SEFIN/ADN DPS/NFS-e",
      version: "1.01 (2026-02-09)",
      section: "RN DPS_NFS-e",
      row,
      url: ANNEX_URL,
    },
  };
}

export const NATIONAL_DPS_RULES = [
  rule("E0004", 139, "infDPS.Id", "DPS identifier must match its source fields."),
  rule("E0010", 144, "infDPS.serie", "Series must belong to the issuance channel range."),
  rule("E0015", 147, "infDPS.dCompet", "Competence date cannot follow emission date."),
  rule("E0029", 155, "infDPS.cMotivoEmisTI", "Provider-issued DPS cannot include this reason."),
  rule("E0034", 158, "infDPS.chNFSeRej", "Rejected NFS-e key is limited to rejection issuance."),
  rule("E0078", 184, "infDPS.subst.xMotivo", "Reason 99 requires a description."),
  rule("E0080", 186, "infDPS.prest.CNPJ", "Provider CNPJ check digits must be valid."),
  rule("E0096", 189, "infDPS.prest.CPF", "Provider CPF check digits must be valid."),
  rule("E0112", 192, "infDPS.prest.NIF", "A provider issuer cannot be identified by NIF."),
  rule("E0121", 202, "infDPS.prest.xNome", "Provider issuer must not submit its name."),
  rule("E0162", 226, "infDPS.prest.regTrib.regApTribSN", "Assessment regime is ME/EPP-only."),
  rule("E0187", 234, "infDPS.toma", "Specified operation indicators require a customer."),
  rule("E0188", 235, "infDPS.toma.CNPJ", "Customer CNPJ check digits must be valid."),
  rule("E0222", 244, "infDPS.toma.NIF", "A customer issuer cannot be identified by NIF."),
  rule(
    "E0223",
    245,
    "infDPS.toma.NIF",
    "A customer with a foreign address must use NIF or cNaoNIF.",
  ),
  rule("E0226", 248, "infDPS.toma.cNaoNIF", "Customer cNaoNIF value 0 is not accepted by SEFIN."),
  rule("E0234", 255, "infDPS.toma.end", "Specified operation indicators require an address."),
  rule("E0235", 256, "infDPS.toma.end.endNac", "CNPJ customer requires a domestic address."),
  rule(
    "E0242",
    261,
    "infDPS.toma.end.endExt",
    "A provider-issued DPS with a NIF customer requires a foreign address.",
  ),
  rule("E0248", 273, "infDPS.interm.CNPJ", "Intermediary CNPJ check digits must be valid."),
  rule("E0280", 282, "infDPS.interm.NIF", "An intermediary issuer cannot be identified by NIF."),
  rule("E0304", 314, "infDPS.serv.locPrest.cPaisPrestacao", "Foreign country must not be BR."),
  rule("E0318", 322, "infDPS.serv.cServ.cNBS", "Export scenarios require an NBS code."),
  rule("E0330", 326, "infDPS.serv.comExt", "Export scenarios require foreign-trade data."),
  rule("E0333", 328, "infDPS.serv.comExt.mdPrestacao", "Service mode 0 is not accepted by SEFIN."),
  rule(
    "E0341",
    332,
    "infDPS.serv.comExt.mecAFComexP",
    "Provider support mechanism 00 is not accepted by SEFIN.",
  ),
  rule(
    "E0343",
    333,
    "infDPS.serv.comExt.mecAFComexT",
    "Customer support mechanism 00 is not accepted by SEFIN.",
  ),
  rule(
    "E0345",
    334,
    "infDPS.serv.comExt.movTempBens",
    "Temporary-goods movement value 0 is not accepted by SEFIN.",
  ),
  rule("E0352", 335, "infDPS.serv.comExt.nDI", "Temporary import mode 2 requires nDI."),
  rule("E0354", 336, "infDPS.serv.comExt.nDI", "Movement mode 1 forbids nDI and nRE."),
  rule("E0356", 338, "infDPS.serv.comExt.nRE", "Temporary export mode 3 requires nRE."),
  rule("E0370", 340, "infDPS.serv.obra", "Construction service codes require work data."),
  rule("E0390", 357, "infDPS.serv.atvEvento", "Item 12 services require event data."),
  rule(
    "E0423",
    384,
    "infDPS.valores.vServPrest.vReceb",
    "Intermediary issuer requires received value.",
  ),
  rule("E0427", 387, "infDPS.valores.vServPrest.vServ", "Reductions cannot exceed service value."),
  rule(
    "E0431",
    391,
    "infDPS.valores.vDescCondIncond.vDescIncond",
    "Discount must be positive and below service value.",
  ),
  rule(
    "E0432",
    392,
    "infDPS.valores.vDescCondIncond.vDescCond",
    "Discount must be positive and below service value.",
  ),
  rule("E0435", 393, "infDPS.valores.vDedRed", "Deductions are limited to taxable ISSQN."),
  rule("E0453", 400, "infDPS.valores.vDedRed.pDR", "Deduction percentage must be in (0, 100]."),
  rule(
    "E0468",
    424,
    "infDPS.valores.vDedRed.documentos.docDedRed.xDescOutDed",
    "Deduction type 99 requires a description.",
  ),
  rule(
    "E0472",
    426,
    "infDPS.valores.vDedRed.documentos.docDedRed.dtEmiDoc",
    "Deduction document cannot follow competence.",
  ),
  rule(
    "E0474",
    428,
    "infDPS.valores.vDedRed.documentos.docDedRed.vDeducaoReducao",
    "Deduction cannot exceed deductible value.",
  ),
  rule(
    "E0477",
    430,
    "infDPS.valores.vDedRed.documentos.docDedRed.fornec",
    "Non-national documents require a supplier.",
  ),
  rule(
    "E0478",
    431,
    "infDPS.valores.vDedRed.documentos.docDedRed.fornec.CNPJ",
    "Supplier CNPJ check digits must be valid.",
  ),
  rule(
    "E0484",
    433,
    "infDPS.valores.vDedRed.documentos.docDedRed.fornec.CPF",
    "Supplier CPF check digits must be valid.",
  ),
  rule(
    "E0592",
    468,
    "infDPS.valores.trib.tribMun.tpImunidade",
    "Immunity type is required only for immunity.",
  ),
  rule(
    "E0585",
    470,
    "infDPS.valores.trib.tribMun.exigSusp",
    "Suspension is limited to taxable ISSQN.",
  ),
  rule(
    "E0580",
    490,
    "infDPS.valores.trib.tribMun.tpRetISSQN",
    "Non-taxable ISSQN cannot be withheld.",
  ),
  rule(
    "E0590",
    466,
    "infDPS.valores.trib.tribMun.cPaisResult",
    "Specified domestic-location export scenarios require a result country.",
  ),
  rule(
    "E0591",
    467,
    "infDPS.valores.trib.tribMun.cPaisResult",
    "Result country is forbidden outside the specified domestic-location export scenarios.",
  ),
  rule("E0595", 501, "infDPS.valores.trib.tribMun.pAliq", "ISSQN rate cannot exceed 5%."),
  rule("E0675", 514, "infDPS.valores.trib.tribFed", "CPF provider cannot submit federal taxes."),
  rule(
    "E0677",
    518,
    "infDPS.valores.trib.tribFed.piscofins.vBCPisCofins",
    "PIS/COFINS base cannot exceed service value.",
  ),
  rule(
    "E0686",
    519,
    "infDPS.valores.trib.tribFed.piscofins.pAliqPis",
    "PIS rate cannot exceed 100%.",
  ),
  rule(
    "E0692",
    520,
    "infDPS.valores.trib.tribFed.piscofins.pAliqCofins",
    "COFINS rate cannot exceed 100%.",
  ),
  rule(
    "E0694",
    521,
    "infDPS.valores.trib.tribFed.piscofins.vPis",
    "PIS value must equal its base multiplied by its rate.",
  ),
  rule(
    "E0696",
    522,
    "infDPS.valores.trib.tribFed.piscofins.vCofins",
    "COFINS value must equal its base multiplied by its rate.",
  ),
  rule(
    "E0699",
    524,
    "infDPS.valores.trib.tribFed.vRetCP",
    "CP retention must be positive and below service value.",
  ),
  rule(
    "E0700",
    525,
    "infDPS.valores.trib.tribFed.vRetIRRF",
    "IRRF retention must be positive and below service value.",
  ),
  rule(
    "E0720",
    526,
    "infDPS.valores.trib.tribFed.vRetCSLL",
    "CSLL cannot be supplied when retention is zero.",
  ),
  rule(
    "E0702",
    531,
    "infDPS.valores.trib.totTrib.vTotTrib.vTotTribFed",
    "Federal total cannot exceed service value.",
  ),
  rule(
    "E0703",
    532,
    "infDPS.valores.trib.totTrib.vTotTrib.vTotTribEst",
    "State total cannot exceed service value.",
  ),
  rule(
    "E0704",
    533,
    "infDPS.valores.trib.totTrib.vTotTrib.vTotTribMun",
    "Municipal total cannot exceed service value.",
  ),
  rule(
    "E0706",
    535,
    "infDPS.valores.trib.totTrib.pTotTrib.pTotTribFed",
    "Federal percentage cannot exceed 100%.",
  ),
  rule(
    "E0707",
    536,
    "infDPS.valores.trib.totTrib.pTotTrib.pTotTribEst",
    "State percentage cannot exceed 100%.",
  ),
  rule(
    "E0708",
    537,
    "infDPS.valores.trib.totTrib.pTotTrib.pTotTribMun",
    "Municipal percentage cannot exceed 100%.",
  ),
  rule(
    "E0712",
    538,
    "infDPS.valores.trib.totTrib.indTotTrib",
    "ME/EPP cannot omit approximate taxes through indTotTrib.",
  ),
  rule("E0850", 542, "infDPS.IBSCBS", "IBS/CBS data is allowed from 2026 onward."),
  rule(
    "E0903",
    547,
    "infDPS.IBSCBS.tpOper",
    "Government and specified services require operation type.",
  ),
  rule("E0905", 549, "infDPS.IBSCBS.gRefNFSe", "Operation types 2 and 3 require references."),
  rule("E0910", 554, "infDPS.IBSCBS.dest", "Destination is permitted only when indDest is 1."),
  rule("E0911", 555, "infDPS.IBSCBS.dest.CNPJ", "Destination CNPJ check digits must be valid."),
  rule("E0913", 557, "infDPS.IBSCBS.dest.CPF", "Destination CPF check digits must be valid."),
  rule("E0931", 579, "infDPS.IBSCBS.imovel", "Construction service codes forbid property data."),
  rule(
    "E0942",
    603,
    "infDPS.IBSCBS.valores.gReeRepRes.documentos.docFiscalOutro",
    "Other fiscal documents are pre-2026 only.",
  ),
  rule(
    "E0945",
    611,
    "infDPS.IBSCBS.valores.gReeRepRes.documentos.fornec.CNPJ",
    "Reimbursement supplier CNPJ must be valid.",
  ),
  rule(
    "E0947",
    613,
    "infDPS.IBSCBS.valores.gReeRepRes.documentos.fornec.CPF",
    "Reimbursement supplier CPF must be valid.",
  ),
  rule(
    "E0950",
    618,
    "infDPS.IBSCBS.valores.gReeRepRes.documentos.dtEmiDoc",
    "Document emission cannot precede competence.",
  ),
  rule(
    "E0952",
    621,
    "infDPS.IBSCBS.valores.gReeRepRes.documentos.xTpReeRepRes",
    "Description is limited to type 99.",
  ),
  rule(
    "E0953",
    622,
    "infDPS.IBSCBS.valores.gReeRepRes.documentos.vlrReeRepRes",
    "Reimbursement cannot exceed service value.",
  ),
] as const;

const RULES_BY_CODE = new Map(NATIONAL_DPS_RULES.map((entry) => [entry.code, entry]));

export function getNationalDpsRule(code: string): NationalDpsRule {
  const entry = RULES_BY_CODE.get(code);
  if (!entry) {
    throw new Error(`Unknown National DPS rule ${code}`);
  }
  return entry;
}
