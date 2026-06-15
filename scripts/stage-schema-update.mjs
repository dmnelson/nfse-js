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
const expectedSha256 = argumentsMap.get("sha256");
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
const OFFICIAL_SCHEMA_HOSTS = new Set(["gov.br", "www.gov.br"]);
const MAX_SCHEMA_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 5;

if (existsSync(output)) {
  throw new Error(`staging output already exists: ${output}`);
}
mkdirSync(output, { recursive: true });

let downloadedFile;
try {
  const sourcePath = await resolveSource(source, expectedSha256);
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
    ...(sourcePath.finalUrl === undefined ? {} : { finalUrl: sourcePath.finalUrl }),
    ...(sourcePath.sha256 === undefined ? {} : { sourceSha256: sourcePath.sha256 }),
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

async function resolveSource(value, expectedHash) {
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
    const path = resolve(value);
    if (expectedHash !== undefined && existsSync(path) && !statSync(path).isDirectory()) {
      const actualHash = sha256(readFileSync(path));
      assertExpectedHash(actualHash, expectedHash);
      return { path, temporary: false, sha256: actualHash };
    }
    return { path, temporary: false };
  }

  let currentUrl = new URL(value);
  assertOfficialSchemaUrl(currentUrl);
  const normalizedExpectedHash = normalizeExpectedHash(expectedHash);
  let response;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    assertOfficialSchemaUrl(currentUrl);
    response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      break;
    }
    if (redirects === MAX_REDIRECTS) {
      throw new Error(`schema download exceeded ${MAX_REDIRECTS} redirects`);
    }
    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`schema download redirect ${response.status} omitted Location`);
    }
    await response.body?.cancel();
    currentUrl = new URL(location, currentUrl);
  }
  if (!response?.ok) {
    throw new Error(`schema download failed with HTTP ${response?.status ?? "unknown"}`);
  }
  assertOfficialSchemaUrl(new URL(response.url || currentUrl));

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SCHEMA_ARCHIVE_BYTES) {
    throw new Error(`schema archive exceeds ${MAX_SCHEMA_ARCHIVE_BYTES} bytes`);
  }
  const contents = await readBoundedResponse(response, MAX_SCHEMA_ARCHIVE_BYTES);
  const actualHash = sha256(contents);
  assertExpectedHash(actualHash, normalizedExpectedHash);

  const directory = mkdtempSync(join(tmpdir(), "nfse-js-schema-"));
  const path = join(directory, "schemas.zip");
  writeFileSync(path, contents);
  return {
    path,
    temporary: true,
    finalUrl: response.url || currentUrl.href,
    sha256: actualHash,
  };
}

function assertOfficialSchemaUrl(url) {
  if (url.protocol !== "https:") {
    throw new Error("remote schema sources must use HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("remote schema source URLs must not contain credentials");
  }
  if (!OFFICIAL_SCHEMA_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(`remote schema source host is not allowed: ${url.hostname}`);
  }
}

function normalizeExpectedHash(value) {
  if (value === undefined) {
    throw new Error("remote schema sources require --sha256 with an independently verified digest");
  }
  const normalized = value.toLowerCase();
  if (!/^[a-f\d]{64}$/.test(normalized)) {
    throw new Error("--sha256 must be a 64-character hexadecimal SHA-256 digest");
  }
  return normalized;
}

function assertExpectedHash(actual, expected) {
  const normalizedExpected = normalizeExpectedHash(expected);
  if (actual !== normalizedExpected) {
    throw new Error(
      `schema archive SHA-256 mismatch: expected ${normalizedExpected}, got ${actual}`,
    );
  }
}

async function readBoundedResponse(response, maximumBytes) {
  if (!response.body) {
    return Buffer.alloc(0);
  }
  const chunks = [];
  let totalBytes = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new Error(`schema archive exceeds ${maximumBytes} bytes`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, totalBytes);
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
