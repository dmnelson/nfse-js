# nfse-js

Spec-first TypeScript tools for Brazil's **National NFS-e standard**.

`nfse-js` builds and validates National DPS/NFS-e XML without coupling your
application to a CLI, YAML format, framework, storage layer, certificate
provider, or municipal legacy layout.

> Status: early development. Version 0.1 models the common unsigned DPS v1.01
> path and validates any National NFS-e v1.01 XML against the bundled official
> XSDs. XML signing and SEFIN transport are intentionally separate future
> modules.

For the detailed implementation state, known limitations, architectural
decisions, and the completion roadmap, see
[`PROJECT_STATUS.md`](PROJECT_STATUS.md).

## Design

- National NFS-e is the only wire standard.
- Domain input is plain typed data, not files or configuration formats.
- Decimal values stay strings and are serialized exactly.
- Core XML generation is deterministic and synchronous.
- XSD validation is optional and isolated behind a subpath import.
- Official schemas are committed unchanged with hashes and provenance.
- Rare schema groups have extension nodes while dedicated types mature.

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
provider CNPJ/CPF, series, and DPS number. You can supply `infDPS.Id` when
importing an existing document.

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

## Entry points

| Import | Purpose |
| --- | --- |
| `nfse-js` | Full public API |
| `nfse-js/core` | Types, DPS IDs, semantic validation, XML generation |
| `nfse-js/validation` | XSD validation |
| `nfse-js/schemas` | Access to bundled National NFS-e schemas |

## Scope

This library does not implement ABRASF or municipality-specific legacy
formats. Municipal configuration is still relevant to National NFS-e, but it
is data obtained from National APIs rather than a separate DPS layout.

Planned modules include XMLDSig signing, SEFIN API clients, typed event
requests, municipal parameter discovery, and dedicated types for the complete
IBS/CBS and specialized service groups.

## Schema provenance

The v1.01 schemas were published by the Brazilian National NFS-e project on
February 9, 2026. See [`schemas/manifest.json`](schemas/manifest.json) for the
official source URL, retrieval date, hashes, and a documented libxml2
compatibility adjustment applied only to the generated runtime copy.

## License

MIT
