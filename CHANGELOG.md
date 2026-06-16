# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added injectable reference-data validation for generally applicable DPS code
  fields, with source metadata, alias-aware records, missing-dataset reporting,
  and no network or bundled-table fallback.
- Completed source-linked semantic validation for provider-issued
  foreign-service exports, including customer identity and address, NBS,
  foreign-trade, and result-country dependencies.

### Documentation

- Clarified the distinction between complete DPS model coverage, partial local
  validation, authoritative code-table validation, and operational
  conformance.
- Removed mutable publication-state claims, packaged linked project documents,
  and added documentation consistency checks.

## [0.2.0] - 2026-06-15

### Added

- Complete typed coverage and deterministic serialization for all 51 complex
  types reachable from `TCInfDPS` v1.01.
- Field-specific XSD decimal brands and constructors.
- Machine-checked DPS schema coverage manifest and canonical XML snapshots.
- CI, dependency updates, package-content checks, and isolated ESM/CommonJS
  consumer smoke tests.
- Centralized DPS XSD facet metadata, CPF/CNPJ check-digit validation, real
  calendar validation, and DPS identifier consistency checks.
- Source-linked National business rules with official rejection codes,
  collect-all/fail-fast modes, and municipal-parameter-aware validation.
- Secure DPS, NFS-e, event, and SEFIN response parsing.
- XML signing and verification through PEM, PKCS#12, and external signers.
- Injectable SEFIN/ADN transport with mutual TLS, bounded retries, and
  reconciliation operations.
- All National v1.01 event request variants and municipal parameter resolution.
- Version-aware schema access, immutable schema staging, and technical-note
  tracking.
- Generated API export documentation, task guides, benchmarks, compatibility
  policy, support matrix, and provenance-enabled release automation.

### Changed

- Narrowed the initial extension-group and decimal types into schema-specific
  public types. This is an intentional pre-1.0 compatibility break from 0.1.0.
- Corrected foreign country validation to use two-letter ISO codes.
- Added runtime cardinality checks for repeated DPS groups.
- DPS identifiers are generated from the selected provider, customer, or
  intermediary issuer rather than always using the provider.
- The package root retains the `0.1.x` core/error/XSD surface; lifecycle modules
  are loaded through explicit subpath imports.
- Corrected `node-forge` interop in the built ESM signing entry point so PEM
  and PKCS#12 credentials load through the packaged artifact.
- Release automation publishes the exact verified tarball and enforces main
  ancestry, clean consumer installation, coverage, benchmark smoke, audit, and
  stable-release attestation gates.

### Security

- Enforced namespace-aware National XML parsing, cumulative decompression
  limits, authoritative HTTP status handling, and wall-clock request deadlines.
- Hardened XMLDSig structure and algorithm checks, certificate-path
  constraints, minimum RSA key size, and external-signer verification.
- Isolated authorization-sensitive parameter lookups and made cache
  invalidation, refresh races, and waiter cancellation deterministic.

### Documentation

- Added a detailed project status, limitations, and completion roadmap for
  future development sessions.

## [0.1.0] - 2026-06-11

### Added

- Typed model and deterministic XML serialization for unsigned National DPS v1.01 documents.
- DPS identifier generation and local semantic validation.
- XSD validation using the official National NFS-e v1.01 schema bundle.
- Separate core, validation, and schema entry points.
