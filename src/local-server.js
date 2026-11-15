"use strict";

/**
 * Plain Node HTTP server around the same AgentCore used by the Vercel
 * function — for local smoke tests and as a fallback host (`npm start`
 * on any Node >= 18 host). Every path routes to the agent pipeline;
 * GET is the health check, POST is the task endpoint.
 */

const http = require("http");
const { readConfig } = require("../lib/config");
const { AgentCore, SIGNATURE_HEADER } = require("../lib/core");

const cfg = readConfig();
const core = new AgentCore(cfg);

const server = http.createServer(async (req, res) => {
  if (req.method === "GET") {
    const out = core.health();
    res.writeHead(out.status, { "Content-Type": "application/json" });
    res.end(out.body);
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    try {
      const out = await core.handlePost(Buffer.concat(chunks), req.headers[SIGNATURE_HEADER]);
      const headers = { "Content-Type": "application/json" };
      if (out.signature) headers[SIGNATURE_HEADER] = out.signature;
      res.writeHead(out.status, headers);
      res.end(out.body);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "internal_error", detail: err.message }));
    }
  });
});

server.listen(cfg.port, () => {
  console.log(`[agent] listening on :${cfg.port} (secret ${cfg.hmacSecret ? "set" : "NOT SET"})`);
});
