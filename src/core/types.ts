export const NATIONAL_NFSE_NAMESPACE = "http://www.sped.fazenda.gov.br/nfse";
export const NATIONAL_NFSE_VERSION = "1.01";

export type Environment = "1" | "2";
export type DpsIssuer = "1" | "2" | "3";
export type NonNifReason = "0" | "1" | "2";
export type SimplesNacionalStatus = "1" | "2" | "3";
export type SimplesNacionalAssessment = "1" | "2" | "3";
export type SpecialTaxRegime = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "9";
export type IssqnTaxation = "1" | "2" | "3" | "4";
export type IssqnWithholding = "1" | "2" | "3";

/**
 * A base-10 value serialized verbatim. Use the matching decimal constructor
 * for the XSD type assigned to a field.
 */
export type Decimal<Schema extends string = "TSDec15V2"> = string & {
  readonly __decimalBrand: Schema;
};
export type Decimal15V2 = Decimal<"TSDec15V2">;
export type Decimal3V2 = Decimal<"TSDec3V2">;
export type Decimal2V2 = Decimal<"TSDec2V2">;
export type Decimal1V2 = Decimal<"TSDec1V2">;

export type FederalTaxId =
  | { readonly CNPJ: string; readonly CPF?: never; readonly NIF?: never; readonly cNaoNIF?: never }
  | { readonly CPF: string; readonly CNPJ?: never; readonly NIF?: never; readonly cNaoNIF?: never }
  | { readonly NIF: string; readonly CNPJ?: never; readonly CPF?: never; readonly cNaoNIF?: never }
  | {
      readonly cNaoNIF: NonNifReason;
      readonly CNPJ?: never;
      readonly CPF?: never;
      readonly NIF?: never;
    };

export interface DomesticAddressDetails {
  readonly cMun: string;
  readonly CEP: string;
}

export interface ForeignAddressDetails {
  readonly cPais: string;
  readonly cEndPost: string;
  readonly xCidade: string;
  readonly xEstProvReg: string;
}

export interface DomesticAddress {
  readonly endNac: DomesticAddressDetails;
  readonly endExt?: never;
  readonly xLgr: string;
  readonly nro: string;
  readonly xCpl?: string;
  readonly xBairro: string;
}

export interface ForeignAddress {
  readonly endExt: ForeignAddressDetails;
  readonly endNac?: never;
  readonly xLgr: string;
  readonly nro: string;
  readonly xCpl?: string;
  readonly xBairro: string;
}

export type Address = DomesticAddress | ForeignAddress;

export interface TaxRegime {
  readonly opSimpNac: SimplesNacionalStatus;
  readonly regApTribSN?: SimplesNacionalAssessment;
  readonly regEspTrib: SpecialTaxRegime;
}

export type Provider = FederalTaxId & {
  readonly CAEPF?: string;
  readonly IM?: string;
  readonly xNome?: string;
  readonly end?: Address;
  readonly fone?: string;
  readonly email?: string;
  readonly regTrib: TaxRegime;
};

export type Person = FederalTaxId & {
  readonly CAEPF?: string;
  readonly IM?: string;
  readonly xNome: string;
  readonly end?: Address;
  readonly fone?: string;
  readonly email?: string;
};

export type ServiceLocation =
  | { readonly cLocPrestacao: string; readonly cPaisPrestacao?: never }
  | { readonly cPaisPrestacao: string; readonly cLocPrestacao?: never };

export interface ServiceCode {
  readonly cTribNac: string;
  readonly cTribMun?: string;
  readonly xDescServ: string;
  readonly cNBS?: string;
  readonly cIntContrib?: string;
}

export type ForeignTradeServiceMode = "0" | "1" | "2" | "3" | "4";
export type ForeignTradeRelationship = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "9";
export type ForeignTradeProviderSupport =
  | "00"
  | "01"
  | "02"
  | "03"
  | "04"
  | "05"
  | "06"
  | "07"
  | "08";
export type ForeignTradeCustomerSupport =
  | ForeignTradeProviderSupport
  | "09"
  | "10"
  | "11"
  | "12"
  | "13"
  | "14"
  | "15"
  | "16"
  | "17"
  | "18"
  | "19"
  | "20"
  | "21"
  | "22"
  | "23"
  | "24"
  | "25"
  | "26";
export type TemporaryGoodsMovement = "0" | "1" | "2" | "3";

export interface ForeignTrade {
  readonly mdPrestacao: ForeignTradeServiceMode;
  readonly vincPrest: ForeignTradeRelationship;
  readonly tpMoeda: string;
  readonly vServMoeda: Decimal15V2;
  readonly mecAFComexP: ForeignTradeProviderSupport;
  readonly mecAFComexT: ForeignTradeCustomerSupport;
  readonly movTempBens: TemporaryGoodsMovement;
  readonly nDI?: string;
  readonly nRE?: string;
  readonly mdic: "0" | "1";
}

export interface ForeignSimpleAddress {
  readonly cEndPost: string;
  readonly xCidade: string;
  readonly xEstProvReg: string;
}

interface SimpleAddressFields {
  readonly xLgr: string;
  readonly nro: string;
  readonly xCpl?: string;
  readonly xBairro: string;
}

export type SimpleAddress = SimpleAddressFields &
  (
    | { readonly CEP: string; readonly endExt?: never }
    | { readonly endExt: ForeignSimpleAddress; readonly CEP?: never }
  );

export type ConstructionEventAddress = SimpleAddress;

export type EventActivity = {
  readonly xNome: string;
  readonly dtIni: string;
  readonly dtFim: string;
} & (
  | { readonly idAtvEvt: string; readonly end?: never }
  | { readonly end: SimpleAddress; readonly idAtvEvt?: never }
);

export type Construction = {
  readonly inscImobFisc?: string;
} & (
  | {
      readonly cObra: string;
      readonly cCIB?: never;
      readonly end?: never;
    }
  | {
      readonly cCIB: string;
      readonly cObra?: never;
      readonly end?: never;
    }
  | {
      readonly end: SimpleAddress;
      readonly cObra?: never;
      readonly cCIB?: never;
    }
);

export interface OrderItemList {
  readonly xItemPed: readonly string[];
}

export interface ComplementaryServiceInformation {
  readonly idDocTec?: string;
  readonly docRef?: string;
  readonly xPed?: string;
  readonly gItemPed?: OrderItemList;
  readonly xInfComp?: string;
}

export interface Service {
  readonly locPrest: ServiceLocation;
  readonly cServ: ServiceCode;
  readonly comExt?: ForeignTrade;
  readonly obra?: Construction;
  readonly atvEvento?: EventActivity;
  readonly infoCompl?: ComplementaryServiceInformation;
}

export interface ServiceValues {
  readonly vReceb?: Decimal15V2;
  readonly vServ: Decimal15V2;
}

export interface Discounts {
  readonly vDescIncond?: Decimal15V2;
  readonly vDescCond?: Decimal15V2;
}

export interface MunicipalNfseReference {
  readonly cMunNFSeMun: string;
  readonly nNFSeMun: string;
  readonly cVerifNFSeMun: string;
}

export interface PaperInvoiceReference {
  readonly nNFS: string;
  readonly modNFS: string;
  readonly serieNFS: string;
}

export type DeductionDocumentReference =
  | {
      readonly chNFSe: string;
      readonly chNFe?: never;
      readonly NFSeMun?: never;
      readonly NFNFS?: never;
      readonly nDocFisc?: never;
      readonly nDoc?: never;
    }
  | {
      readonly chNFe: string;
      readonly chNFSe?: never;
      readonly NFSeMun?: never;
      readonly NFNFS?: never;
      readonly nDocFisc?: never;
      readonly nDoc?: never;
    }
  | {
      readonly NFSeMun: MunicipalNfseReference;
      readonly chNFSe?: never;
      readonly chNFe?: never;
      readonly NFNFS?: never;
      readonly nDocFisc?: never;
      readonly nDoc?: never;
    }
  | {
      readonly NFNFS: PaperInvoiceReference;
      readonly chNFSe?: never;
      readonly chNFe?: never;
      readonly NFSeMun?: never;
      readonly nDocFisc?: never;
      readonly nDoc?: never;
    }
  | {
      readonly nDocFisc: string;
      readonly chNFSe?: never;
      readonly chNFe?: never;
      readonly NFSeMun?: never;
      readonly NFNFS?: never;
      readonly nDoc?: never;
    }
  | {
      readonly nDoc: string;
      readonly chNFSe?: never;
      readonly chNFe?: never;
      readonly NFSeMun?: never;
      readonly NFNFS?: never;
      readonly nDocFisc?: never;
    };

export type DeductionKind = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "99";

export type DeductionDocument = DeductionDocumentReference & {
  readonly tpDedRed: DeductionKind;
  readonly xDescOutDed?: string;
  readonly dtEmiDoc: string;
  readonly vDedutivelRedutivel: Decimal15V2;
  readonly vDeducaoReducao: Decimal15V2;
  readonly fornec?: Person;
};

export interface DeductionDocumentList {
  readonly docDedRed: readonly DeductionDocument[];
}

export type DeductionReduction =
  | {
      readonly pDR: Decimal3V2;
      readonly vDR?: never;
      readonly documentos?: never;
    }
  | {
      readonly vDR: Decimal15V2;
      readonly pDR?: never;
      readonly documentos?: never;
    }
  | {
      readonly documentos: DeductionDocumentList;
      readonly pDR?: never;
      readonly vDR?: never;
    };

export interface SuspendedEnforceability {
  readonly tpSusp: "1" | "2";
  readonly nProcesso: string;
}

export type MunicipalBenefit =
  | {
      readonly nBM: string;
      readonly vRedBCBM: Decimal15V2;
      readonly pRedBCBM?: never;
    }
  | {
      readonly nBM: string;
      readonly pRedBCBM: Decimal3V2;
      readonly vRedBCBM?: never;
    }
  | {
      readonly nBM: string;
      readonly vRedBCBM?: never;
      readonly pRedBCBM?: never;
    };

export interface MunicipalTax {
  readonly tribISSQN: IssqnTaxation;
  readonly cPaisResult?: string;
  readonly tpImunidade?: "0" | "1" | "2" | "3" | "4" | "5";
  readonly exigSusp?: SuspendedEnforceability;
  readonly BM?: MunicipalBenefit;
  readonly tpRetISSQN: IssqnWithholding;
  readonly pAliq?: Decimal1V2;
}

export interface PisCofins {
  readonly CST: string;
  readonly vBCPisCofins?: Decimal15V2;
  readonly pAliqPis?: Decimal2V2;
  readonly pAliqCofins?: Decimal2V2;
  readonly vPis?: Decimal15V2;
  readonly vCofins?: Decimal15V2;
  readonly tpRetPisCofins?: "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
}

export interface FederalTax {
  readonly piscofins?: PisCofins;
  readonly vRetCP?: Decimal15V2;
  readonly vRetIRRF?: Decimal15V2;
  readonly vRetCSLL?: Decimal15V2;
}

export interface TotalTaxAmounts {
  readonly vTotTribFed: Decimal15V2;
  readonly vTotTribEst: Decimal15V2;
  readonly vTotTribMun: Decimal15V2;
}

export interface TotalTaxPercentages {
  readonly pTotTribFed: Decimal3V2;
  readonly pTotTribEst: Decimal3V2;
  readonly pTotTribMun: Decimal3V2;
}

export type TotalTax =
  | {
      readonly vTotTrib: TotalTaxAmounts;
      readonly pTotTrib?: never;
      readonly indTotTrib?: never;
      readonly pTotTribSN?: never;
    }
  | {
      readonly pTotTrib: TotalTaxPercentages;
      readonly vTotTrib?: never;
      readonly indTotTrib?: never;
      readonly pTotTribSN?: never;
    }
  | {
      readonly indTotTrib: "0";
      readonly vTotTrib?: never;
      readonly pTotTrib?: never;
      readonly pTotTribSN?: never;
    }
  | {
      readonly pTotTribSN: Decimal2V2;
      readonly vTotTrib?: never;
      readonly pTotTrib?: never;
      readonly indTotTrib?: never;
    };

export interface Taxes {
  readonly tribMun: MunicipalTax;
  readonly tribFed?: FederalTax;
  readonly totTrib: TotalTax;
}

export interface Values {
  readonly vServPrest: ServiceValues;
  readonly vDescCondIncond?: Discounts;
  readonly vDedRed?: DeductionReduction;
  readonly trib: Taxes;
}

export interface Substitution {
  readonly chSubstda: string;
  readonly cMotivo: "01" | "02" | "03" | "04" | "05" | "99";
  readonly xMotivo?: string;
}

export interface ReferencedNfseList {
  readonly refNFSe: readonly string[];
}

export type IbsCbsDestination = FederalTaxId & {
  readonly xNome: string;
  readonly end?: Address;
  readonly fone?: string;
  readonly email?: string;
};

export type IbsCbsProperty = {
  readonly inscImobFisc?: string;
} & (
  | { readonly cCIB: string; readonly end?: never }
  | { readonly end: SimpleAddress; readonly cCIB?: never }
);

export interface NationalFiscalDocumentReference {
  readonly tipoChaveDFe: "1" | "2" | "3" | "9";
  readonly xTipoChaveDFe?: string;
  readonly chaveDFe: string;
}

export interface OtherFiscalDocumentReference {
  readonly cMunDocFiscal: string;
  readonly nDocFiscal: string;
  readonly xDocFiscal: string;
}

export interface NonFiscalDocumentReference {
  readonly nDoc: string;
  readonly xDoc: string;
}

export type ReimbursementDocumentReference =
  | {
      readonly dFeNacional: NationalFiscalDocumentReference;
      readonly docFiscalOutro?: never;
      readonly docOutro?: never;
    }
  | {
      readonly docFiscalOutro: OtherFiscalDocumentReference;
      readonly dFeNacional?: never;
      readonly docOutro?: never;
    }
  | {
      readonly docOutro: NonFiscalDocumentReference;
      readonly dFeNacional?: never;
      readonly docFiscalOutro?: never;
    };

export type IbsCbsSupplier = FederalTaxId & {
  readonly xNome: string;
};

export type ReimbursementDocument = ReimbursementDocumentReference & {
  readonly fornec?: IbsCbsSupplier;
  readonly dtEmiDoc: string;
  readonly dtCompDoc: string;
  readonly tpReeRepRes: "01" | "02" | "03" | "04" | "99";
  readonly xTpReeRepRes?: string;
  readonly vlrReeRepRes: Decimal15V2;
};

export interface IbsCbsRegularTaxation {
  readonly CSTReg: string;
  readonly cClassTribReg: string;
}

export interface IbsCbsDeferral {
  readonly pDifUF: Decimal3V2;
  readonly pDifMun: Decimal3V2;
  readonly pDifCBS: Decimal3V2;
}

export interface IbsCbsTaxClassification {
  readonly CST: string;
  readonly cClassTrib: string;
  readonly cCredPres?: string;
  readonly gTribRegular?: IbsCbsRegularTaxation;
  readonly gDif?: IbsCbsDeferral;
}

export interface IbsCbsValues {
  readonly gReeRepRes?: IbsCbsReimbursementList;
  readonly trib: IbsCbsTax;
}

export interface IbsCbsReimbursementList {
  readonly documentos: readonly ReimbursementDocument[];
}

export interface IbsCbsTax {
  readonly gIBSCBS: IbsCbsTaxClassification;
}

export interface IbsCbs {
  readonly finNFSe: "0";
  readonly indFinal?: "0" | "1";
  readonly cIndOp: string;
  readonly tpOper?: "1" | "2" | "3" | "4" | "5";
  readonly gRefNFSe?: ReferencedNfseList;
  readonly tpEnteGov?: "1" | "2" | "3" | "4";
  readonly indDest: "0" | "1";
  readonly dest?: IbsCbsDestination;
  readonly imovel?: IbsCbsProperty;
  readonly valores: IbsCbsValues;
}

export interface DpsInfo {
  readonly Id: string;
  readonly tpAmb: Environment;
  readonly dhEmi: string;
  readonly verAplic: string;
  readonly serie: string;
  readonly nDPS: string;
  readonly dCompet: string;
  readonly tpEmit: DpsIssuer;
  readonly cMotivoEmisTI?: "1" | "2" | "3" | "4";
  readonly chNFSeRej?: string;
  readonly cLocEmi: string;
  readonly subst?: Substitution;
  readonly prest: Provider;
  readonly toma?: Person;
  readonly interm?: Person;
  readonly serv: Service;
  readonly valores: Values;
  readonly IBSCBS?: IbsCbs;
}

export interface DpsDocument {
  readonly versao: typeof NATIONAL_NFSE_VERSION;
  readonly infDPS: DpsInfo;
}

export interface DpsInput {
  readonly versao?: typeof NATIONAL_NFSE_VERSION;
  readonly infDPS: Omit<DpsInfo, "Id"> & {
    readonly Id?: string;
  };
}

export interface SerializeDpsOptions {
  readonly declaration?: boolean;
  readonly pretty?: boolean;
}
