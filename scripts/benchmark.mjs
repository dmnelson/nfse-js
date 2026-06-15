#!/usr/bin/env node

import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import forge from "node-forge";
import { createDps, decimal, serializeDps } from "../dist/core/index.js";
import { parseDpsXml } from "../dist/parsing/index.js";
import { createPemSigner, signDpsXml, verifyNationalXmlSignature } from "../dist/signing/index.js";
import { validateDpsXml } from "../dist/validation/index.js";

const verificationTime = new Date("2030-01-01T00:00:00Z");
const input = {
  infDPS: {
    tpAmb: "2",
    dhEmi: "2026-06-12T10:30:00-03:00",
    verAplic: "nfse-js-benchmark",
    serie: "1",
    nDPS: "1",
    dCompet: "2026-06-12",
    tpEmit: "1",
    cLocEmi: "3550308",
    prest: {
      CNPJ: "12345678000195",
      regTrib: { opSimpNac: "1", regEspTrib: "0" },
    },
    toma: {
      CPF: "12345678909",
      xNome: "Benchmark customer",
    },
    serv: {
      locPrest: { cLocPrestacao: "3550308" },
      cServ: {
        cTribNac: "010101",
        xDescServ: "Benchmark service",
      },
    },
    valores: {
      vServPrest: { vServ: decimal("100.00") },
      trib: {
        tribMun: { tribISSQN: "1", tpRetISSQN: "1" },
        totTrib: { indTotTrib: "0" },
      },
    },
  },
};
const document = createDps(input);
const xml = serializeDps(document);
const credentials = createBenchmarkCredentials();
const signer = createPemSigner({
  privateKey: credentials.privateKeyPem,
  certificateChain: [credentials.certificatePem],
});

assert.equal(parseDpsXml(xml).document.infDPS.Id, document.infDPS.Id);
assert.equal((await validateDpsXml(xml, { throwOnInvalid: false })).valid, true);
const signedXml = await signDpsXml(xml, signer, { now: verificationTime });
assert.equal(
  verifyNationalXmlSignature(signedXml, {
    trustedCertificates: [credentials.certificatePem],
    requireTrustedCertificate: true,
    now: verificationTime,
  }).valid,
  true,
);

const results = [];
results.push(measure("serialize DPS", 2_000, () => serializeDps(document)));
results.push(measure("parse DPS", 2_000, () => parseDpsXml(xml)));
results.push(
  measure("prepare issuance batch", 1_000, (index) =>
    serializeDps({
      ...input,
      infDPS: { ...input.infDPS, nDPS: String(index + 1) },
    }),
  ),
);
results.push(
  await measureAsync("validate DPS XSD", 50, () => validateDpsXml(xml, { throwOnInvalid: false })),
);
results.push(
  await measureAsync("sign DPS", 100, () => signDpsXml(xml, signer, { now: verificationTime })),
);
results.push(
  measure("verify DPS signature", 200, () =>
    verifyNationalXmlSignature(signedXml, {
      trustedCertificates: [credentials.certificatePem],
      requireTrustedCertificate: true,
      now: verificationTime,
    }),
  ),
);

console.table(
  results.map(({ name, iterations, durationMs, operationsPerSecond }) => ({
    benchmark: name,
    iterations,
    "duration ms": durationMs.toFixed(1),
    "operations/s": operationsPerSecond.toFixed(1),
  })),
);

function measure(name, iterations, operation) {
  for (let index = 0; index < Math.min(iterations, 20); index += 1) {
    operation(index);
  }
  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    operation(index);
  }
  return result(name, iterations, performance.now() - start);
}

async function measureAsync(name, iterations, operation) {
  for (let index = 0; index < Math.min(iterations, 5); index += 1) {
    await operation(index);
  }
  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    await operation(index);
  }
  return result(name, iterations, performance.now() - start);
}

function result(name, iterations, durationMs) {
  return {
    name,
    iterations,
    durationMs,
    operationsPerSecond: iterations / (durationMs / 1_000),
  };
}

function createBenchmarkCredentials() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date("2025-01-01T00:00:00Z");
  certificate.validity.notAfter = new Date("2035-01-01T00:00:00Z");
  const attributes = [{ name: "commonName", value: "nfse-js benchmark signer" }];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  certificate.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, nonRepudiation: true },
  ]);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  return {
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    certificatePem: forge.pki.certificateToPem(certificate),
  };
}
