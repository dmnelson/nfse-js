# Compatibility Policy

The package follows Semantic Versioning. Before `1.0.0`, minor releases may
contain intentional public API changes, but every such change must be called
out in the changelog and release notes.

## Patch releases

Patch releases may:

- fix behavior that contradicts the supported XSD or documented National rule;
- add validation for an already-modeled requirement;
- improve parsers while preserving returned fields;
- update documentation, tests, security controls, or internal performance.

Patch releases must not intentionally change valid emitted XML, public type
assignability, entry points, or supported runtime versions.

## Minor and major releases

Changes to public types, exports, defaults, emitted XML, signing profiles,
transport routes, or supported schema versions require at least a minor
release before `1.0.0` and a major release after `1.0.0`.

Deprecations remain available for at least one minor release where practical.
Security fixes or official schema mandates may require faster removal and must
be documented explicitly.

## 0.2.0 compatibility note

Version `0.2.0` intentionally narrows the initial `0.1.0` extension-group and
decimal types into schema-specific public types and adds required validation
issue metadata. Consumers upgrading from `0.1.0` must use the field-specific
decimal constructors and explicit DPS group models.

## Wire compatibility

Canonical XML snapshots are the emitted-wire contract. A changed snapshot
requires:

1. an official XSD, manual, technical note, or API reference;
2. an intentional changelog entry;
3. XSD and parser round-trip tests;
4. a version-impact decision.

Official schema directories are immutable. New National versions are added
alongside existing versions, and callers select through the schemas API.

## Release candidates

Release candidates use SemVer prerelease versions such as `1.0.0-rc.1` and the
npm `next` tag. A stable `1.0.0` requires restricted-production evidence,
independent signature verification, and exercise by more than one consuming
application.
