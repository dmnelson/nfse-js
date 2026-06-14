# Issuance Workflow

Issuance is a sequence of explicit steps. Keep the unsigned DPS, signed XML,
remote response metadata, and returned National document together for audit and
reconciliation.

## 1. Construct and validate

```ts
import {
  createDps,
  serializeDps,
  validateDps,
  validateDpsWithMunicipalParameters,
} from "nfse-js/core";

const dps = createDps(input);
const local = validateDps(dps);
if (!local.valid) {
  throw new Error(JSON.stringify(local.issues));
}

const municipal = validateDpsWithMunicipalParameters(dps, parameters);
if (!municipal.valid) {
  throw new Error(JSON.stringify(municipal.issues));
}

const unsignedXml = serializeDps(dps);
```

Use `nfse-js/validation` when XSD validation is required before signing:

```ts
import { validateDpsXml } from "nfse-js/validation";

await validateDpsXml(unsignedXml);
```

## 2. Sign

```ts
import { createPkcs12Signer, signDpsXml } from "nfse-js/signing";

const signer = createPkcs12Signer(pfxBytes, { password: pfxPassword });
const signedXml = await signDpsXml(unsignedXml, signer);
```

XML signing credentials and the mutual-TLS connection certificate are separate
configuration concerns even when an organization uses the same certificate.

## 3. Submit

```ts
import { createNodeHttpTransport, createSefinClient } from "nfse-js/transport";

const transport = createNodeHttpTransport({
  tls: { pfx: connectionPfx, passphrase: connectionPassword },
});
const sefin = createSefinClient({
  environment: "restricted-production",
  transport,
});

const response = await sefin.submitDps(signedXml, {
  signal,
  timeoutMs: 30_000,
});
```

`response.payload.kind === "success"` exposes parsed National documents.
Rejections preserve the original JSON or text payload in `response.payload.raw`.
Persist `response.status`, correlation headers, and the DPS identifier.

## 4. Reconcile uncertain outcomes

POST submissions are not retried automatically. If the connection fails after
bytes may have reached SEFIN, query by DPS identifier before resubmitting:

```ts
const existence = await sefin.hasNfseForDps(dps.infDPS.Id);
const accessKey = existence.exists
  ? await sefin.getDpsAccessKey(dps.infDPS.Id)
  : undefined;
```

Do not treat a timeout as proof that SEFIN did not process the document.

## Production gate

Before production, confirm the XMLDSig profile and current request wrappers
against restricted production, retain sanitized accepted and rejected
fixtures, and exercise the exact taxpayer, municipality, service, and
certificate configuration that will be deployed.
