#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(scriptDirectory, "..");
const argumentsMap = parseArguments(process.argv.slice(2));
const source = requiredArgument(argumentsMap, "source");
const version = argumentsMap.get("version") ?? "1.01";
const output = resolve(
  argumentsMap.get("output") ??
    join(
      repositoryRoot,
      ".schema-staging",
      `${version}-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    ),
);
const supportedDirectory = join(repositoryRoot, "schemas", version);

if (existsSync(output)) {
  throw new Error(`staging output already exists: ${output}`);
}
mkdirSync(output, { recursive: true });

let downloadedFile;
try {
  const sourcePath = await resolveSource(source);
  downloadedFile = sourcePath.temporary ? sourcePath.path : undefined;
  const files = readSchemaSource(sourcePath.path, version);
  if (files.size === 0) {
    throw new Error(`source does not contain XSD files for version ${version}`);
  }

  const supported = readSchemaDirectory(supportedDirectory);
  const reportFiles = [];
  for (const [fileName, contents] of [...files.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    writeFileSync(join(output, fileName), contents);
    const previous = supported.get(fileName);
    reportFiles.push({
      file: fileName,
      status:
        previous === undefined ? "added" : previous.equals(contents) ? "unchanged" : "changed",
      sha256: sha256(contents),
      ...(previous === undefined ? {} : { previousSha256: sha256(previous) }),
    });
  }
  for (const [fileName, contents] of supported) {
    if (!files.has(fileName)) {
      reportFiles.push({
        file: fileName,
        status: "removed",
        previousSha256: sha256(contents),
      });
    }
  }

  const report = {
    standard: "Sistema Nacional NFS-e",
    version,
    source,
    stagedAt: new Date().toISOString(),
    output,
    files: reportFiles.sort((left, right) => left.file.localeCompare(right.file)),
  };
  writeFileSync(
    join(output, "schema-update-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(`Staged ${files.size} schemas in ${output}: ${summarize(report.files)}`);
} finally {
  if (downloadedFile) {
    rmSync(dirname(downloadedFile), { recursive: true, force: true });
  }
}

function parseArguments(args) {
  const result = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument?.startsWith("--")) {
      throw new Error(`unexpected argument: ${argument}`);
    }
    const name = argument.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`missing value for --${name}`);
    }
    result.set(name, value);
    index += 1;
  }
  return result;
}

function requiredArgument(argumentsMap, name) {
  const value = argumentsMap.get(name);
  if (!value) {
    throw new Error(`missing required --${name}`);
  }
  return value;
}

async function resolveSource(value) {
  if (!/^https?:\/\//i.test(value)) {
    return { path: resolve(value), temporary: false };
  }
  const response = await fetch(value, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`schema download failed with HTTP ${response.status}`);
  }
  const directory = mkdtempSync(join(tmpdir(), "nfse-js-schema-"));
  const path = join(directory, "schemas.zip");
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  return { path, temporary: true };
}

function readSchemaSource(path, version) {
  if (!existsSync(path)) {
    throw new Error(`schema source does not exist: ${path}`);
  }
  if (statSync(path).isDirectory()) {
    const versionDirectory = existsSync(join(path, "Schemas", version))
      ? join(path, "Schemas", version)
      : path;
    return readSchemaDirectory(versionDirectory);
  }
  return readSchemaZip(path, version);
}

function readSchemaDirectory(path) {
  if (!existsSync(path)) {
    return new Map();
  }
  return new Map(
    readdirSync(path)
      .filter((fileName) => fileName.endsWith(".xsd"))
      .sort()
      .map((fileName) => [fileName, readFileSync(join(path, fileName))]),
  );
}

function readSchemaZip(path, version) {
  let entries;
  try {
    entries = execFileSync("unzip", ["-Z1", path], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch (error) {
    throw new Error("could not list schema archive; install the unzip command", { cause: error });
  }
  const suffix = `/Schemas/${version}/`;
  const selected = entries.filter(
    (entry) =>
      entry.endsWith(".xsd") && (entry.startsWith(`Schemas/${version}/`) || entry.includes(suffix)),
  );
  const result = new Map();
  for (const entry of selected) {
    const fileName = basename(entry);
    if (result.has(fileName)) {
      throw new Error(`schema archive contains duplicate file ${fileName}`);
    }
    result.set(
      fileName,
      execFileSync("unzip", ["-p", path, entry], { maxBuffer: 10 * 1024 * 1024 }),
    );
  }
  return result;
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function summarize(files) {
  const counts = new Map();
  for (const file of files) {
    counts.set(file.status, (counts.get(file.status) ?? 0) + 1);
  }
  return ["added", "changed", "unchanged", "removed"]
    .filter((status) => counts.has(status))
    .map((status) => `${counts.get(status)} ${status}`)
    .join(", ");
}
