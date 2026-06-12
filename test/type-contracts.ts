import {
  type Construction,
  type Decimal2V2,
  type Decimal3V2,
  type Decimal15V2,
  type DeductionReduction,
  decimal,
  type FederalTaxId,
  type MunicipalBenefit,
  type ReimbursementDocumentReference,
  type ServiceLocation,
  type SimpleAddress,
  type TotalTax,
} from "../src/core/index.js";
import type { EventRequestPayload } from "../src/events/index.js";

function assertTypeContracts(): void {
  const money = "" as Decimal15V2;
  const simplePercentage = "" as Decimal2V2;
  const percentage = "" as Decimal3V2;

  const validBenefit: MunicipalBenefit = { nBM: "1", vRedBCBM: money };
  const validConstruction: Construction = { cCIB: "12345678" };
  const validDeduction: DeductionReduction = { pDR: percentage };
  const validIdentity: FederalTaxId = { CNPJ: "12345678000195" };
  const validLocation: ServiceLocation = { cPaisPrestacao: "US" };
  const validReference: ReimbursementDocumentReference = {
    docOutro: { nDoc: "1", xDoc: "Document" },
  };
  const validSimpleAddress: SimpleAddress = {
    CEP: "01001000",
    xLgr: "Street",
    nro: "1",
    xBairro: "Centre",
  };
  const validTotal: TotalTax = { pTotTribSN: simplePercentage };
  const validEvent: EventRequestPayload = {
    code: "e101101",
    cMotivo: "1",
    xMotivo: "Documento emitido incorretamente",
  };

  // @ts-expect-error XSD choice permits only one municipal benefit reduction.
  const invalidBenefit: MunicipalBenefit = {
    nBM: "1",
    vRedBCBM: money,
    pRedBCBM: percentage,
  };
  // @ts-expect-error XSD choice permits only one construction identifier.
  const invalidConstruction: Construction = { cObra: "1", cCIB: "12345678" };
  // @ts-expect-error XSD choice permits only one deduction form.
  const invalidDeduction: DeductionReduction = { pDR: percentage, vDR: money };
  // @ts-expect-error A federal identity cannot contain both CNPJ and CPF.
  const invalidIdentity: FederalTaxId = { CNPJ: "1", CPF: "2" };
  // @ts-expect-error Service location is either domestic or foreign.
  const invalidLocation: ServiceLocation = { cLocPrestacao: "1", cPaisPrestacao: "US" };
  // @ts-expect-error Reimbursement documents have one reference form.
  const invalidReference: ReimbursementDocumentReference = {
    docOutro: { nDoc: "1", xDoc: "Document" },
    docFiscalOutro: { cMunDocFiscal: "1", nDocFiscal: "2", xDocFiscal: "Document" },
  };
  // @ts-expect-error A simple address cannot contain domestic and foreign postal forms.
  const invalidSimpleAddress: SimpleAddress = {
    CEP: "01001000",
    endExt: { cEndPost: "1", xCidade: "City", xEstProvReg: "Region" },
    xLgr: "Street",
    nro: "1",
    xBairro: "Centre",
  };
  // @ts-expect-error Approximate total tax alternatives are mutually exclusive.
  const invalidTotal: TotalTax = {
    indTotTrib: "0",
    pTotTribSN: simplePercentage,
  };
  // @ts-expect-error TSDec15V2 values are not percentage values.
  const invalidDecimal: Decimal3V2 = money;
  // @ts-expect-error Custom-precision decimals cannot be assigned to an XSD fiscal field.
  const invalidCustomDecimal: Decimal15V2 = decimal("1", {
    integerDigits: 1,
    fractionDigits: 0,
  });
  const invalidEvent: EventRequestPayload = {
    code: "e202201",
    // @ts-expect-error Event payload fields are selected by the event code.
    cMotivo: "1",
  };

  void [
    validBenefit,
    validConstruction,
    validDeduction,
    validIdentity,
    validLocation,
    validReference,
    validSimpleAddress,
    validTotal,
    validEvent,
    invalidBenefit,
    invalidConstruction,
    invalidDeduction,
    invalidIdentity,
    invalidLocation,
    invalidReference,
    invalidSimpleAddress,
    invalidTotal,
    invalidDecimal,
    invalidCustomDecimal,
    invalidEvent,
  ];
}

void assertTypeContracts;
