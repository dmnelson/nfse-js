# Reference Data Validation

`validateDps` performs deterministic local checks without network calls. To
also check table membership for generally applicable National DPS code fields,
provide current authoritative datasets explicitly.

```ts
import {
  createDps,
  validateDpsWithReferenceData,
  type DpsReferenceDataProvider,
} from "nfse-js/core";

const referenceData: DpsReferenceDataProvider = {
  codeSets: {
    "country-codes": {
      source: {
        document: "National NFS-e country-code table",
        version: "2026-06-16",
        url: "https://example.invalid/source",
        hash: "sha256:...",
        retrievedAt: "2026-06-16",
      },
      codes: [{ code: "GB", aliases: ["UK"], label: "United Kingdom" }],
    },
  },
};

const dps = createDps(input);
const result = validateDpsWithReferenceData(dps, referenceData, {
  referenceDataOptions: { missingCodeSet: "skip" },
});
```

You can also pass the same provider through
`validateDps(dps, { referenceData })` or through
`validateDpsWithMunicipalParameters`.

## Provider Contract

The core validator accepts synchronous, in-memory providers only. It never
fetches tables, caches them, or falls back to bundled snapshots.

Each `DpsReferenceCodeSet` must carry `source` metadata. The source supports
the normal validation fields plus optional `identifier`, `hash`, and
`retrievedAt` audit data. A code set may expose:

- `codes`: strings or records with `code`, optional `aliases`, `label`, and
  `metadata`;
- `lookup(code)`: a custom synchronous lookup that returns a boolean, a
  canonical code string, a record, or `{ found, canonicalCode, record }`.

Unknown codes produce `reference-data.unknown-code` issues. Missing datasets
produce `reference-data.unavailable` issues by default. Use
`referenceDataOptions.missingCodeSet = "skip"` when intentionally validating
only the code sets supplied by a partial provider.

## Covered Fields

`DPS_REFERENCE_DATA_FIELD_COVERAGE` exports the machine-readable field list.
The current coverage includes:

- `location-codes`: IBGE municipality and National NFS-e special-locality
  codes used by emission location, domestic addresses, service location, and
  document municipality references;
- `country-codes`: foreign addresses, foreign service location, and
  `cPaisResult`;
- `currency-codes`: `serv.comExt.tpMoeda`;
- `national-service-codes`: `serv.cServ.cTribNac`;
- `nbs-codes`: `serv.cServ.cNBS`;
- IBS/CBS operation, tax situation, classification, and presumed-credit code
  sets used in the DPS declarant subtree.

Municipality-specific service codes, benefit IDs, registration state, taxpayer
authorization, CIB/obra identifiers, and document existence remain outside
global reference data. Feed municipal policy through
`validateDpsWithMunicipalParameters` and keep operational state checks in the
application or remote validation layer.
