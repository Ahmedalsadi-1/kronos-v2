const assert = require("node:assert/strict");
const { test } = require("node:test");
const { installManagedSession } = require("./managed-session.cjs");

const token = "a".repeat(64);
function fixture(existing = true) {
    let handler;
    const calls = [];
    const user = { id: "existing-owner", role: { slug: "global:owner" } };
    installManagedSession(
        {
            restEndpoint: "rest",
            app: {
                post: (route, fn) => {
                    assert.equal(route, "/rest/kronterm/session");
                    handler = fn;
                },
            },
        },
        {
            token,
            ownership: {
                hasInstanceOwner: async () => existing,
                getInstanceOwner: async () => user,
                setupOwner: async (input) => {
                    calls.push(input);
                    return user;
                },
            },
            auth: { issueCookie: (...args) => calls.push(args) },
        }
    );
    const request = async (headers = {}, remoteAddress = "127.0.0.1") => {
        const result = { code: 200, headers: {}, body: undefined };
        const res = {
            status: (code) => {
                result.code = code;
                return res;
            },
            json: (value) => {
                result.body = value;
            },
            setHeader: (name, value) => {
                result.headers[name] = value;
            },
        };
        await handler(
            {
                headers: { authorization: `Bearer ${token}`, "browser-id": "test-browser", ...headers },
                socket: { remoteAddress },
            },
            res
        );
        return result;
    };
    return { request, calls, user };
}

test("exchanges a private capability into an ordinary browser-bound session for the existing owner", async () => {
    const { request, calls, user } = fixture();
    const result = await request();
    assert.equal(result.code, 200);
    assert.deepEqual(result.body, { data: { connected: true } });
    assert.equal(result.headers["Cache-Control"], "no-store");
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1], user);
    assert.deepEqual(calls[0].slice(2), [false, "test-browser"]);
});

test("does not touch accounts or issue sessions for missing/wrong capabilities, websites or remote clients", async () => {
    const { request, calls } = fixture(false);
    for (const headers of [
        { authorization: "" },
        { authorization: `Bearer ${"b".repeat(64)}` },
        { origin: "http://evil.test" },
    ])
        assert.equal((await request(headers)).code, 401);
    assert.equal((await request({}, "192.168.1.2")).code, 401);
    assert.equal((await request({ "browser-id": undefined })).code, 400);
    assert.deepEqual(calls, []);
});

test("provisions a fresh local owner once for concurrent exchanges without persisting a Hermes password", async () => {
    const { request, calls } = fixture(false);
    await Promise.all([request(), request()]);
    assert.equal(calls.filter((value) => !Array.isArray(value)).length, 1);
    assert.match(calls[0].password, /^Aa1![a-f0-9]{64}$/);
    assert.equal(calls[0].email, "hermes@kronterm.invalid");
});

test("preserves MFA requirements of an existing local owner", async () => {
    const { request, calls, user } = fixture();
    user.mfaEnabled = true;
    assert.equal((await request()).code, 403);
    assert.deepEqual(calls, []);
});
