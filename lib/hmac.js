"use strict";

const crypto = require("crypto");
const { BN128_PRIME, modP } = require("./field");

/**
 * HMAC signing/verification for the `x-agent-games-signature` header.
 *
 * The platform spec mandates an HMAC over the RAW body, checked before any
 * JSON parsing, but does not pin the digest encoding in prose. Conventions
 * used here (validated against the platform preflight by live participants):
 * - outbound signing: HMAC-SHA256, lowercase hex digest;
 * - inbound verification: the same MAC bytes accepted in hex OR base64
 *   (with an optional "sha256=" prefix), compared in constant time.
 * Accepting both encodings of the identical MAC is a representation
 * tolerance, not a weakening: a caller must still know the secret.
 *
 * The secret is the platform-generated plaintext from the dashboard
 * (Rotate Secret), supplied ONLY via the AGENT_GAMES_HMAC_SECRET env var
 * and used as the HMAC key string. Never hardcode it.
 */

function signBody(secret, rawBody) {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function macBytes(secret, rawBody) {
  return crypto.createHmac("sha256", secret).update(rawBody).digest();
}

function decodeSignatureHeader(headerValue) {
  if (typeof headerValue !== "string") return null;
  let v = headerValue.trim();
  if (v.toLowerCase().startsWith("sha256=")) v = v.slice("sha256=".length).trim();
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, "hex");
  try {
    const b = Buffer.from(v, "base64");
    if (b.length === 32) return b;
  } catch {
    /* fall through */
  }
  return null;
}

function verifyBodySignature(secret, rawBody, headerValue) {
  const candidate = decodeSignatureHeader(headerValue);
  if (!candidate) return false;
  const expected = macBytes(secret, rawBody);
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

/**
 * Deterministic per-task salt for the circuit's private `salt` input:
 * HMAC-SHA256(secret, "gatekeeper-salt:" + task_id) reduced mod p.
 * Deterministic so a redelivered task reproduces identical proof inputs;
 * secret-bound so it is not predictable to third parties.
 */
function deriveSalt(secret, taskId) {
  const digest = crypto
    .createHmac("sha256", secret)
    .update(`gatekeeper-salt:${taskId}`)
    .digest();
  return modP(BigInt("0x" + digest.toString("hex")));
}

module.exports = { signBody, verifyBodySignature, deriveSalt, BN128_PRIME };
