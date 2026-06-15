# Release Process

Tagged releases are built and published by `.github/workflows/release.yml`.

`package.json` defines the version being prepared. The npm registry and GitHub
Releases are authoritative for publication state; release instructions must
not claim that the current package version is unpublished.

## Prerequisites

- Configure the GitHub `npm` environment.
- Protect the environment with the repository's required reviewers.
- Configure npm trusted publishing for this repository, the release workflow,
  and the `npm` environment.
- Before a `1.x` or later release, set the protected `npm` environment variable
  `STABLE_RELEASE_APPROVED` to the exact reviewed tag, such as `v1.0.0`.
- Ensure the npm package points to this repository so npm provenance is
  verifiable.

## Prepare a release

1. Decide whether to publish a release candidate first or proceed to a stable
   version. If using a release candidate, update package, lock, and changelog
   versions to that exact prerelease; prereleases publish under the npm `next`
   tag.
2. Review the prepared changelog and migration notes against the final release
   diff.
3. Confirm the breaking changes for the target version.
4. Run `npm run verify`, `npm run test:coverage`, `npm run benchmark`, and
   `npm audit --audit-level=high`.
5. Run `npm run package:check:install` to install the packed tarball and its
   dependencies in a clean consumer before exercising ESM, CommonJS, and
   TypeScript entry points. Node.js 22 CI and the release workflow enforce this
   mode automatically.
6. Confirm the release commit is reviewed and contained in protected
   `origin/main`, then tag it with exactly `v<package version>`.

After any release-candidate exercise, set the intended stable metadata, repeat
the checks, and tag `v<package version>`. Stable versions publish under
`latest`.

## Breaking changes from 0.1.0

`0.2.0` consumers must review these migrations:

- The DPS type model now uses dedicated structures and discriminated unions for
  previously incomplete schema groups. Code that supplied raw extension-shaped
  objects must move to the typed fields.
- Fiscal decimal fields use field-specific branded types. Use `decimal15v2`,
  `decimal3v2`, `decimal2v2`, or `decimal1v2` as appropriate; custom-precision
  `decimal()` results are not assignable to XSD fiscal fields.
- Decimal constructors enforce the exact supported lexical forms, including
  two fractional digits and no leading zeroes or signs.
- Foreign country values use the modeled two-letter code shape.
- Generated DPS identifiers use the provider, customer, or intermediary
  selected by `tpEmit`, rather than always using the provider.
- Validation issues now include categories and may use official rejection
  codes for implemented rules. Applications must not depend on the older
  minimal issue shape or assume that local validation is exhaustive.
- New parsing, signing, transport, event, and parameter entry points expand the
  package surface but do not constitute restricted-production conformance.

## Automated workflow behavior

The tag workflow currently:

- requires the tagged commit to be the checked-out commit and an ancestor of
  `origin/main`;
- rejects a tag that does not equal `v<package version>`;
- rejects `1.x` and later tags unless the protected environment contains an
  exact-tag stable-release conformance attestation;
- runs `npm ci` and `npm run verify`;
- rejects changes to generated files after verification;
- performs a clean npm installation of the tarball and dependency graph;
- runs coverage, benchmark smoke, and high-severity dependency audit checks;
- verifies the tarball against generated SHA-256 metadata;
- uploads the tarball, digest, and package-check metadata;
- publishes the verified tarball through npm trusted publishing with
  provenance;
- selects `next` for SemVer prereleases and `latest` otherwise.

It does not verify the restricted-production, independent-signature, or
multi-consumer evidence behind the protected stable-release attestation.

Those remaining items are manual or repository-protection gates. Do not
describe npm provenance as schema provenance or as proof of runtime
conformance.

## Stable 1.0 gate

Do not publish `1.0.0` until the open conformance criteria in
`PROJECT_STATUS.md` are satisfied: restricted-production issuance and event
evidence, independent XMLDSig verification, and use by at least two real
consumer applications.
