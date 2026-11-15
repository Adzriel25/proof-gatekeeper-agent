"use strict";

/**
 * Vercel serverless entry for the Proof Gatekeeper agent.
 * Register the FULL path in the Agent Games dashboard:
 *   https://<your-project>.vercel.app/api/agent
 *
 * GET  -> health check ({ ok: true, protocolVersion: "v1" })
 * POST -> signed task pipeline (raw body preserved for HMAC verification)
 */

const { readConfig } = require("../lib/config");
const { AgentCore, SIGNATURE_HEADER } = require("../lib/core");

// One warm instance keeps one core (and its in-memory seen-set).
let core = null;
function getCore() {
  if (!core) core = new AgentCore(readConfig());
  return core;
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  const agent = getCore();

  if (req.method === "GET") {
    const out = agent.health();
    res.statusCode = out.status;
    res.setHeader("Content-Type", "application/json");
    res.end(out.body);
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }

  const rawBody = await readRawBody(req);
  const out = await agent.handlePost(rawBody, req.headers[SIGNATURE_HEADER]);
  res.statusCode = out.status;
  res.setHeader("Content-Type", "application/json");
  if (out.signature) res.setHeader(SIGNATURE_HEADER, out.signature);
  res.end(out.body);
};

module.exports.config = {
  api: { bodyParser: false },
};
