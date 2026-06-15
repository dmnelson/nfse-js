import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "nfse-js-schema-staging-"));
const script = fileURLToPath(new URL("../scripts/stage-schema-update.mjs", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

afterAll(() => {
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("remote schema staging policy", () => {
  it("rejects cleartext remote sources before downloading", () => {
    expectStageFailure("http://www.gov.br/schemas.zip", "remote schema sources must use HTTPS");
  });

  it("rejects non-official remote hosts before downloading", () => {
    expectStageFailure(
      "https://example.com/schemas.zip",
      "remote schema source host is not allowed",
      "0".repeat(64),
    );
  });

  it("requires an independently verified remote archive digest", () => {
    expectStageFailure("https://www.gov.br/schemas.zip", "remote schema sources require --sha256");
  });

  it("validates the supplied digest format before downloading", () => {
    expectStageFailure(
      "https://www.gov.br/schemas.zip",
      "--sha256 must be a 64-character hexadecimal",
      "not-a-digest",
    );
  });
});

function expectStageFailure(source: string, expectedMessage: string, sha256?: string): void {
  const output = join(temporaryDirectory, `output-${Math.random().toString(16).slice(2)}`);
  const args = [script, "--source", source, "--version", "1.01", "--output", output];
  if (sha256 !== undefined) {
    args.push("--sha256", sha256);
  }
  const result = spawnSync(process.execPath, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(expectedMessage);
}
