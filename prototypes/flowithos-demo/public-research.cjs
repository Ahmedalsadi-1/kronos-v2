const https = require("node:https");
const dns = require("node:dns").promises;
const { isIP } = require("node:net");
const ipaddr = require("ipaddr.js");
const { load } = require("cheerio");

function publicUrl(value) {
    try {
        const url = new URL(value);
        const host = url.hostname.replace(/\.$/, "");
        if (url.protocol !== "https:" || url.port || url.username || url.password || !host.includes(".") ||
            /(^|\.)(localhost|local|internal|test|invalid|onion)$/.test(host) || isIP(host) || host.startsWith("[")) return null;
        url.hash = "";
        return url;
    } catch {
        return null;
    }
}

async function pageRequest(url, signal) {
    const addresses = await dns.lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => ipaddr.process(address).range() !== "unicast")) throw new Error("Non-public address");
    const record = addresses.find(({ family }) => family === 4) ?? addresses[0];
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            signal, agent: false, headers: { Accept: "text/html, text/plain", "Accept-Encoding": "identity" },
            lookup: (_host, options, callback) => options.all ? callback(null, [record]) : callback(null, record.address, record.family),
        }, (response) => {
            const status = response.statusCode;
            if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
                response.destroy();
                resolve({ redirect: response.headers.location });
                return;
            }
            const type = response.headers["content-type"] ?? "";
            if (status < 200 || status >= 300 || !/^text\/(html|plain)\b/i.test(type)) {
                response.destroy();
                reject(new Error("Page unavailable"));
                return;
            }
            const chunks = [];
            let length = 0;
            response.on("data", (chunk) => {
                length += chunk.length;
                if (length > 1_500_000) response.destroy(new Error("Page exceeds size limit"));
                else chunks.push(chunk);
            });
            response.once("error", reject);
            response.once("end", () => resolve({ body: Buffer.concat(chunks).toString("utf8"), type }));
        });
        request.once("error", reject);
    });
}

async function readPublicPage(value) {
    let url = publicUrl(value);
    const signal = AbortSignal.timeout(9000);
    for (let redirect = 0; url && redirect < 4; redirect += 1) {
        try {
            const response = await pageRequest(url, signal);
            if (response.redirect) {
                url = publicUrl(new URL(response.redirect, url));
                continue;
            }
            let text = response.body;
            let title = url.hostname;
            if (/^text\/html\b/i.test(response.type)) {
                const $ = load(text);
                title = $("title").first().text().trim() || title;
                $("script,style,noscript,nav,footer,aside,template,[hidden]").remove();
                $("br").replaceWith(" ");
                $("h1,h2,h3,h4,p,li,pre,td,th").append(" ");
                const main = $("main,article,[role=main]").first();
                text = (main.length ? main : $("body")).text();
            }
            text = text.replace(/\s+/g, " ").trim().slice(0, 14_000);
            if (text.length < 160 || /^(just a moment|attention required|security check|verify you are human|access denied|robot check)/i.test(title) ||
                (text.length < 1200 && /verify (that )?you are human|checking your browser|enable javascript and cookies to continue/i.test(text))) return null;
            return { address: url.href, title: title.slice(0, 300), text };
        } catch {
            return null;
        }
    }
    return null;
}

module.exports = { publicUrl, readPublicPage };
