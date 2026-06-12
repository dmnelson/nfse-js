import { gzipSync } from "node:zlib";
import type { JsonValue } from "../parsing/types.js";
import type { SefinRequestPayload } from "./types.js";

export function xmlRequestPayload(xml: string): SefinRequestPayload {
  return { body: xml, contentType: "application/xml; charset=utf-8" };
}

export function jsonRequestPayload(value: JsonValue): SefinRequestPayload {
  return { body: JSON.stringify(value), contentType: "application/json; charset=utf-8" };
}

export function gzipBase64XmlJsonPayload(xml: string, propertyName: string): SefinRequestPayload {
  if (!propertyName) {
    throw new TypeError("propertyName must not be empty");
  }
  return jsonRequestPayload({
    [propertyName]: gzipSync(Buffer.from(xml, "utf8")).toString("base64"),
  });
}
