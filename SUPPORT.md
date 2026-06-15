# Support Matrix

| Area | Supported | Notes |
| --- | --- | --- |
| Node.js | 20, 22, 24 | Tested in CI |
| Modules | ESM and CommonJS | Runtime consumers exercise the unpacked tarball |
| TypeScript | Generated declarations | Strict ESM/CommonJS consumers compile against packed declarations |
| Root import | Core, errors, and XSD validation | Lifecycle modules use explicit subpath imports |
| National schema | NFS-e v1.01 | Explicitly selectable and immutable |
| DPS model | All reachable `TCInfDPS` complex types | Deterministic XML for named coverage fixtures |
| Local DPS validation | Partial deterministic coverage | Selected facets and business rules; see `PROJECT_STATUS.md` |
| Issued documents | DPS, NFS-e, request event, registered event parsing | Unknown generated subtrees retained losslessly |
| Signing credentials | PEM, PKCS#12/PFX, external signer | RSA-SHA256 default profile pending live confirmation |
| Transport | Node HTTP/HTTPS, mutual TLS, injectable adapter | Restricted-production and production hosts modeled |
| Events | All 16 v1.01 request variants | XSD-tested generation; full parser payload fidelity and remote rules remain pending |
| Municipal parameters | Lossless fetch, explicit mapper, bounded cache | Current public response field names are not stable |
| Legacy formats | Not supported | ABRASF and municipal legacy layouts are out of scope |

## Environment status

The implementation exposes APIs across the documented National lifecycle.
Current received-document, transport, and signing fixtures are synthetic; the
project does not yet retain a sanitized successful restricted-production
issuance or event exchange. Production readiness requires environment-specific
conformance evidence.

## Release status

The roadmap-completion branch is a `0.2.0` candidate because it includes
breaking public type and validation changes relative to `0.1.0`. Package and
lock metadata and the changelog report `0.2.0`, but no `0.2.0` release has
been published.

The packed-consumer check runs ESM/CommonJS consumers and compiles TypeScript
consumers. Its default local mode links already-installed dependencies for
offline repeatability; Node.js 22 CI and the release workflow additionally
perform a clean npm installation of the tarball and its dependency graph.

The current tag workflow requires the tagged commit on `origin/main`, checks
tag/version equality, runs `npm run verify`, rejects generated-file changes,
verifies the package digest, performs the clean consumer installation, runs
coverage and dependency audit checks, and publishes the verified artifact with
npm provenance. Benchmark results and external conformance evidence remain
manual gates before tagging.

Only maintained release lines receive security fixes. Before `1.0.0`, the
maintained line is the latest published prerelease or `0.x` minor release.
After `0.2.0` is published, `0.1.x` should not be assumed to receive fixes.
