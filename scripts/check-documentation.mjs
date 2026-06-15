#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));

for (const requiredFile of ["CONTRIBUTING.md", "PROJECT_STATUS.md"]) {
  assert(
    packageJson.files.includes(requiredFile),
    `${requiredFile} is linked from published documentation and must be packaged`,
  );
}

const prohibitedClaims = [
  {
    file: "README.md",
    text: "implementation-complete",
    reason: "model coverage must not be presented as complete conformance",
  },
  {
    file: "SUPPORT.md",
    text: "roadmap-completion branch",
    reason: "support documentation must describe releases generically",
  },
  {
    file: "SUPPORT.md",
    text: "release has been published",
    reason: "the npm registry and GitHub Releases own publication state",
  },
  {
    file: "SUPPORT.md",
    text: "is published",
    reason: "the npm registry and GitHub Releases own publication state",
  },
  {
    file: "PROJECT_STATUS.md",
    text: "The next release is",
    reason: "the roadmap must not duplicate mutable publication state",
  },
];

for (const claim of prohibitedClaims) {
  const contents = readFileSync(join(repositoryRoot, claim.file), "utf8");
  assert(
    !contents.includes(claim.text),
    `${claim.file} contains stale-prone text "${claim.text}": ${claim.reason}`,
  );
}

console.log("Documentation consistency checks passed.");
