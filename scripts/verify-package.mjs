#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "nfse-js-package-"));
const npmCacheDirectory = join(temporaryDirectory, "npm-cache");

try {
  const packOutput = run("npm", ["pack", "--json", "--pack-destination", temporaryDirectory]);
  const [packResult] = JSON.parse(packOutput);

  assert(packResult, "npm pack did not return a package result");
  assert.equal(packResult.name, "nfse-js");

  const packagedPaths = new Set(packResult.files.map((file) => file.path));
  for (const requiredPath of [
    "dist/index.js",
    "dist/index.cjs",
    "dist/index.d.ts",
    "dist/core/index.js",
    "dist/core/index.cjs",
    "dist/parsing/index.js",
    "dist/parsing/index.cjs",
    "dist/validation/index.js",
    "dist/schemas/index.js",
    "schemas/manifest.json",
    "README.md",
    "LICENSE",
  ]) {
    assert(packagedPaths.has(requiredPath), `Package is missing ${requiredPath}`);
  }

  for (const path of packagedPaths) {
    assert(!path.startsWith("src/"), `Package unexpectedly contains ${path}`);
    assert(!path.startsWith("test/"), `Package unexpectedly contains ${path}`);
    assert(!path.startsWith(".github/"), `Package unexpectedly contains ${path}`);
  }

  const tarballPath = join(temporaryDirectory, packResult.filename);
  const consumerDirectory = join(temporaryDirectory, "consumer");
  const consumerModulesDirectory = join(consumerDirectory, "node_modules");
  const installedPackageDirectory = join(consumerModulesDirectory, "nfse-js");
  const packageJson = {
    private: true,
  };

  mkdirSync(installedPackageDirectory, { recursive: true });
  writeFileSync(
    join(consumerDirectory, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  run(
    "tar",
    ["-xzf", tarballPath, "-C", installedPackageDirectory, "--strip-components=1"],
    consumerDirectory,
  );

  const projectPackage = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
  for (const dependencyName of Object.keys(projectPackage.dependencies)) {
    symlinkSync(
      join(repositoryRoot, "node_modules", dependencyName),
      join(consumerModulesDirectory, dependencyName),
      "junction",
    );
  }

  writeFileSync(
    join(consumerDirectory, "esm.mjs"),
    `import assert from "node:assert/strict";
import { createDps, decimal, serializeDps } from "nfse-js/core";
import { parseDpsXml, parseSefinDocumentResponse } from "nfse-js/parsing";
import { getNationalNfseSchemas } from "nfse-js/schemas";
import { validateDpsXml } from "nfse-js/validation";

const dps = createDps({
  infDPS: {
    tpAmb: "2",
    dhEmi: "2026-06-11T10:30:00+01:00",
    verAplic: "package-check",
    serie: "1",
    nDPS: "1",
    dCompet: "2026-06-11",
    tpEmit: "1",
    cLocEmi: "3550308",
    prest: {
      CNPJ: "12345678000195",
      regTrib: { opSimpNac: "1", regEspTrib: "0" },
    },
    serv: {
      locPrest: { cLocPrestacao: "3550308" },
      cServ: { cTribNac: "010101", xDescServ: "Package check" },
    },
    valores: {
      vServPrest: { vServ: decimal("1.00") },
      trib: {
        tribMun: { tribISSQN: "1", tpRetISSQN: "1" },
        totTrib: { indTotTrib: "0" },
      },
    },
  },
});

const xml = serializeDps(dps);
assert.deepEqual(parseDpsXml(xml).document, dps);
assert.equal(parseSefinDocumentResponse('{"errors":["rejected"]}', { status: 422 }).kind, "rejection");
assert.equal(getNationalNfseSchemas().length, 10);
assert.equal((await validateDpsXml(xml, { throwOnInvalid: false })).valid, true);
`,
  );

  writeFileSync(
    join(consumerDirectory, "commonjs.cjs"),
    `const assert = require("node:assert/strict");
const core = require("nfse-js/core");
const parsing = require("nfse-js/parsing");
const schemas = require("nfse-js/schemas");
const validation = require("nfse-js/validation");

assert.equal(typeof core.serializeDps, "function");
assert.equal(typeof parsing.parseDpsXml, "function");
assert.equal(typeof parsing.parseNfseXml, "function");
assert.equal(typeof parsing.parseRegisteredEventXml, "function");
assert.equal(typeof parsing.parseSefinDocumentResponse, "function");
assert.equal(typeof validation.validateDpsXml, "function");
assert.equal(schemas.getNationalNfseSchemas().length, 10);
`,
  );

  run("node", ["esm.mjs"], consumerDirectory);
  run("node", ["commonjs.cjs"], consumerDirectory);

  const packageSize = readFileSync(tarballPath).byteLength;
  console.log(
    `Verified ${packResult.filename}: ${packResult.entryCount} files, ${packageSize} bytes packed`,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

function run(command, arguments_, cwd = repositoryRoot) {
  return execFileSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_cache: npmCacheDirectory,
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
}
