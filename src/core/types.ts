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
 * A base-10 value serialized verbatim. Construct with {@link decimal} to
 * reject exponent notation, signs, and excess precision.
 */
export type Decimal = string & { readonly __decimalBrand: unique symbol };

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

export interface DomesticAddress {
  readonly endNac: {
    readonly cMun: string;
    readonly CEP: string;
  };
  readonly endExt?: never;
  readonly xLgr: string;
  readonly nro: string;
  readonly xCpl?: string;
  readonly xBairro: string;
}

export interface ForeignAddress {
  readonly endExt: {
    readonly cPais: string;
    readonly cEndPost: string;
    readonly xCidade: string;
    readonly xEstProvReg: string;
  };
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

export type ExtensionValue =
  | string
  | readonly ExtensionValue[]
  | { readonly [elementName: string]: ExtensionValue | undefined };

export type ExtensionGroup = Readonly<Record<string, ExtensionValue | undefined>>;

export interface Service {
  readonly locPrest: ServiceLocation;
  readonly cServ: ServiceCode;
  /** National schema group TCComExterior. */
  readonly comExt?: ExtensionGroup;
  /** National schema group TCInfoObra. */
  readonly obra?: ExtensionGroup;
  /** National schema group TCAtvEvento. */
  readonly atvEvento?: ExtensionGroup;
  readonly infoCompl?: {
    readonly idDocTec?: string;
    readonly docRef?: string;
    readonly xPed?: string;
    readonly gItemPed?: {
      readonly xItemPed: readonly string[];
    };
    readonly xInfComp?: string;
  };
}

export interface ServiceValues {
  readonly vReceb?: Decimal;
  readonly vServ: Decimal;
}

export interface Discounts {
  readonly vDescIncond?: Decimal;
  readonly vDescCond?: Decimal;
}

export interface SuspendedEnforceability {
  readonly tpSusp: "1" | "2";
  readonly nProcesso: string;
}

export interface MunicipalBenefit {
  readonly nBM: string;
  readonly vRedBCBM?: Decimal;
  readonly pRedBCBM?: Decimal;
}

export interface MunicipalTax {
  readonly tribISSQN: IssqnTaxation;
  readonly cPaisResult?: string;
  readonly tpImunidade?: "0" | "1" | "2" | "3" | "4" | "5";
  readonly exigSusp?: SuspendedEnforceability;
  readonly BM?: MunicipalBenefit;
  readonly tpRetISSQN: IssqnWithholding;
  readonly pAliq?: Decimal;
}

export interface PisCofins {
  readonly CST: string;
  readonly vBCPisCofins?: Decimal;
  readonly pAliqPis?: Decimal;
  readonly pAliqCofins?: Decimal;
  readonly vPis?: Decimal;
  readonly vCofins?: Decimal;
  readonly tpRetPisCofins?: "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
}

export interface FederalTax {
  readonly piscofins?: PisCofins;
  readonly vRetCP?: Decimal;
  readonly vRetIRRF?: Decimal;
  readonly vRetCSLL?: Decimal;
}

export type TotalTax =
  | {
      readonly vTotTrib: {
        readonly vTotTribFed: Decimal;
        readonly vTotTribEst: Decimal;
        readonly vTotTribMun: Decimal;
      };
      readonly pTotTrib?: never;
      readonly indTotTrib?: never;
      readonly pTotTribSN?: never;
    }
  | {
      readonly pTotTrib: {
        readonly pTotTribFed: Decimal;
        readonly pTotTribEst: Decimal;
        readonly pTotTribMun: Decimal;
      };
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
      readonly pTotTribSN: Decimal;
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
  /** National schema group TCInfoDedRed. */
  readonly vDedRed?: ExtensionGroup;
  readonly trib: Taxes;
}

export interface Substitution {
  readonly chSubstda: string;
  readonly cMotivo: "01" | "02" | "03" | "04" | "05" | "99";
  readonly xMotivo?: string;
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
  /** National schema group TCRTCInfoIBSCBS. */
  readonly IBSCBS?: ExtensionGroup;
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
