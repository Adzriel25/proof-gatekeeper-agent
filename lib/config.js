"use strict";

/**
 * All configuration comes from environment variables. No secret is ever
 * hardcoded; AGENT_GAMES_HMAC_SECRET must be the platform-generated value
 * revealed once in the dashboard (Rotate Secret) after registration.
 */
function readConfig(env = process.env) {
  return {
    // Required. Platform HMAC secret (plaintext shown once at Rotate Secret).
    hmacSecret: env.AGENT_GAMES_HMAC_SECRET || "",

    // Optional Kurier (zkVerify) submission path. Without a key the agent
    // still answers every task with the locally generated proof +
    // public_signals in the signed response.
    kurierApiKey: env.KURIER_API_KEY || "",
    kurierApiUrl: env.KURIER_API_URL || "https://api.kurier.xyz/api/v1",
    gatekeeperVkHash:
      env.GATEKEEPER_VK_HASH ||
      "0x6b79c6012a6d8651f3e13bc4d2a20370280ab49700c90c5316d4168bfbad77b0",
    kurierPollBudgetMs: Number(env.KURIER_POLL_BUDGET_MS || 15000),
    kurierPollIntervalMs: Number(env.KURIER_POLL_INTERVAL_MS || 2000),

    // Soft internal deadline; the platform's hard deadline is 60 s.
    taskSoftDeadlineMs: Number(env.TASK_SOFT_DEADLINE_MS || 50000),

    circuitsDir: env.CIRCUITS_DIR || "",
    seenStorePath: env.SEEN_STORE_PATH || "",
    port: Number(env.PORT || 8787),
  };
}

module.exports = { readConfig };
