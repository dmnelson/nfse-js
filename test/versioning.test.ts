import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  assertSupportedNationalNfseVersion,
  getNationalNfseSchema,
  getNationalNfseSchemaSet,
  getNationalNfseSchemas,
  isSupportedNationalNfseVersion,
  SUPPORTED_NATIONAL_NFSE_VERSIONS,
} from "../src/schemas/index.js";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "nfse-js-versioning-"));
const repositoryRoot = new URL("..", import.meta.url);

afterAll(() => {
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("schema and version lifecycle", () => {
  it("exposes explicit supported-version selection", () => {
    expect(SUPPORTED_NATIONAL_NFSE_VERSIONS).toEqual(["1.01"]);
    expect(isSupportedNationalNfseVersion("1.01")).toBe(true);
    expect(isSupportedNationalNfseVersion("2.00")).toBe(false);
    expect(getNationalNfseSchemaSet("1.01")).toEqual({
      version: "1.01",
      files: getNationalNfseSchemas("1.01"),
    });
    expect(getNationalNfseSchema("DPS_v1.01.xsd", "1.01").contents).toContain('name="DPS"');
    expect(() => assertSupportedNationalNfseVersion("2.00")).toThrowError(RangeError);
    expect(() => getNationalNfseSchemas("2.00" as never)).toThrowError(RangeError);
  });

  it("exposes deeply immutable schema collections", () => {
    const schemas = getNationalNfseSchemas();
    const schemaSet = getNationalNfseSchemaSet();

    expect(Object.isFrozen(SUPPORTED_NATIONAL_NFSE_VERSIONS)).toBe(true);
    expect(Object.isFrozen(schemas)).toBe(true);
    expect(schemas.every((schema) => Object.isFrozen(schema))).toBe(true);
    expect(Object.isFrozen(schemaSet)).toBe(true);
    expect(() => {
      (schemas as SchemaFileForMutation[]).push({ fileName: "extra.xsd", contents: "" });
    }).toThrow(TypeError);
    expect(() => {
      (schemas[0] as { fileName: string }).fileName = "changed.xsd";
    }).toThrow(TypeError);
  });

  it("keeps official and runtime schema hashes aligned with an exact manifest file set", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../schemas/manifest.json", import.meta.url), "utf8"),
    ) as SchemaManifest;
    const directoryFiles = readdirSync(new URL("../schemas/1.01", import.meta.url))
      .filter((fileName) => fileName.endsWith(".xsd"))
      .sort();
    const officialFiles = Object.keys(manifest.files).sort();
    const runtimeFiles = Object.keys(manifest.runtimeFiles).sort();

    expect(manifest.version).toBe("1.01");
    expect(officialFiles).toEqual(directoryFiles);
    expect(runtimeFiles).toEqual(directoryFiles);
    for (const [fileName, expectedHash] of Object.entries(manifest.files)) {
      const contents = readFileSync(new URL(`../schemas/1.01/${fileName}`, import.meta.url));
      expect(createHash("sha256").update(contents).digest("hex")).toBe(expectedHash);
    }
    for (const schema of getNationalNfseSchemas()) {
      expect(createHash("sha256").update(schema.contents).digest("hex")).toBe(
        manifest.runtimeFiles[schema.fileName],
      );
    }
  });

  it("records deterministic compatibility patches with exact match counts", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../schemas/manifest.json", import.meta.url), "utf8"),
    ) as SchemaManifest;

    expect(manifest.compatibilityPatches).not.toHaveLength(0);
    for (const patch of manifest.compatibilityPatches) {
      const official = readFileSync(
        new URL(`../schemas/1.01/${patch.file}`, import.meta.url),
        "utf8",
      );
      for (const replacement of patch.replacements) {
        expect(replacement.search).not.toBe("");
        expect(official.split(replacement.search).length - 1).toBe(replacement.expectedCount);
      }
    }
  });

  it("tracks technical notes separately from schema releases", () => {
    const tracker = JSON.parse(
      readFileSync(new URL("../schemas/technical-notes.json", import.meta.url), "utf8"),
    ) as {
      readonly lastReviewedAt: string;
      readonly source: string;
      readonly notes: readonly unknown[];
    };

    expect(tracker.lastReviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(tracker.source).toMatch(/^https:\/\/www\.gov\.br\/nfse\//);
    expect(tracker.notes).toEqual([]);
  });

  it("stages reviewable schema diffs without modifying supported files", () => {
    const unchangedOutput = join(temporaryDirectory, "unchanged");
    runStage(new URL("../schemas/1.01", import.meta.url), unchangedOutput);
    const unchanged = readReport(unchangedOutput);
    expect(unchanged.files).toHaveLength(10);
    expect(new Set(unchanged.files.map(({ status }) => status))).toEqual(new Set(["unchanged"]));

    const modifiedSource = join(temporaryDirectory, "source");
    cpSync(new URL("../schemas/1.01", import.meta.url), modifiedSource, { recursive: true });
    writeFileSync(
      join(modifiedSource, "DPS_v1.01.xsd"),
      `${readFileSync(join(modifiedSource, "DPS_v1.01.xsd"), "utf8")}\n`,
    );
    unlinkSync(join(modifiedSource, "evento_v1.01.xsd"));
    const changedOutput = join(temporaryDirectory, "changed");
    runStage(modifiedSource, changedOutput);
    const changed = readReport(changedOutput);

    expect(changed.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "DPS_v1.01.xsd", status: "changed" }),
        expect.objectContaining({ file: "evento_v1.01.xsd", status: "removed" }),
      ]),
    );
    expect(() => runStage(modifiedSource, changedOutput)).toThrow();
  });
});

interface SchemaUpdateReport {
  readonly files: readonly {
    readonly file: string;
    readonly status: "added" | "changed" | "unchanged" | "removed";
  }[];
}

interface SchemaFileForMutation {
  fileName: string;
  contents: string;
}

interface SchemaManifest {
  readonly version: string;
  readonly compatibilityPatches: readonly {
    readonly file: string;
    readonly replacements: readonly {
      readonly search: string;
      readonly replace: string;
      readonly expectedCount: number;
    }[];
  }[];
  readonly files: Readonly<Record<string, string>>;
  readonly runtimeFiles: Readonly<Record<string, string>>;
}

function runStage(source: URL | string, output: string): void {
  execFileSync(
    process.execPath,
    [
      new URL("../scripts/stage-schema-update.mjs", import.meta.url).pathname,
      "--source",
      source instanceof URL ? source.pathname : source,
      "--version",
      "1.01",
      "--output",
      output,
    ],
    { cwd: repositoryRoot, stdio: "pipe" },
  );
}

function readReport(output: string): SchemaUpdateReport {
  return JSON.parse(
    readFileSync(join(output, "schema-update-report.json"), "utf8"),
  ) as SchemaUpdateReport;
}
