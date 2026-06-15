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
  options: { readonly allowInsecureLocalhost?: boolean } = {},
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
    if (url.username || url.password) {
      throw new SefinTransportError(
        "invalid-config",
        `${name} endpoint must not include credentials`,
      );
    }
    if (url.search || url.hash) {
      throw new SefinTransportError(
        "invalid-config",
        `${name} endpoint must not include a query or fragment`,
      );
    }
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        options.allowInsecureLocalhost === true &&
        isLocalhost(url.hostname)
      )
    ) {
      throw new SefinTransportError(
        "invalid-config",
        `${name} endpoint must use HTTPS unless insecure localhost access is explicitly enabled`,
      );
    }
  }
  return endpoints;
}

export function appendEndpointPath(baseUrl: string, path: string): string {
  const parsed = new URL(baseUrl);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new SefinTransportError(
      "invalid-config",
      "endpoint base URL must not include credentials, a query, or a fragment",
    );
  }
  parsed.pathname = parsed.pathname.endsWith("/") ? parsed.pathname : `${parsed.pathname}/`;
  return new URL(path.replace(/^\/+/, ""), parsed).toString();
}

export function isLocalhost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized === "::1") {
    return true;
  }
  const match = /^(\d{1,3})(?:\.\d{1,3}){3}$/.exec(normalized);
  return match !== null && Number(match[1]) === 127;
}
