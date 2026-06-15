# Benchmarks

Run the local release benchmark against built artifacts:

```sh
npm run benchmark
```

The harness measures:

- deterministic DPS serialization;
- secure DPS parsing;
- batch issuance preparation;
- libxml2/WASM XSD validation;
- RSA-SHA256 XML signing;
- signature verification.

It generates an in-memory self-signed 2048-bit RSA credential for each run.
No key material is written to disk. Results depend heavily on CPU, Node.js
version, WASM startup, certificate backend, and document shape.

CI and the release workflow execute the harness as a smoke test. A benchmark
operation failing is a gate, but the reported throughput is diagnostic and has
no automatic pass/fail threshold. Record Node version, hardware, package
commit, iterations, and representative document shape before using results for
capacity planning. Network and SEFIN latency are deliberately excluded.
