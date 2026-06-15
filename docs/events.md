# Lifecycle Events

`nfse-js/events` models all 16 request variants in the National v1.01 event
schema. The `evento.code` discriminant determines the required fields.

```ts
import { createEventRequest, serializeEventRequest } from "nfse-js/events";
import { signEventRequestXml } from "nfse-js/signing";

const request = createEventRequest({
  infPedReg: {
    tpAmb: "2",
    verAplic: "my-application",
    dhEvento: "2026-06-12T10:00:00-03:00",
    autor: { CNPJAutor: "12345678000195" },
    chNFSe: accessKey,
    evento: {
      code: "e101101",
      cMotivo: "1",
      xMotivo: "Documento emitido incorretamente",
    },
  },
});

const unsignedXml = serializeEventRequest(request);
const signedXml = await signEventRequestXml(unsignedXml, signer);
```

The library generates the `PRE` identifier and fixed official description.
Use `validateEventRequest` to collect local issues or
`assertValidEventRequest` to throw.

## Registration payload

The public manuals do not expose every active Swagger wrapper property. Pass
the wrapper explicitly when the environment requires gzip/base64 JSON:

```ts
import { gzipBase64XmlJsonPayload } from "nfse-js/transport";

const payload = gzipBase64XmlJsonPayload(signedXml, swaggerPropertyName);
const response = await sefin.registerEvent(accessKey, payload);
```

Query `getEvents`, `getEventsByType`, or `getEvent` to reconcile processing.
Remote acceptance still depends on author role, NFS-e state, prior events,
municipal permissions, and environment rules.

Generated XML for all 16 variants is tested against the bundled XSD, and parser
coverage asserts every event-specific payload field. Received-event fixtures
are synthetic rather than sanitized SEFIN exchanges.
