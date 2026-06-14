# Support Matrix

| Area | Supported | Notes |
| --- | --- | --- |
| Node.js | 20, 22, 24 | Tested in CI |
| Modules | ESM and CommonJS | Isolated packed-consumer tests |
| TypeScript | Generated declarations | Strict source build uses TypeScript 6 |
| National schema | NFS-e v1.01 | Explicitly selectable and immutable |
| DPS | Complete reachable `TCInfDPS` model | Deterministic XML and local rules |
| Issued documents | DPS, NFS-e, request event, registered event parsing | Unknown generated subtrees retained losslessly |
| Signing credentials | PEM, PKCS#12/PFX, external signer | RSA-SHA256 default profile pending live confirmation |
| Transport | Node HTTP/HTTPS, mutual TLS, injectable adapter | Restricted-production and production hosts modeled |
| Events | All 16 v1.01 request variants | Remote state rules require SEFIN |
| Municipal parameters | Lossless fetch, explicit mapper, bounded cache | Current public response field names are not stable |
| Legacy formats | Not supported | ABRASF and municipal legacy layouts are out of scope |

## Environment status

The implementation and fixture tests cover the documented National lifecycle,
but the project does not yet retain a sanitized successful
restricted-production issuance or event exchange. Production readiness
requires environment-specific conformance evidence.

Only maintained release lines receive security fixes. Before `1.0.0`, the
maintained line is the latest published prerelease or `0.x` minor release.
