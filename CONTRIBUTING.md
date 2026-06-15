# Contributing

This project targets the Brazilian National NFS-e standard. Changes that alter
wire output should cite the relevant XSD, manual, technical note, or API
documentation and include a fixture-based test.

## Development

```sh
npm install
npm run verify
```

The files under `schemas/1.01/` are official source artifacts. Do not modify
them to accommodate a validator. Runtime compatibility adjustments belong in
`scripts/generate-schema-module.mjs` and must be documented in
`schemas/manifest.json`.

Generated schema code is committed. Regenerate it after changing the schema
bundle:

```sh
npm run generate:schemas
```

Stage a candidate official bundle before making any intentional schema change:

```sh
npm run schema:stage -- --source /path/to/schemas.zip --version 1.01
```

For a remote official bundle, use an HTTPS `gov.br` URL and provide an
independently verified digest with `--sha256`.

Review the generated hash report under `.schema-staging/`. Never replace an
existing version in place; add a new version directory and update the
version-selection API when the National standard publishes a transition.
