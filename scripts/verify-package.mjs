#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "nfse-js-package-"));
const npmCacheDirectory = join(temporaryDirectory, "npm-cache");
const argumentsMap = parseArguments(process.argv.slice(2));
const cleanInstall =
  argumentsMap.has("clean-install") || process.env.NFSE_PACKAGE_CLEAN_INSTALL === "1";
const retainedOutputDirectory = argumentsMap.get("output") ?? process.env.NFSE_PACKAGE_OUTPUT;
const packageOutputDirectory = retainedOutputDirectory
  ? resolve(retainedOutputDirectory)
  : join(temporaryDirectory, "package");

try {
  prepareOutputDirectory(packageOutputDirectory);
  const packOutput = run("npm", ["pack", "--json", "--pack-destination", packageOutputDirectory]);
  const [packResult] = JSON.parse(packOutput);
  const projectPackage = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
  const packageLock = JSON.parse(readFileSync(join(repositoryRoot, "package-lock.json"), "utf8"));

  assert(packResult, "npm pack did not return a package result");
  assert.equal(packResult.name, projectPackage.name);
  assert.equal(packResult.version, projectPackage.version);
  assert.equal(packageLock.version, projectPackage.version);
  assert.equal(packageLock.packages[""].version, projectPackage.version);

  const packagedPaths = new Set(packResult.files.map((file) => file.path));
  for (const requiredPath of [
    "dist/index.js",
    "dist/index.cjs",
    "dist/index.d.ts",
    "dist/core/index.js",
    "dist/core/index.cjs",
    "dist/events/index.js",
    "dist/events/index.cjs",
    "dist/events/index.d.ts",
    "dist/parameters/index.js",
    "dist/parameters/index.cjs",
    "dist/parameters/index.d.ts",
    "dist/parsing/index.js",
    "dist/parsing/index.cjs",
    "dist/parsing/index.d.ts",
    "dist/signing/index.js",
    "dist/signing/index.cjs",
    "dist/signing/index.d.ts",
    "dist/transport/index.js",
    "dist/transport/index.cjs",
    "dist/transport/index.d.ts",
    "dist/validation/index.js",
    "dist/validation/index.cjs",
    "dist/validation/index.d.ts",
    "dist/schemas/index.js",
    "dist/schemas/index.cjs",
    "dist/schemas/index.d.ts",
    "docs/API.md",
    "docs/issuance.md",
    "docs/releases.md",
    "schemas/manifest.json",
    "schemas/technical-notes.json",
    "CHANGELOG.md",
    "COMPATIBILITY.md",
    "README.md",
    "SECURITY.md",
    "SUPPORT.md",
    "LICENSE",
  ]) {
    assert(packagedPaths.has(requiredPath), `Package is missing ${requiredPath}`);
  }

  for (const path of packagedPaths) {
    assert(!path.startsWith("src/"), `Package unexpectedly contains ${path}`);
    assert(!path.startsWith("test/"), `Package unexpectedly contains ${path}`);
    assert(!path.startsWith(".github/"), `Package unexpectedly contains ${path}`);
  }

  const tarballPath = join(packageOutputDirectory, packResult.filename);
  const consumerDirectory = join(temporaryDirectory, "consumer");
  const consumerModulesDirectory = join(consumerDirectory, "node_modules");
  const installedPackageDirectory = join(consumerModulesDirectory, "nfse-js");
  const packageJson = {
    private: true,
    type: "module",
    ...(cleanInstall
      ? {
          dependencies: {
            "nfse-js": `file:${tarballPath}`,
          },
          devDependencies: {
            "@types/node": projectPackage.devDependencies["@types/node"],
            typescript: projectPackage.devDependencies.typescript,
          },
        }
      : {}),
  };

  mkdirSync(consumerDirectory, { recursive: true });
  writeFileSync(
    join(consumerDirectory, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  if (cleanInstall) {
    run(
      "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"],
      consumerDirectory,
    );
  } else {
    mkdirSync(installedPackageDirectory, { recursive: true });
    run(
      "tar",
      ["-xzf", tarballPath, "-C", installedPackageDirectory, "--strip-components=1"],
      consumerDirectory,
    );
    for (const dependencyName of Object.keys(projectPackage.dependencies)) {
      linkPackage(consumerModulesDirectory, dependencyName);
    }
    linkPackage(consumerModulesDirectory, "@types/node");
  }

  writeFileSync(
    join(consumerDirectory, "esm.mjs"),
    `import assert from "node:assert/strict";
import { createDps as createDpsFromRoot, validateDpsXml as validateDpsXmlFromRoot } from "nfse-js";
import { createDps, decimal, serializeDps } from "nfse-js/core";
import { buildEventRequestId } from "nfse-js/events";
import { createMunicipalParameterResolver } from "nfse-js/parameters";
import { parseDpsXml, parseSefinDocumentResponse } from "nfse-js/parsing";
import { NATIONAL_NFSE_XMLDSIG_PROFILE } from "nfse-js/signing";
import {
  getNationalNfseSchemas,
  SUPPORTED_NATIONAL_NFSE_VERSIONS,
} from "nfse-js/schemas";
import { NATIONAL_SEFIN_ENDPOINTS } from "nfse-js/transport";
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
assert.equal(typeof createDpsFromRoot, "function");
assert.equal(typeof validateDpsXmlFromRoot, "function");
assert.deepEqual(parseDpsXml(xml).document, dps);
assert.match(buildEventRequestId("1".repeat(50), "e101101"), /^PRE\\d{56}$/);
assert.equal(typeof createMunicipalParameterResolver, "function");
assert.equal(parseSefinDocumentResponse('{"errors":["rejected"]}', { status: 422 }).kind, "rejection");
assert.match(NATIONAL_NFSE_XMLDSIG_PROFILE.signatureAlgorithm, /rsa-sha256$/);
assert.match(NATIONAL_SEFIN_ENDPOINTS.production.sefin, /^https:/);
assert.deepEqual(SUPPORTED_NATIONAL_NFSE_VERSIONS, ["1.01"]);
assert.equal(getNationalNfseSchemas().length, 10);
assert.equal((await validateDpsXml(xml, { throwOnInvalid: false })).valid, true);
`,
  );

  writeFileSync(
    join(consumerDirectory, "commonjs.cjs"),
    `const assert = require("node:assert/strict");
const root = require("nfse-js");
const core = require("nfse-js/core");
const events = require("nfse-js/events");
const parameters = require("nfse-js/parameters");
const parsing = require("nfse-js/parsing");
const schemas = require("nfse-js/schemas");
const signing = require("nfse-js/signing");
const transport = require("nfse-js/transport");
const validation = require("nfse-js/validation");

assert.equal(typeof root.createDps, "function");
assert.equal(typeof root.validateDpsXml, "function");
assert.equal(typeof core.serializeDps, "function");
assert.equal(typeof events.serializeEventRequest, "function");
assert.equal(typeof parameters.createMunicipalParameterResolver, "function");
assert.equal(typeof parsing.parseDpsXml, "function");
assert.equal(typeof parsing.parseNfseXml, "function");
assert.equal(typeof parsing.parseRegisteredEventXml, "function");
assert.equal(typeof parsing.parseSefinDocumentResponse, "function");
assert.equal(typeof signing.createPemSigner, "function");
assert.equal(typeof signing.signDpsXml, "function");
assert.equal(typeof signing.verifyNationalXmlSignature, "function");
assert.equal(typeof transport.createSefinClient, "function");
assert.equal(typeof transport.createNodeHttpTransport, "function");
assert.equal(typeof validation.validateDpsXml, "function");
assert.deepEqual(schemas.SUPPORTED_NATIONAL_NFSE_VERSIONS, ["1.01"]);
assert.equal(schemas.getNationalNfseSchemas().length, 10);
`,
  );

  writeFileSync(
    join(consumerDirectory, "typescript-esm.ts"),
    `import {
  createDps,
  decimal,
  type DpsDocument,
  type DpsInput,
  type ValidationIssue,
} from "nfse-js";
import { getNationalNfseSchema, type SchemaFile } from "nfse-js/schemas";

const input: DpsInput = {
  infDPS: {
    tpAmb: "2",
    dhEmi: "2026-06-11T10:30:00+01:00",
    verAplic: "typescript-consumer",
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
      cServ: { cTribNac: "010101", xDescServ: "Type consumer" },
    },
    valores: {
      vServPrest: { vServ: decimal("1.00") },
      trib: {
        tribMun: { tribISSQN: "1", tpRetISSQN: "1" },
        totTrib: { indTotTrib: "0" },
      },
    },
  },
};
const document: DpsDocument = createDps(input);
const schema: SchemaFile = getNationalNfseSchema("DPS_v1.01.xsd");
const issue: ValidationIssue = {
  path: "infDPS",
  code: "consumer",
  category: "business",
  message: "consumer type check",
};
void [document, schema, issue];
`,
  );
  writeFileSync(
    join(consumerDirectory, "typescript-commonjs.cts"),
    `import {
  createDps,
  decimal,
  type DpsDocument,
  type DpsInput,
} from "nfse-js";
import { getNationalNfseSchemas } from "nfse-js/schemas";

const input: DpsInput = {
  infDPS: {
    tpAmb: "2",
    dhEmi: "2026-06-11T10:30:00+01:00",
    verAplic: "typescript-consumer",
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
      cServ: { cTribNac: "010101", xDescServ: "Type consumer" },
    },
    valores: {
      vServPrest: { vServ: decimal("1.00") },
      trib: {
        tribMun: { tribISSQN: "1", tpRetISSQN: "1" },
        totTrib: { indTotTrib: "0" },
      },
    },
  },
};
const document: DpsDocument = createDps(input);
void [document, getNationalNfseSchemas()];
`,
  );
  writeFileSync(
    join(consumerDirectory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          noEmit: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
          skipLibCheck: false,
          types: ["node"],
        },
        files: ["typescript-esm.ts", "typescript-commonjs.cts"],
      },
      null,
      2,
    )}\n`,
  );

  run("node", ["esm.mjs"], consumerDirectory);
  run("node", ["commonjs.cjs"], consumerDirectory);
  run(
    process.execPath,
    [
      join(
        cleanInstall ? consumerDirectory : repositoryRoot,
        "node_modules",
        "typescript",
        "bin",
        "tsc",
      ),
      "--project",
      "tsconfig.json",
    ],
    consumerDirectory,
  );

  const packageBytes = readFileSync(tarballPath);
  const packageSize = packageBytes.byteLength;
  const digest = createHash("sha256").update(packageBytes).digest("hex");
  const verification = {
    name: packResult.name,
    version: packResult.version,
    tarball: packResult.filename,
    sha256: digest,
    size: packageSize,
    entryCount: packResult.entryCount,
    installation: cleanInstall ? "clean-npm-install" : "linked-offline-smoke",
  };
  writeFileSync(
    join(packageOutputDirectory, "SHA256SUMS"),
    `${digest}  ${packResult.filename}\n`,
    "utf8",
  );
  writeFileSync(
    join(packageOutputDirectory, "package-check.json"),
    `${JSON.stringify(verification, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `Verified ${packResult.filename}: ${packResult.entryCount} files, ${packageSize} bytes, sha256 ${digest}, ${verification.installation}`,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

function parseArguments(args) {
  const result = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--clean-install") {
      result.set("clean-install", "true");
      continue;
    }
    if (argument !== "--output") {
      throw new Error(`unexpected argument: ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("missing value for --output");
    }
    result.set("output", value);
    index += 1;
  }
  return result;
}

function prepareOutputDirectory(path) {
  if (existsSync(path)) {
    assert.equal(readdirSync(path).length, 0, `package output directory is not empty: ${path}`);
    return;
  }
  mkdirSync(path, { recursive: true });
}

function linkPackage(nodeModulesDirectory, packageName) {
  const packageLink = join(nodeModulesDirectory, packageName);
  mkdirSync(dirname(packageLink), { recursive: true });
  symlinkSync(join(repositoryRoot, "node_modules", packageName), packageLink, "junction");
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
