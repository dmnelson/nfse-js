import { XMLBuilder } from "fast-xml-parser";
import { createDps } from "./create.js";
import { assertValidDps } from "./semantic-validation.js";
import {
  type Address,
  type Construction,
  type DeductionDocument,
  type DeductionReduction,
  type DpsDocument,
  type DpsInfo,
  type DpsInput,
  type EventActivity,
  type FederalTaxId,
  type ForeignTrade,
  type IbsCbs,
  type IbsCbsDeferral,
  type IbsCbsDestination,
  type IbsCbsProperty,
  type IbsCbsRegularTaxation,
  type IbsCbsSupplier,
  type MunicipalNfseReference,
  type MunicipalTax,
  NATIONAL_NFSE_NAMESPACE,
  type NationalFiscalDocumentReference,
  type NonFiscalDocumentReference,
  type OtherFiscalDocumentReference,
  type PaperInvoiceReference,
  type Person,
  type PisCofins,
  type Provider,
  type ReimbursementDocument,
  type SerializeDpsOptions,
  type Service,
  type SimpleAddress,
  type Taxes,
  type TotalTax,
  type Values,
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
      infDPS: serializeDpsInfo(dps.infDPS),
    },
  });

  return options.declaration === false ? xml : `<?xml version="1.0" encoding="UTF-8"?>${xml}`;
}

function serializeDpsInfo(info: DpsInfo) {
  return {
    "@_Id": info.Id,
    tpAmb: info.tpAmb,
    dhEmi: info.dhEmi,
    verAplic: info.verAplic,
    serie: info.serie,
    nDPS: info.nDPS,
    dCompet: info.dCompet,
    tpEmit: info.tpEmit,
    cMotivoEmisTI: info.cMotivoEmisTI,
    chNFSeRej: info.chNFSeRej,
    cLocEmi: info.cLocEmi,
    subst: info.subst
      ? {
          chSubstda: info.subst.chSubstda,
          cMotivo: info.subst.cMotivo,
          xMotivo: info.subst.xMotivo,
        }
      : undefined,
    prest: serializeProvider(info.prest),
    toma: info.toma ? serializePerson(info.toma) : undefined,
    interm: info.interm ? serializePerson(info.interm) : undefined,
    serv: serializeService(info.serv),
    valores: serializeValues(info.valores),
    IBSCBS: info.IBSCBS ? serializeIbsCbs(info.IBSCBS) : undefined,
  };
}

function serializeFederalTaxId(subject: FederalTaxId) {
  return {
    CNPJ: "CNPJ" in subject ? subject.CNPJ : undefined,
    CPF: "CPF" in subject ? subject.CPF : undefined,
    NIF: "NIF" in subject ? subject.NIF : undefined,
    cNaoNIF: "cNaoNIF" in subject ? subject.cNaoNIF : undefined,
  };
}

function serializeProvider(provider: Provider) {
  return {
    ...serializeFederalTaxId(provider),
    CAEPF: provider.CAEPF,
    IM: provider.IM,
    xNome: provider.xNome,
    end: provider.end ? serializeAddress(provider.end) : undefined,
    fone: provider.fone,
    email: provider.email,
    regTrib: {
      opSimpNac: provider.regTrib.opSimpNac,
      regApTribSN: provider.regTrib.regApTribSN,
      regEspTrib: provider.regTrib.regEspTrib,
    },
  };
}

function serializePerson(person: Person) {
  return {
    ...serializeFederalTaxId(person),
    CAEPF: person.CAEPF,
    IM: person.IM,
    xNome: person.xNome,
    end: person.end ? serializeAddress(person.end) : undefined,
    fone: person.fone,
    email: person.email,
  };
}

function serializeAddress(address: Address) {
  return {
    endNac:
      "endNac" in address
        ? {
            cMun: address.endNac.cMun,
            CEP: address.endNac.CEP,
          }
        : undefined,
    endExt:
      "endExt" in address
        ? {
            cPais: address.endExt.cPais,
            cEndPost: address.endExt.cEndPost,
            xCidade: address.endExt.xCidade,
            xEstProvReg: address.endExt.xEstProvReg,
          }
        : undefined,
    xLgr: address.xLgr,
    nro: address.nro,
    xCpl: address.xCpl,
    xBairro: address.xBairro,
  };
}

function serializeSimpleAddress(address: SimpleAddress) {
  return {
    CEP: "CEP" in address ? address.CEP : undefined,
    endExt:
      "endExt" in address
        ? {
            cEndPost: address.endExt.cEndPost,
            xCidade: address.endExt.xCidade,
            xEstProvReg: address.endExt.xEstProvReg,
          }
        : undefined,
    xLgr: address.xLgr,
    nro: address.nro,
    xCpl: address.xCpl,
    xBairro: address.xBairro,
  };
}

function serializeService(service: Service) {
  return {
    locPrest: {
      cLocPrestacao:
        "cLocPrestacao" in service.locPrest ? service.locPrest.cLocPrestacao : undefined,
      cPaisPrestacao:
        "cPaisPrestacao" in service.locPrest ? service.locPrest.cPaisPrestacao : undefined,
    },
    cServ: {
      cTribNac: service.cServ.cTribNac,
      cTribMun: service.cServ.cTribMun,
      xDescServ: service.cServ.xDescServ,
      cNBS: service.cServ.cNBS,
      cIntContrib: service.cServ.cIntContrib,
    },
    comExt: service.comExt ? serializeForeignTrade(service.comExt) : undefined,
    obra: service.obra ? serializeConstruction(service.obra) : undefined,
    atvEvento: service.atvEvento ? serializeEventActivity(service.atvEvento) : undefined,
    infoCompl: service.infoCompl
      ? {
          idDocTec: service.infoCompl.idDocTec,
          docRef: service.infoCompl.docRef,
          xPed: service.infoCompl.xPed,
          gItemPed: service.infoCompl.gItemPed
            ? { xItemPed: service.infoCompl.gItemPed.xItemPed }
            : undefined,
          xInfComp: service.infoCompl.xInfComp,
        }
      : undefined,
  };
}

function serializeForeignTrade(foreignTrade: ForeignTrade) {
  return {
    mdPrestacao: foreignTrade.mdPrestacao,
    vincPrest: foreignTrade.vincPrest,
    tpMoeda: foreignTrade.tpMoeda,
    vServMoeda: foreignTrade.vServMoeda,
    mecAFComexP: foreignTrade.mecAFComexP,
    mecAFComexT: foreignTrade.mecAFComexT,
    movTempBens: foreignTrade.movTempBens,
    nDI: foreignTrade.nDI,
    nRE: foreignTrade.nRE,
    mdic: foreignTrade.mdic,
  };
}

function serializeConstruction(construction: Construction) {
  return {
    inscImobFisc: construction.inscImobFisc,
    cObra: "cObra" in construction ? construction.cObra : undefined,
    cCIB: "cCIB" in construction ? construction.cCIB : undefined,
    end: "end" in construction ? serializeSimpleAddress(construction.end) : undefined,
  };
}

function serializeEventActivity(activity: EventActivity) {
  return {
    xNome: activity.xNome,
    dtIni: activity.dtIni,
    dtFim: activity.dtFim,
    idAtvEvt: "idAtvEvt" in activity ? activity.idAtvEvt : undefined,
    end: "end" in activity ? serializeSimpleAddress(activity.end) : undefined,
  };
}

function serializeValues(values: Values) {
  return {
    vServPrest: {
      vReceb: values.vServPrest.vReceb,
      vServ: values.vServPrest.vServ,
    },
    vDescCondIncond: values.vDescCondIncond
      ? {
          vDescIncond: values.vDescCondIncond.vDescIncond,
          vDescCond: values.vDescCondIncond.vDescCond,
        }
      : undefined,
    vDedRed: values.vDedRed ? serializeDeductionReduction(values.vDedRed) : undefined,
    trib: serializeTaxes(values.trib),
  };
}

function serializeDeductionReduction(deduction: DeductionReduction) {
  return {
    pDR: "pDR" in deduction ? deduction.pDR : undefined,
    vDR: "vDR" in deduction ? deduction.vDR : undefined,
    documentos:
      "documentos" in deduction
        ? {
            docDedRed: deduction.documentos.docDedRed.map(serializeDeductionDocument),
          }
        : undefined,
  };
}

function serializeDeductionDocument(document: DeductionDocument) {
  return {
    chNFSe: "chNFSe" in document ? document.chNFSe : undefined,
    chNFe: "chNFe" in document ? document.chNFe : undefined,
    NFSeMun: "NFSeMun" in document ? serializeMunicipalNfseReference(document.NFSeMun) : undefined,
    NFNFS: "NFNFS" in document ? serializePaperInvoiceReference(document.NFNFS) : undefined,
    nDocFisc: "nDocFisc" in document ? document.nDocFisc : undefined,
    nDoc: "nDoc" in document ? document.nDoc : undefined,
    tpDedRed: document.tpDedRed,
    xDescOutDed: document.xDescOutDed,
    dtEmiDoc: document.dtEmiDoc,
    vDedutivelRedutivel: document.vDedutivelRedutivel,
    vDeducaoReducao: document.vDeducaoReducao,
    fornec: document.fornec ? serializePerson(document.fornec) : undefined,
  };
}

function serializeMunicipalNfseReference(reference: MunicipalNfseReference) {
  return {
    cMunNFSeMun: reference.cMunNFSeMun,
    nNFSeMun: reference.nNFSeMun,
    cVerifNFSeMun: reference.cVerifNFSeMun,
  };
}

function serializePaperInvoiceReference(reference: PaperInvoiceReference) {
  return {
    nNFS: reference.nNFS,
    modNFS: reference.modNFS,
    serieNFS: reference.serieNFS,
  };
}

function serializeTaxes(taxes: Taxes) {
  return {
    tribMun: serializeMunicipalTax(taxes.tribMun),
    tribFed: taxes.tribFed
      ? {
          piscofins: taxes.tribFed.piscofins
            ? serializePisCofins(taxes.tribFed.piscofins)
            : undefined,
          vRetCP: taxes.tribFed.vRetCP,
          vRetIRRF: taxes.tribFed.vRetIRRF,
          vRetCSLL: taxes.tribFed.vRetCSLL,
        }
      : undefined,
    totTrib: serializeTotalTax(taxes.totTrib),
  };
}

function serializeMunicipalTax(tax: MunicipalTax) {
  return {
    tribISSQN: tax.tribISSQN,
    cPaisResult: tax.cPaisResult,
    tpImunidade: tax.tpImunidade,
    exigSusp: tax.exigSusp
      ? {
          tpSusp: tax.exigSusp.tpSusp,
          nProcesso: tax.exigSusp.nProcesso,
        }
      : undefined,
    BM: tax.BM
      ? {
          nBM: tax.BM.nBM,
          vRedBCBM: tax.BM.vRedBCBM,
          pRedBCBM: tax.BM.pRedBCBM,
        }
      : undefined,
    tpRetISSQN: tax.tpRetISSQN,
    pAliq: tax.pAliq,
  };
}

function serializePisCofins(tax: PisCofins) {
  return {
    CST: tax.CST,
    vBCPisCofins: tax.vBCPisCofins,
    pAliqPis: tax.pAliqPis,
    pAliqCofins: tax.pAliqCofins,
    vPis: tax.vPis,
    vCofins: tax.vCofins,
    tpRetPisCofins: tax.tpRetPisCofins,
  };
}

function serializeTotalTax(tax: TotalTax) {
  if ("vTotTrib" in tax) {
    return {
      vTotTrib: {
        vTotTribFed: tax.vTotTrib.vTotTribFed,
        vTotTribEst: tax.vTotTrib.vTotTribEst,
        vTotTribMun: tax.vTotTrib.vTotTribMun,
      },
    };
  }
  if ("pTotTrib" in tax) {
    return {
      pTotTrib: {
        pTotTribFed: tax.pTotTrib.pTotTribFed,
        pTotTribEst: tax.pTotTrib.pTotTribEst,
        pTotTribMun: tax.pTotTrib.pTotTribMun,
      },
    };
  }
  if ("indTotTrib" in tax) {
    return { indTotTrib: tax.indTotTrib };
  }
  return { pTotTribSN: tax.pTotTribSN };
}

function serializeIbsCbs(ibsCbs: IbsCbs) {
  return {
    finNFSe: ibsCbs.finNFSe,
    indFinal: ibsCbs.indFinal,
    cIndOp: ibsCbs.cIndOp,
    tpOper: ibsCbs.tpOper,
    gRefNFSe: ibsCbs.gRefNFSe ? { refNFSe: ibsCbs.gRefNFSe.refNFSe } : undefined,
    tpEnteGov: ibsCbs.tpEnteGov,
    indDest: ibsCbs.indDest,
    dest: ibsCbs.dest ? serializeIbsCbsDestination(ibsCbs.dest) : undefined,
    imovel: ibsCbs.imovel ? serializeIbsCbsProperty(ibsCbs.imovel) : undefined,
    valores: {
      gReeRepRes: ibsCbs.valores.gReeRepRes
        ? {
            documentos: ibsCbs.valores.gReeRepRes.documentos.map(serializeReimbursementDocument),
          }
        : undefined,
      trib: {
        gIBSCBS: {
          CST: ibsCbs.valores.trib.gIBSCBS.CST,
          cClassTrib: ibsCbs.valores.trib.gIBSCBS.cClassTrib,
          cCredPres: ibsCbs.valores.trib.gIBSCBS.cCredPres,
          gTribRegular: ibsCbs.valores.trib.gIBSCBS.gTribRegular
            ? serializeIbsCbsRegularTaxation(ibsCbs.valores.trib.gIBSCBS.gTribRegular)
            : undefined,
          gDif: ibsCbs.valores.trib.gIBSCBS.gDif
            ? serializeIbsCbsDeferral(ibsCbs.valores.trib.gIBSCBS.gDif)
            : undefined,
        },
      },
    },
  };
}

function serializeIbsCbsDestination(destination: IbsCbsDestination) {
  return {
    ...serializeFederalTaxId(destination),
    xNome: destination.xNome,
    end: destination.end ? serializeAddress(destination.end) : undefined,
    fone: destination.fone,
    email: destination.email,
  };
}

function serializeIbsCbsProperty(property: IbsCbsProperty) {
  return {
    inscImobFisc: property.inscImobFisc,
    cCIB: "cCIB" in property ? property.cCIB : undefined,
    end: "end" in property ? serializeSimpleAddress(property.end) : undefined,
  };
}

function serializeReimbursementDocument(document: ReimbursementDocument) {
  return {
    dFeNacional:
      "dFeNacional" in document
        ? serializeNationalFiscalDocumentReference(document.dFeNacional)
        : undefined,
    docFiscalOutro:
      "docFiscalOutro" in document
        ? serializeOtherFiscalDocumentReference(document.docFiscalOutro)
        : undefined,
    docOutro:
      "docOutro" in document ? serializeNonFiscalDocumentReference(document.docOutro) : undefined,
    fornec: document.fornec ? serializeIbsCbsSupplier(document.fornec) : undefined,
    dtEmiDoc: document.dtEmiDoc,
    dtCompDoc: document.dtCompDoc,
    tpReeRepRes: document.tpReeRepRes,
    xTpReeRepRes: document.xTpReeRepRes,
    vlrReeRepRes: document.vlrReeRepRes,
  };
}

function serializeNationalFiscalDocumentReference(reference: NationalFiscalDocumentReference) {
  return {
    tipoChaveDFe: reference.tipoChaveDFe,
    xTipoChaveDFe: reference.xTipoChaveDFe,
    chaveDFe: reference.chaveDFe,
  };
}

function serializeOtherFiscalDocumentReference(reference: OtherFiscalDocumentReference) {
  return {
    cMunDocFiscal: reference.cMunDocFiscal,
    nDocFiscal: reference.nDocFiscal,
    xDocFiscal: reference.xDocFiscal,
  };
}

function serializeNonFiscalDocumentReference(reference: NonFiscalDocumentReference) {
  return {
    nDoc: reference.nDoc,
    xDoc: reference.xDoc,
  };
}

function serializeIbsCbsSupplier(supplier: IbsCbsSupplier) {
  return {
    ...serializeFederalTaxId(supplier),
    xNome: supplier.xNome,
  };
}

function serializeIbsCbsRegularTaxation(taxation: IbsCbsRegularTaxation) {
  return {
    CSTReg: taxation.CSTReg,
    cClassTribReg: taxation.cClassTribReg,
  };
}

function serializeIbsCbsDeferral(deferral: IbsCbsDeferral) {
  return {
    pDifUF: deferral.pDifUF,
    pDifMun: deferral.pDifMun,
    pDifCBS: deferral.pDifCBS,
  };
}
