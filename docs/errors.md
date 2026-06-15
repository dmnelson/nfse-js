# Errors and Recovery

All library error classes extend `NfseError`. Prefer structured fields over
matching human-readable messages.

| Error | Structured data | Typical response |
| --- | --- | --- |
| `DpsValidationError` | `issues[]` | Correct input or resolved parameters |
| `EventValidationError` | `issues[]` | Correct event fields or references |
| `XmlParseError` | `code`, `path` | Reject unsafe or malformed input |
| `SefinResponseParseError` | `code`, `path` | Retain bounded raw response and investigate contract drift |
| `XmlSignatureError` | `code` | Reject document or fix credentials/profile |
| `SefinTransportError` | `code`, `context` | Retry only when operation semantics allow it |
| `XsdValidationError` | `violations[]` | Correct the generated or received XML |

```ts
import {
  DpsValidationError,
  SefinTransportError,
  XmlSignatureError,
} from "nfse-js";

try {
  await issue();
} catch (error) {
  if (error instanceof DpsValidationError) {
    return { kind: "invalid-input", issues: error.issues };
  }
  if (error instanceof XmlSignatureError) {
    return { kind: "signature-failure", code: error.code };
  }
  if (error instanceof SefinTransportError) {
    return {
      kind: "transport-failure",
      code: error.code,
      status: error.context.status,
    };
  }
  throw error;
}
```

## Retry rules

The built-in client retries bounded transient failures only for GET and HEAD.
It never retries POST automatically. After an ambiguous DPS submission, query
by DPS identifier. After an ambiguous event registration, query the event
collection before attempting another registration.

## Validation categories

`ValidationIssue.category` distinguishes `format`, `schema`, `business`,
`municipal-parameter`, and `remote`. A local success does not imply remote
acceptance; rules requiring taxpayer authorization, prior event state, or
current municipal configuration remain remote or parameter-dependent.

Local validation is also not yet exhaustive for every modeled XSD field or
every locally decidable business rule. Use `validateDpsXml` for structural XSD
validation and treat `validateDps` as the implemented deterministic rule
subset documented in `PROJECT_STATUS.md`.
