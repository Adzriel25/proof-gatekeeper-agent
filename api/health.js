"use strict";

/**
 * Dedicated health endpoint: GET https://<project>.vercel.app/api/health
 * (The registered agent URL /api/agent also answers GET with the same body.)
 */

const { PROTOCOL_VERSION } = require("../lib/core");

module.exports = function handler(req, res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true, protocolVersion: PROTOCOL_VERSION }));
};

module.exports.config = {
  api: { bodyParser: false },
};
