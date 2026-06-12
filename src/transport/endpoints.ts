import { SefinTransportError } from "../errors.js";
import type { SefinEndpoints, SefinEnvironment } from "./types.js";

export const NATIONAL_SEFIN_ENDPOINTS: Readonly<Record<SefinEnvironment, SefinEndpoints>> = {
  "restricted-production": {
    sefin: "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional",
    adnContributor: "https://adn.producaorestrita.nfse.gov.br/contribuintes",
    municipalParameters: "https://adn.producaorestrita.nfse.gov.br/parametrizacao",
  },
  production: {
    sefin: "https://sefin.nfse.gov.br/SefinNacional",
    adnContributor: "https://adn.nfse.gov.br/contribuintes",
    municipalParameters: "https://adn.nfse.gov.br/parametrizacao",
  },
};

export function resolveSefinEndpoints(
  environment: SefinEnvironment,
  overrides: Partial<SefinEndpoints> = {},
): SefinEndpoints {
  const endpoints = { ...NATIONAL_SEFIN_ENDPOINTS[environment], ...overrides };
  for (const [name, value] of Object.entries(endpoints)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch (error) {
      throw new SefinTransportError(
        "invalid-config",
        `${name} endpoint is not a valid URL`,
        {},
        {
          cause: error,
        },
      );
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new SefinTransportError("invalid-config", `${name} endpoint must use HTTP or HTTPS`);
    }
  }
  return endpoints;
}

export function appendEndpointPath(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), base).toString();
}
