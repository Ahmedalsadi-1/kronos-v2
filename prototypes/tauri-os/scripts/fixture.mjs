import http from "node:http";

export function startFixture(onProof, port = 14291) {
    const server = http.createServer(async (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        if (req.url === "/proof" && req.method === "POST") {
            let body = "";
            for await (const chunk of req) {
                body += chunk;
                if (body.length > 1000) {
                    res.writeHead(413);
                    res.end();
                    return;
                }
            }
            try {
                const proof = JSON.parse(body);
                if (proof.interaction !== true || typeof proof.desktopDenied !== "boolean")
                    throw new Error("Invalid proof");
                onProof(proof);
                res.end("ok");
            } catch {
                res.writeHead(400);
                res.end();
            }
            return;
        }
        res.setHeader("Content-Type", "text/html");
        res.end(`<!doctype html><html><head><title>KronTerm browser probe</title></head><body>
<h1>Browser compatibility probe</h1><p id="status">Waiting for agent action</p>
<button id="probe" onclick="runProbe()">Run interaction</button>
<script>
async function runProbe() {
    let desktopDenied = true;
    if (window.__TAURI_INTERNALS__?.invoke) {
        try {
            await window.__TAURI_INTERNALS__.invoke('browser', { id: 'probe', action: 'create', url: location.href });
            desktopDenied = false;
        } catch {}
    }
    document.getElementById('status').textContent = 'Agent interaction passed; desktop access ' + (desktopDenied ? 'denied' : 'UNEXPECTEDLY ALLOWED');
    await fetch('/proof', {method:'POST', body: JSON.stringify({interaction:true, desktopDenied})});
}
</script></body></html>`);
    });
    return new Promise((resolve, reject) => {
        server.on("error", reject);
        server.listen(port, "127.0.0.1", () => resolve(server));
    });
}
