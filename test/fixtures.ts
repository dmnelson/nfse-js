import {
  createDps,
  type DeductionDocument,
  type DpsDocument,
  type DpsInput,
  decimal,
  decimal1v2,
  decimal2v2,
  decimal3v2,
  decimal15v2,
  type ReimbursementDocument,
} from "../src/core/index.js";

export function validDpsInput(): DpsInput {
  return {
    infDPS: {
      tpAmb: "2",
      dhEmi: "2026-06-11T10:30:00+01:00",
      verAplic: "nfse-js-test",
      serie: "1",
      nDPS: "1",
      dCompet: "2026-06-11",
      tpEmit: "1",
      cLocEmi: "3550308",
      prest: {
        CNPJ: "12345678000195",
        xNome: "Example Services Ltda",
        regTrib: {
          opSimpNac: "1",
          regEspTrib: "0",
        },
      },
      toma: {
        CPF: "12345678909",
        xNome: "Example Customer",
      },
      serv: {
        locPrest: {
          cLocPrestacao: "3550308",
        },
        cServ: {
          cTribNac: "010101",
          xDescServ: "Software consulting",
        },
      },
      valores: {
        vServPrest: {
          vServ: decimal("100.00"),
        },
        trib: {
          tribMun: {
            tribISSQN: "1",
            tpRetISSQN: "1",
          },
          totTrib: {
            indTotTrib: "0",
          },
        },
      },
    },
  };
}

export function validDps(): DpsDocument {
  return createDps(validDpsInput());
}

export interface NamedDpsFixture {
  readonly name: string;
  readonly input: DpsInput;
}

export function schemaCoverageDpsInputs(): readonly NamedDpsFixture[] {
  const base = validDpsInput();

  return [
    { name: "common", input: base },
    { name: "specialized groups", input: specializedGroupsInput(base) },
    {
      name: "construction CIB",
      input: withService(base, {
        ...base.infDPS.serv,
        obra: {
          inscImobFisc: "PROPERTY-1",
          cCIB: "12345678",
        },
      }),
    },
    {
      name: "construction foreign address",
      input: withService(base, {
        ...base.infDPS.serv,
        obra: {
          end: foreignSimpleAddress(),
        },
      }),
    },
    {
      name: "event domestic address",
      input: withService(base, {
        ...base.infDPS.serv,
        atvEvento: {
          xNome: "Technology conference",
          dtIni: "2026-06-11",
          dtFim: "2026-06-12",
          end: domesticSimpleAddress(),
        },
      }),
    },
    {
      name: "deduction percentage",
      input: withValues(base, {
        ...base.infDPS.valores,
        vDedRed: { pDR: decimal3v2("10.00") },
      }),
    },
    {
      name: "deduction value",
      input: withValues(base, {
        ...base.infDPS.valores,
        vDedRed: { vDR: decimal15v2("10.00") },
      }),
    },
    {
      name: "municipal benefit without reduction",
      input: withMunicipalTax(base, {
        ...base.infDPS.valores.trib.tribMun,
        BM: { nBM: "35503080400001" },
      }),
    },
    {
      name: "suspended enforceability",
      input: withMunicipalTax(base, {
        ...base.infDPS.valores.trib.tribMun,
        exigSusp: {
          tpSusp: "1",
          nProcesso: "1".repeat(30),
        },
        pAliq: decimal1v2("5.00"),
      }),
    },
    {
      name: "municipal benefit value reduction",
      input: withMunicipalTax(base, {
        ...base.infDPS.valores.trib.tribMun,
        BM: {
          nBM: "35503080400001",
          vRedBCBM: decimal15v2("10.00"),
        },
      }),
    },
    {
      name: "municipal benefit percentage reduction",
      input: withMunicipalTax(base, {
        ...base.infDPS.valores.trib.tribMun,
        BM: {
          nBM: "35503080400001",
          pRedBCBM: decimal3v2("10.00"),
        },
      }),
    },
    {
      name: "monetary approximate taxes",
      input: withTotalTax(base, {
        vTotTrib: {
          vTotTribFed: decimal15v2("1.00"),
          vTotTribEst: decimal15v2("2.00"),
          vTotTribMun: decimal15v2("3.00"),
        },
      }),
    },
    {
      name: "percentage approximate taxes",
      input: withTotalTax(base, {
        pTotTrib: {
          pTotTribFed: decimal3v2("1.00"),
          pTotTribEst: decimal3v2("2.00"),
          pTotTribMun: decimal3v2("3.00"),
        },
      }),
    },
    {
      name: "Simples Nacional approximate taxes",
      input: withTotalTax(base, {
        pTotTribSN: decimal2v2("6.00"),
      }),
    },
    {
      name: "IBS/CBS property address",
      input: withIbsCbs(base, {
        finNFSe: "0",
        cIndOp: "100101",
        indDest: "0",
        imovel: {
          inscImobFisc: "PROPERTY-2",
          end: domesticSimpleAddress(),
        },
        valores: {
          trib: {
            gIBSCBS: {
              CST: "000",
              cClassTrib: "000001",
            },
          },
        },
      }),
    },
  ];
}

function specializedGroupsInput(base: DpsInput): DpsInput {
  return {
    ...base,
    infDPS: {
      ...base.infDPS,
      subst: {
        chSubstda: "9".repeat(50),
        cMotivo: "99",
        xMotivo: "Schema coverage substitution",
      },
      prest: {
        ...base.infDPS.prest,
        CAEPF: "1".repeat(14),
        IM: "12345",
        end: {
          endNac: {
            cMun: "3550308",
            CEP: "01001000",
          },
          xLgr: "Praca da Se",
          nro: "1",
          xCpl: "Suite 1",
          xBairro: "Se",
        },
        fone: "1130000000",
        email: "provider@example.com",
        regTrib: {
          opSimpNac: "3",
          regApTribSN: "1",
          regEspTrib: "0",
        },
      },
      interm: {
        cNaoNIF: "2",
        xNome: "Foreign intermediary",
        fone: "442000000000",
        email: "intermediary@example.com",
      },
      serv: {
        ...base.infDPS.serv,
        locPrest: { cPaisPrestacao: "US" },
        cServ: {
          ...base.infDPS.serv.cServ,
          cTribMun: "001",
          cNBS: "123456789",
          cIntContrib: "SERVICE1",
        },
        comExt: {
          mdPrestacao: "1",
          vincPrest: "0",
          tpMoeda: "220",
          vServMoeda: decimal15v2("100.00"),
          mecAFComexP: "01",
          mecAFComexT: "01",
          movTempBens: "1",
          nDI: "DI123",
          nRE: "RE123",
          mdic: "1",
        },
        obra: {
          inscImobFisc: "PROPERTY-1",
          cObra: "CNO-123",
        },
        atvEvento: {
          xNome: "Technology conference",
          dtIni: "2026-06-11",
          dtFim: "2026-06-12",
          idAtvEvt: "EVENT-123",
        },
        infoCompl: {
          idDocTec: "ART-123",
          docRef: "CONTRACT-123",
          xPed: "ORDER-123",
          gItemPed: {
            xItemPed: ["ITEM-1", "ITEM-2"],
          },
          xInfComp: "Schema coverage fixture",
        },
      },
      valores: {
        ...base.infDPS.valores,
        vServPrest: {
          vReceb: decimal15v2("100.00"),
          vServ: base.infDPS.valores.vServPrest.vServ,
        },
        vDescCondIncond: {
          vDescIncond: decimal15v2("1.00"),
          vDescCond: decimal15v2("2.00"),
        },
        vDedRed: {
          documentos: {
            docDedRed: deductionDocuments(),
          },
        },
        trib: {
          tribMun: {
            tribISSQN: "3",
            cPaisResult: "US",
            tpRetISSQN: "1",
          },
          tribFed: {
            piscofins: {
              CST: "01",
              vBCPisCofins: decimal15v2("100.00"),
              pAliqPis: decimal2v2("1.00"),
              pAliqCofins: decimal2v2("2.00"),
              vPis: decimal15v2("1.00"),
              vCofins: decimal15v2("2.00"),
              tpRetPisCofins: "0",
            },
            vRetCP: decimal15v2("1.00"),
            vRetIRRF: decimal15v2("1.00"),
            vRetCSLL: decimal15v2("1.00"),
          },
          totTrib: {
            indTotTrib: "0",
          },
        },
      },
      IBSCBS: {
        finNFSe: "0",
        indFinal: "1",
        cIndOp: "100101",
        tpOper: "1",
        gRefNFSe: {
          refNFSe: ["1".repeat(50), "2".repeat(50)],
        },
        tpEnteGov: "1",
        indDest: "1",
        dest: {
          NIF: "GB123",
          xNome: "Foreign destination",
          end: {
            endExt: {
              cPais: "GB",
              cEndPost: "SW1A1AA",
              xCidade: "London",
              xEstProvReg: "London",
            },
            xLgr: "Parliament Square",
            nro: "1",
            xBairro: "Westminster",
          },
        },
        imovel: {
          cCIB: "12345678",
        },
        valores: {
          gReeRepRes: {
            documentos: reimbursementDocuments(),
          },
          trib: {
            gIBSCBS: {
              CST: "000",
              cClassTrib: "000001",
              cCredPres: "01",
              gTribRegular: {
                CSTReg: "000",
                cClassTribReg: "000001",
              },
              gDif: {
                pDifUF: decimal3v2("1.00"),
                pDifMun: decimal3v2("2.00"),
                pDifCBS: decimal3v2("3.00"),
              },
            },
          },
        },
      },
    },
  };
}

function deductionDocuments(): readonly DeductionDocument[] {
  const common = {
    tpDedRed: "1" as const,
    dtEmiDoc: "2026-06-01",
    vDedutivelRedutivel: decimal15v2("10.00"),
    vDeducaoReducao: decimal15v2("5.00"),
  };

  return [
    { ...common, chNFSe: "1".repeat(50) },
    { ...common, chNFe: "2".repeat(44) },
    {
      ...common,
      NFSeMun: {
        cMunNFSeMun: "3550308",
        nNFSeMun: "1".repeat(15),
        cVerifNFSeMun: "ABC123",
      },
    },
    {
      ...common,
      NFNFS: {
        nNFS: "1".repeat(7),
        modNFS: "2".repeat(15),
        serieNFS: "SERIE1",
      },
    },
    { ...common, nDocFisc: "FISCAL-1" },
    {
      ...common,
      nDoc: "NON-FISCAL-1",
      tpDedRed: "99",
      xDescOutDed: "Other documented deduction",
      fornec: {
        NIF: "GB456",
        xNome: "Foreign supplier",
      },
    },
  ];
}

function reimbursementDocuments(): readonly ReimbursementDocument[] {
  const common = {
    dtEmiDoc: "2026-06-01",
    dtCompDoc: "2026-06-01",
    vlrReeRepRes: decimal15v2("5.00"),
  };

  return [
    {
      ...common,
      dFeNacional: {
        tipoChaveDFe: "9",
        xTipoChaveDFe: "Other national electronic document",
        chaveDFe: "DFe-123",
      },
      fornec: {
        cNaoNIF: "2",
        xNome: "Unregistered supplier",
      },
      tpReeRepRes: "99",
      xTpReeRepRes: "Other reimbursement",
    },
    {
      ...common,
      docFiscalOutro: {
        cMunDocFiscal: "3550308",
        nDocFiscal: "FISCAL-2",
        xDocFiscal: "Other fiscal document",
      },
      fornec: {
        CNPJ: "12345678000195",
        xNome: "Brazilian supplier",
      },
      tpReeRepRes: "01",
    },
    {
      ...common,
      docOutro: {
        nDoc: "NON-FISCAL-2",
        xDoc: "Other non-fiscal document",
      },
      fornec: {
        CPF: "12345678909",
        xNome: "Individual supplier",
      },
      tpReeRepRes: "02",
    },
  ];
}

function domesticSimpleAddress() {
  return {
    CEP: "01001000",
    xLgr: "Praca da Se",
    nro: "1",
    xBairro: "Se",
  } as const;
}

function foreignSimpleAddress() {
  return {
    endExt: {
      cEndPost: "SW1A1AA",
      xCidade: "London",
      xEstProvReg: "London",
    },
    xLgr: "Parliament Square",
    nro: "1",
    xBairro: "Westminster",
  } as const;
}

function withService(base: DpsInput, serv: DpsInput["infDPS"]["serv"]): DpsInput {
  return {
    ...base,
    infDPS: {
      ...base.infDPS,
      serv,
    },
  };
}

function withValues(base: DpsInput, valores: DpsInput["infDPS"]["valores"]): DpsInput {
  return {
    ...base,
    infDPS: {
      ...base.infDPS,
      valores,
    },
  };
}

function withMunicipalTax(
  base: DpsInput,
  tribMun: DpsInput["infDPS"]["valores"]["trib"]["tribMun"],
): DpsInput {
  return withValues(base, {
    ...base.infDPS.valores,
    trib: {
      ...base.infDPS.valores.trib,
      tribMun,
    },
  });
}

function withTotalTax(
  base: DpsInput,
  totTrib: DpsInput["infDPS"]["valores"]["trib"]["totTrib"],
): DpsInput {
  return withValues(base, {
    ...base.infDPS.valores,
    trib: {
      ...base.infDPS.valores.trib,
      totTrib,
    },
  });
}

function withIbsCbs(base: DpsInput, IBSCBS: NonNullable<DpsInput["infDPS"]["IBSCBS"]>): DpsInput {
  return {
    ...base,
    infDPS: {
      ...base.infDPS,
      IBSCBS,
    },
  };
}
