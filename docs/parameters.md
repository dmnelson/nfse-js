# Municipal Parameters

Municipal parameter responses are fetched losslessly and mapped explicitly.
This avoids hard-coding response properties that are not stable in the
accessible public manuals.

```ts
import { createMunicipalParameterResolver } from "nfse-js/parameters";

const resolver = createMunicipalParameterResolver({
  client: sefin,
  ttlMs: 5 * 60_000,
  maxEntries: 500,
  map(snapshot) {
    return {
      providerMunicipalRegistrationRequired:
        readRegistrationRequirement(snapshot.convention.value),
      allowedDeductionModes: readDeductionModes(snapshot.service.value),
      allowedWithholding: readWithholdingModes(snapshot.service.value),
      source: "restricted-production Swagger mapper v1",
      resolvedAt: new Date().toISOString(),
    };
  },
});

const parameters = await resolver.resolve({
  municipality: "3550308",
  serviceCode: "010101",
  contributorTaxId: "12345678000195",
});
```

The resolver deduplicates concurrent requests and applies bounded TTL caching.
Use `{ bypassCache: true }` for an authoritative refresh, `invalidate(query)`
after known configuration changes, and `clear()` when replacing mapper or
environment configuration.

Feed the result to `validateDpsWithMunicipalParameters`. Production adapters
should keep mapper versions and sanitized response fixtures together so a
Swagger response change fails mapper tests before it changes issuance
decisions. The repository does not currently include sanitized municipal
parameter responses from restricted production.
