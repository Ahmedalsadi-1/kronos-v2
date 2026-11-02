import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import ts from "typescript";
const mock = `export class AxiosError extends Error { constructor(message,code,config,request,response){super(message);Object.assign(this,{code,config,request,response});} } export class CanceledError extends AxiosError {constructor(message,config){super(message,'ERR_CANCELED',config);}} const axios={defaults:{},getUri:config=>config.url}; export default axios;`;
const mockURL = "data:text/javascript," + encodeURIComponent(mock);
const original = fs.readFileSync(new URL("./native-axios.ts", import.meta.url), "utf8");
const source = ts
  .transpileModule(original, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
  .outputText.replace(/(['"])axios-native\1/g, JSON.stringify(mockURL));
const { default: axios } = await import("data:text/javascript," + encodeURIComponent(source));
const backendUrl = "http://127.0.0.1:5678";
const response = { status: 200, statusText: "OK", data: { data: { id: "flow" } } };
test("preserves the original API envelope and byte view upload boundaries", async () => {
  let request;
  globalThis.window = {
    __KRONTERM_WORKFLOW_HOST__: {
      backendUrl,
      request: async (value) => {
        request = value;
        return response;
      },
    },
  };
  const bytes = new Uint8Array([1, 42, 43, 9]);
  const result = await axios.defaults.adapter({
    url: "/rest/binary-data",
    method: "post",
    data: bytes.subarray(1, 3),
    headers: { "Content-Type": "application/octet-stream" },
  });
  assert.deepEqual(request.body, [42, 43]);
  assert.equal(request.encoding, "bytes");
  assert.equal(request.contentType, "application/octet-stream");
  assert.deepEqual(result.data, { data: { id: "flow" } });
});
test("retains filename and MIME data for original credential uploads", async () => {
  let request;
  globalThis.window = {
    __KRONTERM_WORKFLOW_HOST__: {
      backendUrl,
      request: async (value) => {
        request = value;
        return response;
      },
    },
  };
  const form = new FormData();
  form.append("file", new Blob(["fixture"], { type: "text/plain" }), "fixture.txt");
  form.append("label", "Example");
  await axios.defaults.adapter({ url: "/rest/credentials", method: "post", data: form, headers: {} });
  assert.equal(request.body, undefined);
  assert.equal(request.form[0].filename, "fixture.txt");
  assert.equal(request.form[0].type, "text/plain");
  assert.equal(new TextDecoder().decode(new Uint8Array(request.form[0].value)), "fixture");
  assert.deepEqual(request.form[1], { name: "label", value: "Example" });
});
test("cancels the exact native request and reports Axios cancellation", async () => {
  const controller = new AbortController();
  let cancelId;
  let started;
  const ready = new Promise((resolve) => (started = resolve));
  globalThis.window = {
    __KRONTERM_WORKFLOW_HOST__: {
      backendUrl,
      request: (input) =>
        new Promise((_resolve, reject) => {
          started();
          controller.signal.addEventListener("abort", () => reject(new Error("native abort")), { once: true });
        }),
      cancelRequest: async (id) => {
        cancelId = id;
      },
    },
  };
  const pending = axios.defaults.adapter({ url: "/rest/workflows", headers: {}, signal: controller.signal });
  await ready;
  controller.abort();
  await assert.rejects(pending, (error) => error.code === "ERR_CANCELED");
  assert.match(cancelId, /^[0-9a-f-]{36}$/);
});
test("rejects an external API origin before it reaches the scoped native proxy", async () => {
  let calls = 0;
  globalThis.window = {
    __KRONTERM_WORKFLOW_HOST__: {
      backendUrl,
      request: async () => {
        calls++;
        return response;
      },
    },
  };
  await assert.rejects(
    axios.defaults.adapter({ url: "https://example.com/rest/workflows", headers: {} }),
    /outside the managed runtime/
  );
  assert.equal(calls, 0);
});
