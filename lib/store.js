"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Seen-set (proof_tx reuse detection) + idempotent response cache.
 *
 * Backed by process memory plus a JSON file so state survives restarts on
 * a long-lived host. On Vercel the file lives in /tmp and can reset on a
 * cold start; warm instances retain it within a round. That is a known,
 * documented limitation of the serverless host — the in-memory set still
 * covers the lifetime of each warm instance.
 */
class SeenStore {
  constructor(filePath) {
    this.filePath =
      filePath ||
      process.env.SEEN_STORE_PATH ||
      (process.env.VERCEL ? "/tmp/agentgames-seen.json" : path.join(__dirname, "..", "data", "seen.json"));
    this.proofTxs = new Set();
    this.responses = new Map();
    this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const data = JSON.parse(raw);
      for (const tx of data.proofTxs || []) this.proofTxs.add(tx);
      for (const [k, v] of Object.entries(data.responses || {})) this.responses.set(k, v);
    } catch {
      /* fresh store */
    }
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(
        this.filePath,
        JSON.stringify({
          proofTxs: [...this.proofTxs],
          responses: Object.fromEntries(this.responses),
        })
      );
    } catch (err) {
      console.error("[store] persist failed:", err.message);
    }
  }

  static normalize(tx) {
    return String(tx ?? "").trim().toLowerCase();
  }

  hasProofTx(tx) {
    return this.proofTxs.has(SeenStore.normalize(tx));
  }

  recordProofTx(tx) {
    this.proofTxs.add(SeenStore.normalize(tx));
    this._save();
  }

  getResponse(taskId) {
    return this.responses.get(taskId);
  }

  recordResponse(taskId, body) {
    this.responses.set(taskId, body);
    this._save();
  }
}

module.exports = { SeenStore };
