# nfse-js

Spec-first TypeScript tools for Brazil's **National NFS-e standard**.

`nfse-js` builds and validates National DPS/NFS-e XML without coupling your
application to a CLI, YAML format, framework, storage layer, certificate
provider, or municipal legacy layout.

> Status: early development. Version 0.1 models and serializes the complete
> DPS v1.01 wire structure, applies deterministic local National
> business rules, securely parses National DPS/NFS-e/event documents and SEFIN
> document responses, signs and verifies National XML documents, and validates
> National NFS-e v1.01 XML against the bundled official XSDs. SEFIN transport
> remains a future module.

For the detailed implementation state, known limitations, architectural
decisions, and the completion roadmap, see
[`PROJECT_STATUS.md`](PROJECT_STATUS.md).

## Design

- National NFS-e is the only wire standard.
- Domain input is plain typed data, not files or configuration formats.
- Decimal values stay strings and are serialized exactly.
- Core XML generation is deterministic and synchronous.
- XML parsing rejects DTD/entity declarations and applies byte/depth limits.
- XSD validation is optional and isolated behind a subpath import.
- XML signing is optional and isolated behind a subpath import.
- Official schemas are committed unchanged with hashes and provenance.
- Every `TCInfDPS` descendant has an explicit type and serializer.
- XSD choices are represented by TypeScript unions.

## Install

```sh
npm install nfse-js
```

Node.js 20 or newer is required.

## Build an unsigned DPS

```ts
import { createDps, decimal, serializeDps } from "nfse-js/core";

const dps = createDps({
  infDPS: {
    tpAmb: "2",
    dhEmi: "2026-06-11T10:30:00+01:00",
    verAplic: "my-application",
    serie: "1",
    nDPS: "1",
    dCompet: "2026-06-11",
    tpEmit: "1",
    cLocEmi: "3550308",
    prest: {
      CNPJ: "12345678000195",
      regTrib: { opSimpNac: "1", regEspTrib: "0" },
    },
    toma: {
      CPF: "12345678909",
      xNome: "Example Customer",
    },
    serv: {
      locPrest: { cLocPrestacao: "3550308" },
      cServ: {
        cTribNac: "010101",
        xDescServ: "Software consulting",
      },
    },
    valores: {
      vServPrest: { vServ: decimal("100.00") },
      trib: {
        tribMun: { tribISSQN: "1", tpRetISSQN: "1" },
        totTrib: { indTotTrib: "0" },
      },
    },
  },
});

const xml = serializeDps(dps, { pretty: true });
```

`createDps` derives the official 45-character `Id` from the municipality,
selected issuer CNPJ/CPF, series, and DPS number. You can supply `infDPS.Id`
when importing an existing document.

Fiscal decimal fields have XSD-specific constructors: `decimal15v2`,
`decimal3v2`, `decimal2v2`, and `decimal1v2`. `decimal()` is the
`decimal15v2` monetary default.

## Validate local rules

```ts
import {
  validateDps,
  validateDpsWithMunicipalParameters,
} from "nfse-js/core";

const result = validateDps(dps);

const municipalResult = validateDpsWithMunicipalParameters(dps, {
  municipality: "3550308",
  serviceCode: "010101",
  providerMunicipalRegistrationRequired: false,
  allowedDeductionModes: ["percentage", "value"],
  allowedWithholding: ["1", "2"],
});
```

Local validation covers centralized XSD facets, CPF/CNPJ check digits, real
dates, DPS identifier consistency, and deterministic cross-field rules from
the official v1.01 Annex I. Issues include a stable category, official
rejection code where documented, and source metadata. Use
`validateDps(dps, { mode: "fail-fast" })` to stop at the first issue.

Municipal validation accepts already-resolved parameters and performs no
network calls. Rules that require SEFIN, CNC, municipal parameter, or IBS/CBS
calculator state are intentionally not guessed by the pure validator.

## Validate against the XSD

```ts
import { validateDpsXml } from "nfse-js/validation";

await validateDpsXml(xml);
```

Validation uses libxml2 compiled to WebAssembly. Importing `nfse-js/core`
does not load it.

To collect errors rather than throw:

```ts
const result = await validateDpsXml(xml, { throwOnInvalid: false });
```

Other validators are available for generated NFS-e documents and events:
`validateNfseXml`, `validateEventRequestXml`, `validateEventXml`, and the
generic `validateXml`.

## Parse received documents

```ts
import {
  parseDpsXml,
  parseEventRequestXml,
  parseNfseXml,
  parseRegisteredEventXml,
  parseSefinDocumentResponse,
} from "nfse-js/parsing";

const parsedDps = parseDpsXml(xml);
const parsedNfse = parseNfseXml(nfseXml);
const parsedRequest = parseEventRequestXml(eventRequestXml);
const parsedEvent = parseRegisteredEventXml(eventXml);

const response = parseSefinDocumentResponse(responseBody, {
  status: 200,
  contentType: "application/json",
});
```

Parsers preserve the exact original XML, parsed signature material, and raw
XML trees alongside typed document fields. SEFIN JSON envelopes are parsed
without relying on undocumented property names: plain XML and gzip/base64 XML
documents are discovered recursively, while rejection payloads remain
available as structured JSON.

## Sign and verify XML

```ts
import {
  createPkcs12Signer,
  signDpsXml,
  verifyNationalXmlSignature,
} from "nfse-js/signing";

const signer = createPkcs12Signer(pfxBytes, { password: process.env.PFX_PASSWORD });
const signedXml = await signDpsXml(xml, signer);

const verification = verifyNationalXmlSignature(signedXml, {
  trustedCertificates: [trustedCertificatePem],
  requireTrustedCertificate: true,
});
```

PEM private keys and certificate chains are supported through
`createPemSigner`. Applications using an HSM, cloud KMS, or remote signing
service can implement the asynchronous `XmlSigner` interface without exporting
private key material.

Signing targets the document information element by `Id`, inserts the
enveloped signature in schema order, and supports DPS, generated NFS-e, event
requests, and registered events. Verification checks the digest, signature,
reference target, algorithm profile, certificate dates, and an optional
caller-provided trust chain. Only cryptographically authenticated referenced
XML is returned.

The accessible National NFS-e documentation requires W3C XML Digital Signature
but does not publish the canonicalization, digest, and signature algorithm
URIs. The default profile therefore uses inclusive C14N 1.0 and RSA-SHA256,
and is explicit and configurable. Confirm this profile against the restricted
SEFIN environment before production use.

## Entry points

| Import | Purpose |
| --- | --- |
| `nfse-js` | Full public API |
| `nfse-js/core` | Types, DPS IDs, semantic validation, XML generation |
| `nfse-js/parsing` | Secure DPS, NFS-e, event, and SEFIN response parsing |
| `nfse-js/signing` | XML signing, credentials, and signature verification |
| `nfse-js/validation` | XSD validation |
| `nfse-js/schemas` | Access to bundled National NFS-e schemas |

## Scope

This library does not implement ABRASF or municipality-specific legacy
formats. Municipal configuration is still relevant to National NFS-e, but it
is data obtained from National APIs rather than a separate DPS layout.

Planned modules include SEFIN API clients, event construction/serialization,
and municipal parameter discovery.

## Schema provenance

The v1.01 schemas were published by the Brazilian National NFS-e project on
February 9, 2026. See [`schemas/manifest.json`](schemas/manifest.json) for the
official source URL, retrieval date, hashes, and a documented libxml2
compatibility adjustment applied only to the generated runtime copy.

## License

MIT
