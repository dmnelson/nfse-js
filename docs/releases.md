# Release Process

Tagged releases are built and published by `.github/workflows/release.yml`.

## Prerequisites

- Configure the GitHub `npm` environment.
- Add an npm automation token as the `NPM_TOKEN` environment secret.
- Protect the environment with the repository's required reviewers.
- Ensure the npm package points to this repository so provenance is verifiable.

## Prepare a release candidate

1. Choose a SemVer prerelease such as `1.0.0-rc.1`.
2. Update `package.json`, `package-lock.json`, and `CHANGELOG.md`.
3. Run `npm run verify`, `npm run test:coverage`, `npm run benchmark`, and
   `npm audit --audit-level=high`.
4. Commit the release preparation and push it for review.
5. Tag the reviewed commit with exactly `v<package version>` and push the tag.

The workflow rejects mismatched tags, rebuilds and verifies the package, stores
the tarball as a workflow artifact, and publishes with npm provenance.
Prerelease versions use the npm `next` tag; stable versions use `latest`.

## Stable 1.0 gate

Do not publish `1.0.0` until the open conformance criteria in
`PROJECT_STATUS.md` are satisfied: restricted-production issuance and event
evidence, independent XMLDSig verification, and use by at least two real
consumer applications.
