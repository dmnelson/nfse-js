# Project Status and Completion Roadmap

Last reviewed: 2026-06-12

This document is the engineering handoff for continuing `nfse-js` in a future
session. It describes what exists, what has actually been verified, what the
current implementation must not be assumed to do, and the work required before
the library can reasonably be called fully fledged.

## Objective

`nfse-js` should become a general-purpose Node.js/TypeScript implementation of
Brazil's **National NFS-e standard**.

The intended boundary is:

- plain JavaScript/TypeScript data in;
- National NFS-e documents and operations out;
- no dependency on `notaflow`, `invoices`, YAML, a CLI, or a specific framework;
- no support for ABRASF or municipality-specific legacy XML layouts;
- municipal rules and parameters supported through the National standard APIs
  where they affect National DPS/NFS-e issuance.

The package should eventually cover the complete lifecycle:

1. model a DPS;
2. validate it locally;
3. serialize it deterministically;
4. sign it;
5. submit it to SEFIN;
6. parse the resulting NFS-e or rejection;
7. query documents and parameters;
8. issue and process lifecycle events;
9. verify signatures and received documents.

## Current State

The repository is an early `0.1.0` foundation. It can represent and
deterministically serialize every complex type reachable from `TCInfDPS` in the
National v1.01 XSD. It is **not yet an issuance client** and cannot currently
produce a document ready for submission to SEFIN.

At this handoff:

- Git is initialized on `main` with an initial project baseline commit.
- Dependencies are installed locally.
- `npm run verify` passes.
- 75 tests pass, including 15 canonical XML snapshots and XSD validation for
  every named schema-coverage fixture.
- `npm run test:coverage` reports 88.71% statements, 100% functions, 88.65%
  lines, and 83.08% branch coverage for the current code.
- The actual npm tarball is unpacked and exercised in isolated ESM and
  CommonJS consumer projects by `npm run package:check`.
- The current package-size baseline is 617,855 bytes packed across 43 files.

## Implemented Functionality

### Package Structure

One package exposes four entry points:

| Entry point | Current purpose |
| --- | --- |
| `nfse-js` | Aggregated public API |
| `nfse-js/core` | DPS types, creation, IDs, validation, and XML serialization |
| `nfse-js/validation` | XSD validation through libxml2/WASM |
| `nfse-js/schemas` | Programmatic access to bundled official schemas |

The build emits ESM, CommonJS, source maps, and declarations. Node.js 20 or
newer is required.

### DPS Construction

`createDps`:

- accepts plain typed data;
- defaults the standard version to `1.01`;
- preserves a caller-supplied `infDPS.Id`;
- otherwise generates the official 45-character DPS identifier;
- supports automatic identifier generation for CNPJ and CPF providers,
  customers, and intermediaries according to `tpEmit`.

Automatic DPS ID generation intentionally rejects NIF and `cNaoNIF`, because
the documented DPS identifier formation requires a Brazilian federal
registration type and number.

### Complete Typed DPS Wire Model

The current model has dedicated types for all 51 complex types reachable from
`TCInfDPS`, including:

- environment and issuer;
- CNPJ, CPF, NIF, and no-NIF identities;
- provider, customer, and intermediary;
- domestic and foreign addresses;
- provider tax regime;
- domestic or foreign service location;
- service codes and descriptions;
- service value and discounts;
- municipal ISSQN fields;
- suspended enforceability;
- municipal benefit;
- PIS/COFINS and federal withholding fields;
- approximate total tax alternatives;
- NFS-e substitution;
- complementary service information;
- foreign trade;
- construction and event activities;
- document-based deduction/reduction;
- the complete declarant-side IBS/CBS subtree.

All XSD choices are represented by discriminated unions, repeated groups use
readonly arrays with runtime cardinality checks, and no raw XML-shaped
extension group remains in the public DPS API.

`schemas/1.01/dps-coverage.json` maps every reachable XSD complex type to its
TypeScript symbol, serializer, current validation status, and fixtures. A test
derives the graph from the official XSD and fails if this manifest becomes
incomplete.

Official XML element names are retained in the object model. This minimizes
translation ambiguity and makes comparison with the XSD and manuals easier.

### Decimal Handling

Fiscal fields use distinct branded types and exact constructors for:

- `TSDec15V2` through `decimal15v2`;
- `TSDec3V2` through `decimal3v2`;
- `TSDec2V2` through `decimal2v2`;
- `TSDec1V2` through `decimal1v2`.

`decimal()` remains the monetary `TSDec15V2` default. Supplying custom precision
returns a separate custom brand that cannot be assigned to an XSD fiscal field.
All constructors reject signs, exponent notation, leading zeroes, excess
integer digits, and fractional values other than exactly two digits. Values are
serialized as supplied, avoiding JavaScript floating-point changes.

### Semantic Validation

`validateDps` and `assertValidDps` use centralized v1.01 simple-type facets and
check:

- DPS identifier shape and consistency with the selected issuer fields;
- CPF and CNPJ check digits;
- real Gregorian dates and the official timestamp offset profile;
- municipality, CEP, country, service, series, DPS number, key, text-length,
  and decimal facets used by the modeled DPS tree;
- cardinality for every repeated DPS group;
- issuer, substitution, rejected-NFS-e, tax-regime, foreign-trade,
  construction, event, deduction, ISSQN, federal-tax, total-tax, and IBS/CBS
  dependencies that can be decided from the document alone;
- exact decimal arithmetic for PIS/COFINS and monetary comparison rules.

Validation can collect all issues or stop at the first issue. Structured
issues include `path`, `code`, `category`, `message`, optional
`officialCode`, and source metadata. `NATIONAL_DPS_RULES` records the Annex I
sheet row and official URL for implemented rejection rules.

`validateDpsWithMunicipalParameters` adds deterministic checks against
already-resolved municipal parameters without coupling the core to networking.

### XML Serialization

`serializeDps`:

- creates an ID when necessary;
- runs current semantic validation before serialization;
- emits the National NFS-e namespace and version;
- preserves decimal strings;
- uses deterministic field construction order;
- supports compact or formatted XML;
- optionally omits the XML declaration.

Serialization is split into explicit functions for each schema group. Fifteen
canonical output snapshots cover every XSD choice branch, and every named
fixture validates against the bundled official DPS v1.01 XSD.

### XSD Validation

The package embeds the complete official v1.01 schema bundle and exposes:

- `validateDpsXml`;
- `validateNfseXml`;
- `validateEventRequestXml`;
- `validateEventXml`;
- generic `validateXml`.

Validation uses `xmllint-wasm`, backed by libxml2. It can either throw
`XsdValidationError` or return all reported violations.

The official schema files under `schemas/1.01/` are unchanged and have recorded
SHA-256 hashes in `schemas/manifest.json`.

The generated runtime copy applies one documented compatibility adjustment:
the JavaScript-style `^` and `$` characters are removed from the
`TSSerieDPS` pattern. XML Schema regular expressions are implicitly anchored,
and libxml2 otherwise treats those characters literally. The source XSD remains
unchanged.

## Important Current Limitations

### XSD-valid does not mean SEFIN-valid

The current successful fixture proves that one generated document satisfies
the XSD. It does not prove that:

- all modeled combinations are accepted;
- business rules from the manuals and technical notes are satisfied;
- municipal parameters permit the operation;
- the test taxpayer and service data are authorized;
- SEFIN accepts the serialized byte representation;
- a signed version is correct;
- production or homologation submission works.

Do not advertise the current version as able to issue NFS-e.

### Some validation requires resolved or remote state

The pure validator intentionally does not decide rules that depend on:

- SEFIN processing time, receiving environment, taxpayer authorization, CNC,
  or document existence;
- municipal service, rate, withholding, benefit, or deduction configuration
  that has not been supplied to `validateDpsWithMunicipalParameters`;
- current IBS/CBS calculator tables and classification indicators;
- authoritative IBGE, ISO, BACEN, NBS, and operation-code table membership
  beyond the XSD shape;
- NFS-e access-key check digits where the official algorithm is not present in
  the bundled XSD or current contributor API manual.

These failures belong to municipal-parameter or remote validation rather than
being guessed by local code.

### No XML parsing or round trip

The library only serializes DPS data. It does not currently:

- parse an existing DPS XML into the typed model;
- parse an issued NFS-e;
- parse an event or event response;
- preserve unknown forward-compatible elements;
- verify that parse -> serialize retains the intended document semantics.

### No XML signature support

There is no XMLDSig implementation. The package does not:

- load PKCS#12/PFX or PEM credentials;
- select or validate a certificate;
- canonicalize XML;
- create a digest or `SignedInfo`;
- insert the enveloped signature at the correct schema position;
- verify a signature or certificate chain;
- expose a signer abstraction for HSM, cloud KMS, or remote signing.

The exact algorithms and canonicalization profile must be verified against the
latest official National NFS-e documentation before implementation. Do not
infer them only from generic XMLDSig examples.

### No SEFIN client

There is no transport layer for:

- production or restricted-production/homologation environments;
- mutual TLS and certificate configuration;
- DPS submission and NFS-e generation;
- document queries;
- event registration;
- municipal parameter queries;
- request/response compression or encoding required by the API;
- retry, timeout, cancellation, idempotency, and rate-limit behavior;
- normalized handling of HTTP, TLS, schema, and business-rule errors.

Official endpoints and payload rules are operational data and must be checked
against current documentation when this work begins.

### Events are only XSD-validated

Event request and response schemas are bundled, but there are no:

- typed event models;
- event ID builders;
- event serializers;
- event signatures;
- event-specific business rules;
- event response parsers.

### Municipal parameters are absent

National standard adoption does not eliminate municipality-specific
configuration. A complete implementation still needs typed clients and models
for relevant National parameter services, including service availability,
rates, withholding, benefits, special regimes, and other issuance constraints.

This must remain National-API support, not municipality-specific DPS layouts.

### No conformance evidence from homologation

There are no sanitized real-world fixtures or recorded successful exchanges
from the official restricted-production environment. Unit coverage is strong
for the small implementation, but conformance coverage is currently shallow.

### Project operations are not production-ready

Missing project infrastructure includes:

- remote repository configuration;
- release automation;
- npm provenance/signing policy;
- API reference generation;
- compatibility and deprecation policy;
- schema-update detection;
- published package and end-user feedback.

## Architectural Decisions to Preserve

Future work should retain these decisions unless a concrete incompatibility is
found:

1. **No application coupling.** The library accepts data, not invoice files,
   YAML, database records, or framework objects.
2. **National standard only.** Do not add ABRASF or legacy municipal layouts to
   the core package.
3. **Exact decimal strings.** Never use JavaScript `number` for fiscal decimal
   values.
4. **Pure core.** Construction and serialization should remain independent of
   filesystem access, networking, certificates, and WASM.
5. **Optional heavy modules.** Validation, signing, and transport should remain
   separate entry points so consumers pay only for what they use.
6. **Official names at the wire boundary.** Avoid a second competing vocabulary
   unless an ergonomic layer clearly maps to a canonical wire model.
7. **Official schemas remain immutable.** Compatibility patches belong in the
   generation process and must be documented and tested.
8. **Spec and fixture evidence.** Wire changes require a citation to official
   material and a regression fixture.
9. **Structured errors.** Preserve machine-readable paths, codes, categories,
   and underlying causes.
10. **Adapters over hard dependencies.** Certificate stores, HTTP clients,
    clocks, logging, and signing backends should be injectable where useful.

## Recommended Roadmap

The phases below are ordered to produce a real issuance vertical slice without
calling an incomplete implementation “complete.”

### Phase 0: Establish the Repository Baseline

- [x] Review the generated scaffold and create the initial commit.
- Create the GitHub repository and configure the existing package metadata.
- [x] Add CI for `npm run verify`, coverage, npm pack inspection, ESM imports, and
  CommonJS imports.
- [x] Test the supported Node versions.
- [x] Add Dependabot/Renovate and a security reporting path.
- [x] Record the package-size baseline.

Exit criteria:

- every change is reviewed through a normal Git history;
- the clean checkout passes all checks;
- the package artifact is tested, not only source imports.

### Phase 1: Complete the DPS Domain and Serializer

- [x] Map every `TCInfDPS` descendant in the current XSD into explicit types.
- [x] Replace all `ExtensionGroup` fields with discriminated unions and dedicated
  structures.
- [x] Encode XSD choices so impossible combinations fail at compile time.
- [x] Model repeated elements as bounded arrays where appropriate.
- [x] Implement field-specific decimal types or constructors.
- [x] Split serialization into explicit functions per schema group.
- [x] Add fixtures for every optional group and every union branch.
- [x] Compare generated XML against canonical expected fixtures.

Exit criteria:

- the public stable DPS API contains no raw extension groups;
- every DPS v1.01 element can be represented and serialized;
- every generated fixture validates against the XSD;
- all official choice and sequence structures are covered by tests.

### Phase 2: Build a Validation Rule Engine

- [x] Generate or centralize XSD facet validation metadata.
- [x] Add CPF/CNPJ validation and complete date/time validation.
- [x] Check generated/supplied DPS IDs for field consistency.
- [x] Implement cross-field National business rules from manuals and technical
  notes.
- [x] Assign official rule/rejection codes where documented.
- [x] Distinguish format, schema, business, municipal-parameter, and remote
  errors.
- [x] Support collecting all issues and fail-fast operation.
- [x] Keep validation deterministic and free of network calls.
- [x] Add a separate validation layer that accepts resolved municipal
  parameters.

Exit criteria:

- local validation covers all documented rules that can be evaluated before
  submission;
- each rule has a source reference and positive/negative tests;
- failures are stable enough for applications to present to users.

### Phase 3: Add Parsing and Document Models

- Parse unsigned and signed DPS XML safely.
- Add a complete issued NFS-e read model.
- Parse SEFIN success and rejection payloads.
- Parse event requests and responses.
- Preserve relevant signature material and unknown future fields where
  possible.
- Reject unsafe XML constructs and external entity resolution.
- Add round-trip and official/sanitized fixture tests.

Exit criteria:

- callers can consume every document the library creates or receives;
- parsing failures are structured and secure;
- representative real documents round-trip without semantic loss.

### Phase 4: Implement Signing and Verification

- Confirm the exact National NFS-e XMLDSig profile from current official
  documentation.
- Define a low-level signer interface based on bytes/digests.
- Provide Node adapters for PKCS#12/PFX and PEM credentials.
- Support external/HSM/cloud signers without exporting private keys.
- Sign the correct element by `Id` and insert `Signature` in schema order.
- Verify digest, signature, certificate validity, and document reference.
- Add deterministic cryptographic fixtures where possible.
- Add tests against independently generated signatures.

Exit criteria:

- signed DPS and event documents validate against XSD;
- signatures verify independently of this package;
- supported credentials work without writing private material to disk;
- certificate and signature failures are clearly categorized.

### Phase 5: Implement the SEFIN Transport Layer

- Re-read the latest official API manuals before fixing the transport contract.
- Model environments and endpoints explicitly.
- Support mutual TLS independently from XML signing configuration.
- Implement DPS submission and parse generated NFS-e/rejections.
- Add query operations needed for reconciliation.
- Add timeout, abort signal, retry, and idempotency behavior.
- Avoid retrying non-idempotent operations without a documented safe strategy.
- Redact certificates, secrets, taxpayer data, and signed XML from logs by
  default.
- Provide a transport interface so tests can use fixtures and applications can
  supply an HTTP implementation if necessary.

Exit criteria:

- a signed DPS can be submitted in the official test environment;
- successful and rejected responses are typed;
- network and remote business failures are actionable;
- at least one sanitized end-to-end issuance fixture is retained.

### Phase 6: Implement Events and Municipal Parameters

- Model all event request variants in the current schema.
- Generate event identifiers and XML.
- Apply event-specific signatures and rules.
- Submit, query, and parse event processing results.
- Add typed municipal-parameter clients and caches.
- Define cache freshness and invalidation behavior.
- Feed resolved parameters into validation without coupling pure validation to
  networking.

Exit criteria:

- the complete documented NFS-e lifecycle can be performed;
- issuance decisions can use current municipal configuration;
- event and parameter behavior is covered by restricted-production fixtures.

### Phase 7: Schema and Version Lifecycle

- Add an update command that downloads a new official schema bundle to a
  staging location, verifies provenance, computes hashes, and reports diffs.
- Never silently replace a supported schema version.
- Support multiple National schema versions when a transition requires it.
- Define how callers select a version and how versions affect public types.
- Track technical notes separately from XSD releases.
- Add contract tests that prevent accidental output changes.

Exit criteria:

- schema updates are reviewable and reproducible;
- existing applications can pin a supported standard version;
- compatibility patches are minimal, explicit, and tested.

### Phase 8: Production Release Quality

- Generate API reference documentation.
- Add task-oriented guides for issuance, signing, errors, events, and parameter
  lookup.
- Publish an explicit support matrix.
- Audit dependencies and XML/cryptographic attack surfaces.
- Add benchmarks for schema validation, signing, parsing, and batch issuance.
- Test package installation in clean ESM and CommonJS consumer projects.
- Define semantic-versioning rules for types and emitted XML.
- Publish release candidates before declaring `1.0.0`.

Exit criteria:

- documentation is sufficient without reading source;
- releases are reproducible and provenance-enabled;
- package behavior has been exercised by more than one consuming application;
- security and compatibility policies are explicit.

## Definition of Fully Fledged

The project should not be described as fully fledged until all of these are
true:

- complete typed coverage of the supported National DPS schema;
- complete serialization and safe parsing for DPS and issued NFS-e;
- documented local validation of XSD facets and pre-submission business rules;
- standards-compliant XML signing and signature verification;
- typed SEFIN issuance and query clients;
- typed lifecycle event support;
- typed municipal-parameter access where required for issuance;
- multi-version strategy for official schema evolution;
- independently verifiable signed fixtures;
- successful restricted-production issuance and event evidence;
- CI, security controls, release automation, and consumer installation tests;
- stable documentation and public compatibility policy.

Supporting every legacy municipality format is explicitly **not** part of this
definition.

## Recommended Next Session

Proceed with Phase 3 while keeping the missing remote repository as a separate
operational task:

1. add a hardened XML parser that rejects DTD/entity input;
2. parse unsigned and signed DPS into the canonical model;
3. add issued NFS-e, SEFIN response, and event read models;
4. preserve signature XML and unknown forward-compatible elements;
5. add round-trip and sanitized response fixtures.

## Working Commands

```sh
npm install
npm run verify
npm run test:coverage
```

Regenerate the embedded runtime schemas after an intentional schema change:

```sh
npm run generate:schemas
```

Inspect the publish artifact without using a potentially misconfigured global
npm cache:

```sh
npm_config_cache=/tmp/nfse-js-npm-cache npm pack --dry-run
```

## Key Files

| File | Responsibility |
| --- | --- |
| `src/core/types.ts` | Current DPS wire-domain types |
| `src/core/create.ts` | DPS creation and automatic ID integration |
| `src/core/dps-id.ts` | Official DPS identifier formation |
| `src/core/facets.ts` | Centralized v1.01 simple-type facets |
| `src/core/rules.ts` | Source-linked National rejection-rule metadata |
| `src/core/semantic-validation.ts` | Current local rules |
| `src/core/tax-id.ts` | CPF and CNPJ check-digit validation |
| `src/core/serialize.ts` | DPS XML construction and ordering |
| `schemas/1.01/dps-coverage.json` | Machine-checked `TCInfDPS` coverage matrix |
| `src/validation/xsd.ts` | libxml2/WASM XSD validation |
| `src/schemas/index.ts` | Bundled-schema public API |
| `scripts/generate-schema-module.mjs` | XSD embedding and compatibility patch |
| `schemas/manifest.json` | Schema provenance, hashes, and patch record |
| `test/fixtures.ts` | Named fixtures covering every DPS choice branch |
| `test/__snapshots__/serialize.test.ts.snap` | Canonical deterministic XML output |
| `test/schema-coverage.test.ts` | Coverage-manifest/XSD graph contract |
| `test/xsd.test.ts` | XSD and schema-access verification |

## Source of Truth

The XSDs and official National NFS-e manuals/technical notes are the source of
truth. The schema provenance URL is recorded in `schemas/manifest.json`.

Because endpoints, technical notes, business rules, and schema versions can
change, a future session must check the current official documentation before
implementing signing, transport, or a new standard version.
