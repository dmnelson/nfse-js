import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { schemaCoverageDpsInputs } from "./fixtures.js";

interface CoverageEntry {
  readonly xsdType: string;
  readonly typescript: string;
  readonly serializer: string;
  readonly validation: string;
  readonly fixtures: readonly string[];
}

describe("DPS schema coverage manifest", () => {
  it("tracks every complex type reachable from TCInfDPS", () => {
    const parser = new XMLParser({
      attributeNamePrefix: "@_",
      ignoreAttributes: false,
    });
    const schema = parser.parse(
      readFileSync(new URL("../schemas/1.01/tiposComplexos_v1.01.xsd", import.meta.url), "utf8"),
    );
    const complexTypes = new Map<string, unknown>(
      schema["xs:schema"]["xs:complexType"].map((type: Record<string, unknown>) => [
        type["@_name"],
        type,
      ]),
    );
    const reachableTypes = collectReachableTypes("TCInfDPS", complexTypes);
    const coverage = JSON.parse(
      readFileSync(new URL("../schemas/1.01/dps-coverage.json", import.meta.url), "utf8"),
    ) as CoverageEntry[];

    expect(coverage.map(({ xsdType }) => xsdType).sort()).toEqual([...reachableTypes].sort());
    expect(new Set(coverage.map(({ xsdType }) => xsdType)).size).toBe(coverage.length);
    const fixtureNames = new Set([
      ...schemaCoverageDpsInputs().map(({ name }) => name),
      "all schema coverage fixtures",
    ]);

    for (const entry of coverage) {
      expect(entry.typescript).not.toBe("");
      expect(entry.serializer).not.toBe("");
      expect(entry.validation).not.toBe("");
      expect(entry.fixtures.length).toBeGreaterThan(0);
      for (const fixture of entry.fixtures) {
        expect(fixtureNames.has(fixture)).toBe(true);
      }
    }
  });

  it("does not expose raw extension groups in the DPS model", () => {
    const types = readFileSync(new URL("../src/core/types.ts", import.meta.url), "utf8");

    expect(types).not.toContain("ExtensionGroup");
    expect(types).not.toContain("ExtensionValue");
  });
});

function collectReachableTypes(
  start: string,
  complexTypes: ReadonlyMap<string, unknown>,
): ReadonlySet<string> {
  const reachable = new Set<string>();
  const pending = [start];

  while (pending.length > 0) {
    const typeName = pending.pop();
    if (!typeName || reachable.has(typeName)) {
      continue;
    }

    reachable.add(typeName);
    for (const reference of collectTypeReferences(complexTypes.get(typeName))) {
      if (complexTypes.has(reference)) {
        pending.push(reference);
      }
    }
  }

  return reachable;
}

function collectTypeReferences(
  value: unknown,
  references = new Set<string>(),
): ReadonlySet<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTypeReferences(item, references);
    }
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record["@_type"] === "string" && record["@_type"].startsWith("TC")) {
      references.add(record["@_type"]);
    }
    for (const [key, child] of Object.entries(record)) {
      if (!key.startsWith("@_")) {
        collectTypeReferences(child, references);
      }
    }
  }

  return references;
}
