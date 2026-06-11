import { createDps, type DpsDocument, type DpsInput, decimal } from "../src/core/index.js";

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
