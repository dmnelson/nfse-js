import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { serializeDps } from "../src/core/index.js";
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
    const fixtures = new Map(
      schemaCoverageDpsInputs().map(({ name, input }) => [name, serializeDps(input)]),
    );
    const typeSymbols = exportedDeclarationNames(
      readFileSync(new URL("../src/core/types.ts", import.meta.url), "utf8"),
    );
    const serializerSymbols = functionDeclarationNames(
      readFileSync(new URL("../src/core/serialize.ts", import.meta.url), "utf8"),
    );
    const elementNamesByType = collectSchemaElementNames(parser);

    for (const entry of coverage) {
      expect(typeSymbols.has(entry.typescript), `${entry.xsdType} TypeScript symbol`).toBe(true);
      expect(
        serializerSymbols.has(entry.serializer),
        `${entry.xsdType} serializer ${entry.serializer}`,
      ).toBe(true);
      expect(entry.validation).not.toBe("");
      expect(entry.fixtures.length).toBeGreaterThan(0);
      const elementNames = elementNamesByType.get(entry.xsdType);
      expect(elementNames?.size, `${entry.xsdType} XSD element references`).toBeGreaterThan(0);
      const fixtureNames = entry.fixtures.includes("all schema coverage fixtures")
        ? [...fixtures.keys()]
        : entry.fixtures;
      for (const fixtureName of fixtureNames) {
        const xml = fixtures.get(fixtureName);
        expect(xml, `${entry.xsdType} fixture ${fixtureName}`).toBeDefined();
        expect(
          [...(elementNames ?? [])].some((name) => containsElement(xml as string, name)),
          `${fixtureName} must serialize ${entry.xsdType} through one of ${[
            ...(elementNames ?? []),
          ].join(", ")}`,
        ).toBe(true);
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

function exportedDeclarationNames(source: string): ReadonlySet<string> {
  const file = ts.createSourceFile("types.ts", source, ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  for (const statement of file.statements) {
    if (
      (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
      statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      names.add(statement.name.text);
    }
  }
  return names;
}

function functionDeclarationNames(source: string): ReadonlySet<string> {
  const file = ts.createSourceFile("serialize.ts", source, ts.ScriptTarget.Latest, true);
  return new Set(
    file.statements
      .filter(ts.isFunctionDeclaration)
      .map((statement) => statement.name?.text)
      .filter((name): name is string => name !== undefined),
  );
}

function collectSchemaElementNames(parser: XMLParser): ReadonlyMap<string, ReadonlySet<string>> {
  const result = new Map<string, Set<string>>();
  const schemaDirectory = new URL("../schemas/1.01/", import.meta.url);
  for (const fileName of ["DPS_v1.01.xsd", "tiposComplexos_v1.01.xsd"]) {
    const schema = parser.parse(readFileSync(new URL(fileName, schemaDirectory), "utf8"));
    visit(schema);
  }
  return result;

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    const record = value as Record<string, unknown>;
    const typeName =
      typeof record["@_type"] === "string" ? record["@_type"].split(":").at(-1) : undefined;
    const elementName = typeof record["@_name"] === "string" ? record["@_name"] : undefined;
    if (typeName?.startsWith("TC") && elementName) {
      const names = result.get(typeName) ?? new Set<string>();
      names.add(elementName);
      result.set(typeName, names);
    }
    Object.entries(record).forEach(([name, child]) => {
      if (!name.startsWith("@_")) {
        visit(child);
      }
    });
  }
}

function containsElement(xml: string, name: string): boolean {
  return new RegExp(`<${escapeRegExp(name)}(?:[\\s/>])`).test(xml);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
