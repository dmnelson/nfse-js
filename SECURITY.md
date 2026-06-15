# Security Policy

Please report security vulnerabilities privately through GitHub's security
advisory feature for this repository. Do not include certificates, private
keys, production taxpayer data, or credentials in an issue or test fixture.

Only maintained release lines receive security fixes.

## Security boundaries

- XML parsing rejects DTD and entity declarations and applies configurable byte
  and nesting limits.
- Signature verification authenticates the referenced information element and
  does not return `authenticatedXml` after verification failure.
- Algorithm profiles are explicit; unsupported signature, digest,
  canonicalization, and transform algorithms are rejected.
- HTTP response bodies, retry attempts, and timeouts are bounded. POST
  operations are not retried automatically.
- Built-in transport logs contain operation metadata only. Applications must
  not add taxpayer identifiers, XML bodies, certificates, keys, or passwords.
- Official schemas are committed unchanged with SHA-256 hashes. Runtime
  compatibility patches are generated separately and documented.

The package does not perform online certificate revocation checks. Production
deployments must enforce certificate lifecycle, trust-anchor, OCSP/CRL, secret
storage, and access-control requirements appropriate to their environment.

## Dependency and release controls

CI runs a high-severity dependency audit, the full verification suite, coverage
checks, and packed ESM/CommonJS consumer tests. Tagged releases rerun
verification and publish with npm provenance. Maintainers must review audit
findings rather than suppressing them without a documented risk decision.
