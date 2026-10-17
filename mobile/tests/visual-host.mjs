import { createServer } from "node:http";

const Preview = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360"><rect width="600" height="360" fill="#f3f0fa"/><text x="36" y="80" font-family="sans-serif" font-size="18" fill="#635875">UI TEST FIXTURE</text><text x="36" y="155" font-family="sans-serif" font-size="34" fill="#17171b">Browser preview</text><text x="36" y="200" font-family="sans-serif" font-size="18" fill="#60616d">A synthetic frame for layout verification.</text></svg>'
).toString("base64");
const Session = { id: "visual-test-session", title: "UI test fixture", directory: "/fixture" };

createServer((request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname;
  let payload;
  if (path === "/health") payload = { ready: true, connected: true, engine: "UI test fixture" };
  if (path === "/api/session") payload = [Session];
  if (path === "/api/session/status") payload = { [Session.id]: { type: "idle" } };
  if (path === `/api/session/${Session.id}/message`)
    payload = [
      {
        info: { id: "fixture-message", role: "assistant" },
        parts: [{ type: "text", text: "This is a UI test fixture. Open the browser card to inspect its controls." }],
      },
    ];
  if (path === "/api/desktop-sandbox")
    payload = [{ id: "fixture-sandbox", status: "running", resolution: "UI test fixture" }];
  if (path === "/api/experimental/browser/state")
    payload = {
      enabled: true,
      sessionID: Session.id,
      activePageID: "fixture-page",
      capabilities: { tabs: true, history: true },
      pages: [
        {
          id: "fixture-page",
          index: 0,
          title: "UI test fixture",
          url: "https://example.test",
          active: true,
          createdAt: 1,
          canGoBack: true,
        },
      ],
    };
  if (path === "/api/experimental/browser/frame")
    payload = { mime: "image/svg+xml", base64: Preview, pageID: "fixture-page" };
  if (path === "/api/experimental/browser/action")
    payload = { items: [{ uid: "test-button", role: "button", name: "Fixture button" }] };
  response.writeHead(payload ? 200 : 404, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload ?? { error: "Not implemented by UI test fixture" }));
}).listen(4189, "127.0.0.1", () => console.log("UI test host on 127.0.0.1:4189 (synthetic data only)"));
