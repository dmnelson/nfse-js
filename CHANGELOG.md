# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Changed

- Corrected foreign country validation to use two-letter ISO codes.
- Added runtime cardinality checks for repeated DPS groups.
- DPS identifiers are generated from the selected provider, customer, or
  intermediary issuer rather than always using the provider.

### Documentation

- Added a detailed project status, limitations, and completion roadmap for
  future development sessions.

## [0.1.0] - 2026-06-11

### Added

- Typed model and deterministic XML serialization for unsigned National DPS v1.01 documents.
- DPS identifier generation and local semantic validation.
- XSD validation using the official National NFS-e v1.01 schema bundle.
- Separate core, validation, and schema entry points.
