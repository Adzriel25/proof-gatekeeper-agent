"use strict";

const crypto = require("crypto");

/** BN128 (BN254) scalar field prime — the gatekeeper circuit's field. */
const BN128_PRIME =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function modP(n) {
  const r = n % BN128_PRIME;
  return r >= 0n ? r : r + BN128_PRIME;
}

/**
 * Parse a non-negative integer given as a number, a decimal string, or a
 * 0x-prefixed hex string. Returns a BigInt, or null when malformed.
 */
function parseUint(v) {
  if (typeof v === "number") {
    return Number.isSafeInteger(v) && v >= 0 ? BigInt(v) : null;
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^0x[0-9a-fA-F]+$/.test(s)) return BigInt(s);
  if (/^[0-9]+$/.test(s)) return BigInt(s);
  return null;
}

/**
 * Convert an envelope value to a BN128 field element (BigInt).
 * - bigint / number: used directly.
 * - 0x hex string or decimal string: parsed, then reduced mod p. A 32-byte
 *   hash does not fit the field; reduction preserves the equality checks
 *   the circuit performs.
 * - any other free-form string (e.g. a task_id like "gk_8d31_x"): hashed
 *   with SHA-256 into the field.
 */
function toFieldElement(v) {
  if (typeof v === "bigint") return modP(v);
  if (typeof v === "number") return modP(BigInt(v));
  const s = String(v ?? "").trim();
  if (/^0x[0-9a-fA-F]+$/.test(s)) return modP(BigInt(s));
  if (/^[0-9]+$/.test(s)) return modP(BigInt(s));
  const digest = crypto.createHash("sha256").update(s).digest();
  return modP(BigInt("0x" + digest.toString("hex")));
}

module.exports = { BN128_PRIME, modP, parseUint, toFieldElement };
