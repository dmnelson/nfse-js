import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { createServer as createHttpsServer, type Server as HttpsServer } from "node:https";
import { gunzipSync } from "node:zlib";
import * as forge from "node-forge";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SefinTransportError, serializeDps } from "../src/index.js";
import {
  createNodeHttpTransport,
  createSefinClient,
  gzipBase64XmlJsonPayload,
  NATIONAL_SEFIN_ENDPOINTS,
  resolveSefinEndpoints,
  type SefinHttpRequest,
  type SefinHttpResponse,
  type SefinHttpTransport,
  type SefinLogEvent,
} from "../src/transport/index.js";
import { validDpsInput } from "./fixtures.js";

const ACCESS_KEY = "1".repeat(50);
const DPS_ID = `DPS${"2".repeat(42)}`;
const DPS_XML = serializeDps(validDpsInput());
const SEFIN_BASE = "http://sefin.test/api";
const ADN_BASE = "http://adn.test/contribuintes";
const PARAMETERS_BASE = "http://parameters.test/api";

describe("SEFIN client", () => {
  it("submits raw DPS XML and parses a generated document response", async () => {
    const transport = new QueueTransport([
      response(200, JSON.stringify({ generated: DPS_XML }), "application/json"),
    ]);
    const client = testClient(transport);
    const result = await client.submitDps(DPS_XML, {
      headers: { "X-Correlation-Id": "request-1" },
    });

    expect(result.payload.kind).toBe("success");
    expect(transport.requests[0]).toEqual(
      expect.objectContaining({
        operation: "submit-dps",
        method: "POST",
        url: `${SEFIN_BASE}/nfse`,
      }),
    );
    expect(transport.requests[0]?.headers).toEqual(
      expect.objectContaining({
        "content-type": "application/xml; charset=utf-8",
        "x-correlation-id": "request-1",
      }),
    );
    expect(Buffer.from(transport.requests[0]?.body ?? []).toString("utf8")).toBe(DPS_XML);
  });

  it("constructs documented SEFIN and ADN query routes", async () => {
    const transport = new QueueTransport([
      response(200, DPS_XML, "application/xml"),
      response(200, JSON.stringify({ chaveAcesso: ACCESS_KEY }), "application/json"),
      response(200, ""),
      response(404, ""),
      response(200, DPS_XML, "application/xml"),
      response(200, DPS_XML, "application/xml"),
      response(200, DPS_XML, "application/xml"),
      response(200, DPS_XML, "application/xml"),
      response(200, DPS_XML, "application/xml"),
      response(200, JSON.stringify({ convenio: true }), "application/json"),
      response(200, JSON.stringify({ aliquota: "5.00" }), "application/json"),
      response(200, JSON.stringify({ retencao: true }), "application/json"),
    ]);
    const client = testClient(transport);

    await client.getNfse(ACCESS_KEY);
    expect((await client.getDpsAccessKey(DPS_ID)).value).toEqual({ chaveAcesso: ACCESS_KEY });
    expect((await client.hasNfseForDps(DPS_ID)).exists).toBe(true);
    expect((await client.hasNfseForDps(DPS_ID)).exists).toBe(false);
    await client.getEvents(ACCESS_KEY);
    await client.getEventsByType(ACCESS_KEY, "101101");
    await client.getEvent(ACCESS_KEY, "101101", 1);
    await client.getAdnDocument("000000000000001");
    await client.getAdnEvents(ACCESS_KEY);
    await client.getMunicipalConvention("3550308");
    await client.getMunicipalServiceParameters("3550308", "010101");
    await client.getMunicipalContributorParameters("3550308", "12345678000195");

    expect(transport.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `GET ${SEFIN_BASE}/nfse/${ACCESS_KEY}`,
      `GET ${SEFIN_BASE}/dps/${DPS_ID}`,
      `HEAD ${SEFIN_BASE}/dps/${DPS_ID}`,
      `HEAD ${SEFIN_BASE}/dps/${DPS_ID}`,
      `GET ${SEFIN_BASE}/nfse/${ACCESS_KEY}/eventos`,
      `GET ${SEFIN_BASE}/nfse/${ACCESS_KEY}/eventos/101101`,
      `GET ${SEFIN_BASE}/nfse/${ACCESS_KEY}/eventos/101101/1`,
      `GET ${ADN_BASE}/DFe/000000000000001`,
      `GET ${ADN_BASE}/NFSe/${ACCESS_KEY}/Eventos`,
      `GET ${PARAMETERS_BASE}/parametros_municipais/3550308/convenio`,
      `GET ${PARAMETERS_BASE}/parametros_municipais/3550308/010101`,
      `GET ${PARAMETERS_BASE}/parametros_municipais/3550308/12345678000195`,
    ]);
  });

  it("sends event JSON and caller-configured gzip/base64 XML wrappers", async () => {
    const transport = new QueueTransport([
      response(422, JSON.stringify({ erros: [{ codigo: "E001" }] }), "application/json"),
      response(422, JSON.stringify({ erros: [{ codigo: "E002" }] }), "application/json"),
    ]);
    const client = testClient(transport);

    const event = await client.registerEvent(ACCESS_KEY, { pedido: "signed-event" });
    const wrapped = gzipBase64XmlJsonPayload(DPS_XML, "dpsXmlGZipB64");
    const submission = await client.submitDps(wrapped);

    expect(event.payload).toEqual(expect.objectContaining({ kind: "rejection", status: 422 }));
    expect(submission.payload).toEqual(expect.objectContaining({ kind: "rejection", status: 422 }));
    expect(JSON.parse(Buffer.from(transport.requests[0]?.body ?? []).toString("utf8"))).toEqual({
      pedido: "signed-event",
    });
    const encoded = JSON.parse(Buffer.from(transport.requests[1]?.body ?? []).toString("utf8")) as {
      dpsXmlGZipB64: string;
    };
    expect(gunzipSync(Buffer.from(encoded.dpsXmlGZipB64, "base64")).toString("utf8")).toBe(DPS_XML);
  });

  it("retries safe queries but never retries submission POSTs", async () => {
    const delays: number[] = [];
    const logs: SefinLogEvent[] = [];
    const queryTransport = new QueueTransport([
      response(503, JSON.stringify({ error: "busy" }), "application/json", {
        "retry-after": "0",
      }),
      new Error("temporary network failure"),
      response(200, DPS_XML, "application/xml"),
    ]);
    const queryClient = testClient(queryTransport, {
      retry: { maxAttempts: 3, baseDelayMs: 5, maxDelayMs: 20 },
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
      logger: (event) => logs.push(event),
    });

    expect((await queryClient.getNfse(ACCESS_KEY)).payload.kind).toBe("success");
    expect(queryTransport.requests).toHaveLength(3);
    expect(delays).toEqual([0, 10]);
    expect(logs.map((event) => event.phase)).toEqual([
      "request",
      "retry",
      "request",
      "retry",
      "request",
      "response",
    ]);
    expect(JSON.stringify(logs)).not.toContain(ACCESS_KEY);
    expect(JSON.stringify(logs)).not.toContain("<DPS");

    const postTransport = new QueueTransport([new Error("connection reset")]);
    const postClient = testClient(postTransport, {
      retry: { maxAttempts: 5, baseDelayMs: 0, maxDelayMs: 0 },
      sleep: async () => {},
    });
    await expect(postClient.submitDps(DPS_XML)).rejects.toEqual(
      expect.objectContaining<Partial<SefinTransportError>>({
        code: "network-error",
        context: expect.objectContaining({ attempt: 1 }),
      }),
    );
    expect(postTransport.requests).toHaveLength(1);
  });

  it("supports the default retry delay and aborts during backoff", async () => {
    const completingTransport = new QueueTransport([
      response(503, JSON.stringify({ error: "busy" }), "application/json"),
      response(200, DPS_XML, "application/xml"),
    ]);
    const completingClient = testClient(completingTransport, {
      retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 },
      logger: () => {
        throw new Error("logger failure must be isolated");
      },
    });
    expect((await completingClient.getNfse(ACCESS_KEY)).payload.kind).toBe("success");

    const controller = new AbortController();
    const abortingTransport = new QueueTransport([
      response(503, JSON.stringify({ error: "busy" }), "application/json"),
    ]);
    const abortingClient = testClient(abortingTransport, {
      retry: { maxAttempts: 2, baseDelayMs: 100, maxDelayMs: 100 },
    });
    const pending = abortingClient.getNfse(ACCESS_KEY, { signal: controller.signal });
    setTimeout(() => controller.abort(), 5);
    await expect(pending).rejects.toEqual(
      expect.objectContaining<Partial<SefinTransportError>>({ code: "aborted" }),
    );
  });

  it("categorizes HTTP, response, abort, and configuration failures", async () => {
    const transport = new QueueTransport([
      response(500, ""),
      response(200, "not-json-or-xml", "text/plain"),
    ]);
    const client = testClient(transport, {
      retry: { maxAttempts: 1 },
    });

    await expect(client.hasNfseForDps(DPS_ID)).rejects.toEqual(
      expect.objectContaining<Partial<SefinTransportError>>({
        code: "http-error",
        context: expect.objectContaining({ status: 500 }),
      }),
    );
    await expect(client.getNfse(ACCESS_KEY)).rejects.toEqual(
      expect.objectContaining<Partial<SefinTransportError>>({ code: "invalid-response" }),
    );
    expect(() => client.getNfse("")).toThrowError(
      expect.objectContaining<Partial<SefinTransportError>>({ code: "invalid-config" }),
    );
    expect(() => resolveSefinEndpoints("production", { sefin: "file:///not-http" })).toThrowError(
      expect.objectContaining<Partial<SefinTransportError>>({ code: "invalid-config" }),
    );
    expect(NATIONAL_SEFIN_ENDPOINTS.production.sefin).toContain("sefin.nfse.gov.br");
    expect(() => gzipBase64XmlJsonPayload(DPS_XML, "")).toThrowError(TypeError);
  });
});

describe("Node HTTP transport", () => {
  let server: Server;
  let baseUrl: string;
  let httpsServer: HttpsServer;
  let httpsBaseUrl: string;
  let tlsCredentials: { readonly key: string; readonly certificate: string };

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === "/slow") {
        setTimeout(() => {
          response.end("late");
        }, 100);
        return;
      }
      if (request.url === "/large") {
        response.setHeader("content-length", "100");
        response.end("x".repeat(100));
        return;
      }
      if (request.url === "/chunked-large") {
        response.write("x".repeat(15));
        response.end("x".repeat(15));
        return;
      }
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        response.setHeader("content-type", "application/json");
        response.setHeader("x-method", request.method ?? "");
        response.end(
          JSON.stringify({
            body: Buffer.concat(chunks).toString("utf8"),
            userAgent: request.headers["user-agent"],
          }),
        );
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("test HTTP server did not expose a TCP address");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;

    tlsCredentials = createTlsCredentials();
    httpsServer = createHttpsServer(
      {
        key: tlsCredentials.key,
        cert: tlsCredentials.certificate,
        ca: tlsCredentials.certificate,
        requestCert: true,
        rejectUnauthorized: true,
      },
      (_request, response) => {
        response.end("secure");
      },
    );
    httpsServer.listen(0, "127.0.0.1");
    await once(httpsServer, "listening");
    const httpsAddress = httpsServer.address();
    if (!httpsAddress || typeof httpsAddress === "string") {
      throw new Error("test HTTPS server did not expose a TCP address");
    }
    httpsBaseUrl = `https://127.0.0.1:${httpsAddress.port}`;
  });

  afterAll(async () => {
    const closed = Promise.all([
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
      new Promise<void>((resolve, reject) => {
        httpsServer.close((error) => (error ? reject(error) : resolve()));
      }),
    ]);
    server.closeAllConnections();
    httpsServer.closeAllConnections();
    await closed;
  });

  it("sends bounded requests and normalizes responses", async () => {
    const transport = createNodeHttpTransport({ userAgent: "nfse-js-test" });
    const result = await transport.request({
      operation: "custom",
      method: "POST",
      url: `${baseUrl}/echo`,
      headers: { "content-type": "text/plain" },
      body: Buffer.from("payload"),
      timeoutMs: 1_000,
    });

    expect(result.status).toBe(200);
    expect(result.headers["x-method"]).toBe("POST");
    expect(JSON.parse(Buffer.from(result.body).toString("utf8"))).toEqual({
      body: "payload",
      userAgent: "nfse-js-test",
    });
  });

  it("enforces timeout, abort, response-size, and URL constraints", async () => {
    const transport = createNodeHttpTransport({ maxResponseBytes: 20 });
    await expect(
      transport.request({
        operation: "custom",
        method: "GET",
        url: `${baseUrl}/slow`,
        headers: {},
        timeoutMs: 10,
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<SefinTransportError>>({ code: "timeout" }));
    await expect(
      transport.request({
        operation: "custom",
        method: "GET",
        url: `${baseUrl}/large`,
        headers: {},
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<SefinTransportError>>({ code: "response-too-large" }),
    );
    await expect(
      transport.request({
        operation: "custom",
        method: "GET",
        url: `${baseUrl}/chunked-large`,
        headers: {},
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<SefinTransportError>>({ code: "response-too-large" }),
    );
    const controller = new AbortController();
    const pending = transport.request({
      operation: "custom",
      method: "GET",
      url: `${baseUrl}/slow`,
      headers: {},
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 5);
    await expect(pending).rejects.toEqual(
      expect.objectContaining<Partial<SefinTransportError>>({ code: "aborted" }),
    );
    controller.abort();
    await expect(
      transport.request({
        operation: "custom",
        method: "GET",
        url: `${baseUrl}/echo`,
        headers: {},
        signal: controller.signal,
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<SefinTransportError>>({ code: "aborted" }));
    await expect(
      transport.request({
        operation: "custom",
        method: "GET",
        url: "ftp://example.test/file",
        headers: {},
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<SefinTransportError>>({ code: "invalid-config" }),
    );
    expect(() => createNodeHttpTransport({ maxResponseBytes: 0 })).toThrowError(
      expect.objectContaining<Partial<SefinTransportError>>({ code: "invalid-config" }),
    );
  });

  it("supports explicit mutual TLS credentials independently from XML signing", async () => {
    const transport = createNodeHttpTransport({
      tls: {
        ca: [tlsCredentials.certificate],
        cert: tlsCredentials.certificate,
        key: tlsCredentials.key,
        rejectUnauthorized: true,
        servername: "localhost",
      },
    });
    const result = await transport.request({
      operation: "custom",
      method: "GET",
      url: httpsBaseUrl,
      headers: {},
      timeoutMs: 1_000,
    });

    expect(Buffer.from(result.body).toString("utf8")).toBe("secure");
  });
});

class QueueTransport implements SefinHttpTransport {
  readonly requests: SefinHttpRequest[] = [];

  constructor(private readonly queue: (SefinHttpResponse | Error)[]) {}

  async request(request: SefinHttpRequest): Promise<SefinHttpResponse> {
    this.requests.push(request);
    const next = this.queue.shift();
    if (!next) {
      throw new Error("test transport queue is empty");
    }
    if (next instanceof Error) {
      throw next;
    }
    return { ...next, url: request.url };
  }
}

function testClient(
  transport: SefinHttpTransport,
  options: Partial<Parameters<typeof createSefinClient>[0]> = {},
) {
  return createSefinClient({
    transport,
    endpoints: {
      sefin: SEFIN_BASE,
      adnContributor: ADN_BASE,
      municipalParameters: PARAMETERS_BASE,
    },
    ...options,
  });
}

function response(
  status: number,
  body: string,
  contentType?: string,
  headers: Readonly<Record<string, string>> = {},
): SefinHttpResponse {
  return {
    status,
    headers: {
      ...(contentType ? { "content-type": contentType } : {}),
      ...headers,
    },
    body: Buffer.from(body),
    url: "http://placeholder.test",
  };
}

function createTlsCredentials(): { readonly key: string; readonly certificate: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date("2025-01-01T00:00:00Z");
  certificate.validity.notAfter = new Date("2030-01-01T00:00:00Z");
  const attributes = [{ name: "commonName", value: "localhost" }];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  certificate.setExtensions([
    { name: "basicConstraints", cA: true },
    {
      name: "keyUsage",
      digitalSignature: true,
      keyCertSign: true,
    },
    {
      name: "extKeyUsage",
      serverAuth: true,
      clientAuth: true,
    },
    {
      name: "subjectAltName",
      altNames: [
        { type: 2, value: "localhost" },
        { type: 7, ip: "127.0.0.1" },
      ],
    },
  ]);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  return {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    certificate: forge.pki.certificateToPem(certificate),
  };
}
