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

The repository is a feature-complete `0.1.0` implementation candidate for the
documented National lifecycle. It can represent and
deterministically serialize every complex type reachable from `TCInfDPS`, and
securely parse DPS, issued NFS-e, event, and SEFIN document-response payloads.
It can sign and verify DPS, NFS-e, and event XML through PEM, PKCS#12, or
external signing providers. It also has an injectable SEFIN/ADN client with a
Node HTTP/mTLS adapter. It has not yet completed a live restricted-production
issuance, so it must not be presented as operationally proven.

At this handoff:

- Git is initialized on `main` with an initial project baseline commit.
- Dependencies are installed locally.
- `npm run verify` passes.
- 155 tests pass, including 15 canonical DPS XML snapshots, parser round trips,
  received-document fixtures, and XSD validation for every named
  schema-coverage fixture.
- `npm run test:coverage` reports 90.53% statements, 100% functions, 90.45%
  lines, and 83.62% branch coverage for the current code.
- `npm audit --audit-level=high` reports no known vulnerabilities.
- The actual npm tarball is unpacked and exercised in isolated ESM and
  CommonJS consumer projects by `npm run package:check`.
- The current package-size baseline is 1,131,845 bytes packed across 95 files.

## Implemented Functionality

### Package Structure

One package exposes nine entry points:

| Entry point | Current purpose |
| --- | --- |
| `nfse-js` | Aggregated public API |
| `nfse-js/core` | DPS types, creation, IDs, validation, and XML serialization |
| `nfse-js/events` | Event IDs, typed request construction, validation, and XML |
| `nfse-js/parameters` | Municipal parameter resolution and bounded caching |
| `nfse-js/parsing` | Secure DPS, NFS-e, event, and SEFIN response parsing |
| `nfse-js/signing` | XML signing, credential adapters, and signature verification |
| `nfse-js/transport` | SEFIN/ADN operations and Node HTTP/mTLS transport |
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

### Secure Parsing and Read Models

The parsing entry point:

- rejects DTD and entity declarations before document construction;
- applies configurable byte and nesting limits;
- parses unsigned or signed DPS XML into the complete canonical DPS model;
- parses issued NFS-e envelope, issuer, calculated values, signature, and
  embedded DPS fields;
- parses event requests and registered event responses;
- preserves event-specific and generated IBS/CBS subtrees as structured raw
  XML while retaining the exact original XML;
- parses bounded SEFIN JSON document responses without depending on
  undocumented property names;
- discovers plain XML and gzip/base64 National documents recursively in SEFIN
  envelopes;
- returns typed rejection results while preserving the complete JSON payload.

All parsing failures use structured error codes and paths. Fifteen canonical
DPS fixtures round-trip through parse and serialize, and representative issued
NFS-e/event fixtures validate against the bundled official schemas.

### XML Signing and Verification

The signing entry point:

- signs `infDPS`, `infNFSe`, `infPedReg`, and `infEvento` by their `Id`;
- inserts a direct enveloped `Signature` after the signed information element;
- loads RSA credentials from PEM private keys and certificate chains;
- loads RSA credentials from in-memory PKCS#12/PFX containers;
- supports asynchronous HSM, cloud KMS, and remote signers without private-key
  export;
- verifies digest and signature integrity without exposing unauthenticated XML;
- requires exactly one reference to the expected information element;
- validates certificate dates and optionally requires a configured trust
  anchor;
- enforces an explicit canonicalization, signature, digest, and transform
  profile to prevent algorithm downgrade.

The default profile is inclusive C14N 1.0 with RSA-SHA256 and SHA-256. Current
accessible official documents require W3C XML Digital Signature and an
ICP-Brasil certificate, but do not publish the exact algorithm URIs. The
profile is therefore configurable and still requires confirmation against the
restricted SEFIN environment.

### SEFIN and ADN Transport

The transport entry point:

- records the official restricted-production and production SEFIN, contributor
  ADN, and municipal-parameter service hosts;
- exposes an injectable `SefinHttpTransport` contract for fixtures and custom
  application adapters;
- provides a Node HTTP/HTTPS adapter with PEM or PKCS#12 mutual TLS;
- keeps connection credentials independent from XML-signing credentials;
- submits DPS payloads and parses generated documents or remote rejections;
- queries NFS-e by access key and reconciles DPS identifiers through GET/HEAD;
- registers and queries events through the documented routes;
- queries contributor ADN documents by NSU and events by NFS-e access key;
- supports per-call abort signals and timeouts;
- retries transient GET/HEAD failures with bounded backoff and `Retry-After`;
- never retries POST operations automatically;
- bounds response bodies and categorizes network, timeout, abort, HTTP, and
  malformed-response failures;
- emits optional logs containing only operation/status metadata.

The public API accepts raw XML/JSON payloads and provides an explicit
gzip/base64 JSON helper whose property name must come from the current
environment Swagger. It does not hard-code a wrapper property that is absent
from the accessible manuals.

### Event Construction

The events entry point:

- models all 16 request variants in `tiposEventos_v1.01.xsd` as discriminated
  unions;
- generates the official `PRE` request identifier from access key and event
  code;
- generates registered-event `EVT` identifiers from request identifiers and
  three-digit sequences;
- supplies the fixed official event descriptions instead of accepting mutable
  caller text;
- validates timestamps, access keys, CPF/CNPJ values, reasons, process numbers,
  referenced event identifiers, and supplied identifier consistency;
- serializes every request variant in exact XSD order;
- produces unsigned event requests that validate against the official schema;
- composes with the signing module and transport event operations.

All 16 variants have XSD and parser round-trip tests. Rules depending on an
existing NFS-e, prior event state, author role, or receiving environment remain
remote rules and are not guessed locally.

### Municipal Parameter Resolution

The parameters entry point:

- fetches convention, service, and optional contributor parameter responses;
- preserves the complete raw JSON/string responses and HTTP metadata;
- requires an explicit mapper into `ResolvedMunicipalParameters` because the
  accessible manuals do not define stable response property schemas;
- deduplicates concurrent lookups;
- uses a bounded time-to-live cache with explicit bypass, invalidation, and
  clear operations;
- passes abort, timeout, and correlation headers to the transport client;
- returns the exact parameter contract consumed by
  `validateDpsWithMunicipalParameters`.

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

### Generated and future fields use lossless raw trees

Issued NFS-e IBS/CBS output and event-specific payloads are preserved as
structured raw XML trees because those fields are generated by remote systems
or belong to event construction planned for Phase 6. The exact original XML is
always retained. These subtrees do not yet have dedicated field-by-field
ergonomic types.

### Signature conformance still needs restricted-production evidence

The signing module does not yet:

- perform online certificate revocation checks through OCSP or CRLs;
- enforce ICP-Brasil taxpayer identity OIDs against the document issuer;
- prove the default algorithm profile against the restricted SEFIN service;
- include a signature fixture produced by a separate XMLDSig implementation.

Callers can supply a different explicit algorithm profile and their own trust
anchors. Production use still requires conformance evidence from SEFIN.

### No live SEFIN conformance evidence

The transport contract and documented routes are implemented, but the project
does not yet contain:

- a successful restricted-production DPS issuance captured with sanitized
  request/response evidence;
- a rejected restricted-production issuance fixture;
- confirmation of every current Swagger request-wrapper property;
- documented rate-limit behavior from the live services;
- a documented server-side idempotency mechanism for safe POST retries.

The client deliberately avoids automatic POST retries and accepts explicit
payload encoders rather than guessing undocumented wrapper names.

### Remote event rules and parameter response schemas remain operational

Event construction covers all schema-local fields, but acceptance still
depends on remote NFS-e existence, author roles, prior event state, municipal
permissions, and receiving-environment rules.

Municipal parameter routes and caching are implemented, but the public manuals
do not publish stable response field names. An application must provide a
version-specific mapper from lossless responses into
`ResolvedMunicipalParameters` until current Swagger contracts can be recorded
as sanitized fixtures.

### No conformance evidence from homologation

There are no sanitized real-world fixtures or recorded successful exchanges
from the official restricted-production environment. Unit coverage is strong
for the small implementation, but conformance coverage is currently shallow.

### External release evidence is still missing

Repository infrastructure now includes a configured remote, CI, schema review,
generated API documentation, task guides, benchmarks, compatibility/security
policies, and provenance-enabled tag releases. The remaining release gaps are:

- an actually published release candidate;
- exercise by more than one real consuming application;
- sanitized restricted-production issuance, event, and parameter evidence;
- independent verification of a generated XML signature.

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
- [x] Create the GitHub repository and configure the existing package metadata.
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

- [x] Parse unsigned and signed DPS XML safely.
- [x] Add a complete issued NFS-e read model.
- [x] Parse SEFIN success and rejection payloads.
- [x] Parse event requests and responses.
- [x] Preserve relevant signature material and unknown future fields where
  possible.
- [x] Reject unsafe XML constructs and external entity resolution.
- [x] Add round-trip and official/sanitized fixture tests.

Exit criteria:

- callers can consume every document the library creates or receives;
- parsing failures are structured and secure;
- representative real documents round-trip without semantic loss.

### Phase 4: Implement Signing and Verification

- [ ] Confirm the exact National NFS-e XMLDSig profile against restricted SEFIN;
  accessible current documents require XMLDSig but omit algorithm URIs.
- [x] Define a low-level signer interface based on canonicalized bytes.
- [x] Provide Node adapters for PKCS#12/PFX and PEM credentials.
- [x] Support external/HSM/cloud signers without exporting private keys.
- [x] Sign the correct element by `Id` and insert `Signature` in schema order.
- [x] Verify digest, signature, certificate validity, and document reference.
- [x] Add deterministic cryptographic fixtures where possible.
- [ ] Add a fixture produced by an independent XMLDSig implementation.

Exit criteria:

- [x] signed DPS and event documents validate against XSD;
- [ ] signatures verify independently of this package;
- [x] supported credentials work without writing private material to disk;
- [x] certificate and signature failures are clearly categorized.

### Phase 5: Implement the SEFIN Transport Layer

- [x] Re-read the latest accessible official API manuals before fixing the
  transport contract.
- [x] Model environments and endpoints explicitly.
- [x] Support mutual TLS independently from XML signing configuration.
- [x] Implement DPS submission and parse generated NFS-e/rejections.
- [x] Add query operations needed for reconciliation.
- [x] Add timeout, abort signal, and bounded retry behavior.
- [x] Avoid retrying non-idempotent operations without a documented safe
  strategy.
- [x] Redact certificates, secrets, taxpayer data, and signed XML from logs by
  default.
- [x] Provide a transport interface so tests can use fixtures and applications can
  supply an HTTP implementation if necessary.

Exit criteria:

- [ ] a signed DPS can be submitted in the official test environment;
- [x] successful and rejected responses are typed;
- [x] network and remote business failures are actionable;
- [ ] at least one sanitized end-to-end issuance fixture is retained.

### Phase 6: Implement Events and Municipal Parameters

- [x] Model all event request variants in the current schema.
- [x] Generate event identifiers and XML.
- [x] Apply event-specific signatures and deterministic local rules.
- [x] Submit, query, and parse event processing results.
- [x] Add typed municipal-parameter clients and caches.
- [x] Define cache freshness and invalidation behavior.
- [x] Feed resolved parameters into validation without coupling pure validation to
  networking.

Exit criteria:

- [x] the complete documented NFS-e lifecycle has implementation-level APIs;
- [x] issuance decisions can use mapped current municipal configuration;
- [ ] event and parameter behavior is covered by restricted-production fixtures.

### Phase 7: Schema and Version Lifecycle

- [x] Add an update command that downloads a new official schema bundle to a
  staging location, verifies provenance, computes hashes, and reports diffs.
- [x] Never silently replace a supported schema version.
- [x] Prepare version-aware schema APIs for multiple National versions; only
  v1.01 is currently published and supported by this package.
- [x] Define how callers select a version and how versions affect public types.
- [x] Track technical notes separately from XSD releases.
- [x] Add contract tests that prevent accidental output changes.

Exit criteria:

- [x] schema updates are reviewable and reproducible;
- [x] existing applications can pin a supported standard version;
- [x] compatibility patches are minimal, explicit, and tested.

### Phase 8: Production Release Quality

- [x] Generate API reference documentation.
- [x] Add task-oriented guides for issuance, signing, errors, events, and parameter
  lookup.
- [x] Publish an explicit support matrix.
- [x] Audit dependencies and XML/cryptographic attack surfaces.
- [x] Add benchmarks for schema validation, signing, parsing, and batch issuance.
- [x] Test package installation in clean ESM and CommonJS consumer projects.
- [x] Define semantic-versioning rules for types and emitted XML.
- [ ] Publish release candidates before declaring `1.0.0`.

Exit criteria:

- [x] documentation is sufficient without reading source;
- [x] release automation is reproducible and provenance-enabled;
- [ ] package behavior has been exercised by more than one real consuming
  application;
- [x] security and compatibility policies are explicit.

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

The remaining roadmap is external conformance and release evidence:

1. confirm the XMLDSig profile and independently verify a generated fixture;
2. capture sanitized accepted and rejected restricted-production issuance;
3. capture event and municipal-parameter fixtures from the active Swagger;
4. publish an npm release candidate through the tag workflow;
5. exercise that candidate in at least two real consumer applications.

## Working Commands

```sh
npm install
npm run verify
npm run test:coverage
npm run benchmark
```

Regenerate the embedded runtime schemas after an intentional schema change:

```sh
npm run generate:schemas
```

Stage and inspect a candidate official schema bundle without modifying the
supported files:

```sh
npm run schema:stage -- --source /path/to/schemas.zip --version 1.01
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
| `src/events/types.ts` | All current event request variants |
| `src/events/ids.ts` | Official request and registered-event identifiers |
| `src/events/serialize.ts` | Schema-ordered event request XML |
| `src/events/validation.ts` | Deterministic event request checks |
| `src/parameters/resolver.ts` | Municipal response mapping and TTL cache |
| `src/parsing/xml.ts` | Hardened bounded XML front end |
| `src/parsing/dps.ts` | Complete DPS XML parser |
| `src/parsing/nfse.ts` | Issued NFS-e read model and parser |
| `src/parsing/events.ts` | Event request and registered-event parsers |
| `src/parsing/sefin-response.ts` | Generic JSON/XML/gzip SEFIN response parser |
| `src/signing/types.ts` | Signing profiles, options, and external signer API |
| `src/signing/credentials.ts` | PEM and PKCS#12 credential adapters |
| `src/signing/sign.ts` | National document XML signature creation |
| `src/signing/verify.ts` | Signature, reference, certificate, and trust verification |
| `src/transport/client.ts` | Document, reconciliation, event, and ADN operations |
| `src/transport/node-http.ts` | Bounded Node HTTP/HTTPS and mutual-TLS adapter |
| `src/transport/endpoints.ts` | Official environment hosts and URL construction |
| `schemas/1.01/dps-coverage.json` | Machine-checked `TCInfDPS` coverage matrix |
| `src/validation/xsd.ts` | libxml2/WASM XSD validation |
| `src/schemas/index.ts` | Bundled-schema public API |
| `scripts/generate-schema-module.mjs` | XSD embedding and compatibility patch |
| `scripts/stage-schema-update.mjs` | Candidate schema staging and hash diff |
| `scripts/generate-api-reference.mjs` | Deterministic public export documentation |
| `scripts/benchmark.mjs` | Release performance and public-API smoke benchmark |
| `schemas/manifest.json` | Schema provenance, hashes, and patch record |
| `schemas/technical-notes.json` | Technical-note review state |
| `docs/` | Generated API reference and task-oriented guides |
| `SUPPORT.md` | Runtime, schema, and feature support matrix |
| `COMPATIBILITY.md` | Semantic-versioning and wire-compatibility policy |
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
