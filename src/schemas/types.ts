export interface SchemaFile {
  readonly fileName: string;
  readonly contents: string;
}

export type NationalNfseVersion = "1.01";

export interface NationalNfseSchemaSet {
  readonly version: NationalNfseVersion;
  readonly files: readonly SchemaFile[];
}

export type NationalNfseSchema =
  | "CNC_v1.00.xsd"
  | "DPS_v1.01.xsd"
  | "NFSe_v1.01.xsd"
  | "evento_v1.01.xsd"
  | "pedRegEvento_v1.01.xsd"
  | "tiposCnc_v1.00.xsd"
  | "tiposComplexos_v1.01.xsd"
  | "tiposEventos_v1.01.xsd"
  | "tiposSimples_v1.01.xsd"
  | "xmldsig-core-schema.xsd";
