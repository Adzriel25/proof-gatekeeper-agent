"use strict";

const { parseUint, toFieldElement } = require("./field");

/**
 * Deterministic policy for Proof Gatekeeper. No model involvement; the
 * decision is a fixed checklist over the task fields, fail-closed.
 *
 * The gatekeeper circuit asserts `decision == AND(five field checks)` over
 * its public inputs, so this off-chain evaluation mirrors the circuit
 * exactly — including boundary semantics and field-element equality
 * (values are compared as BN128 field elements, the same equality the
 * circuit performs):
 *
 *   1. proof_vk != registered_vk            -> REJECT / VK_SUBSTITUTION
 *   2. proof_tx already in the seen-set     -> REJECT / PROOF_REUSED
 *      (documented special case: a reused-proof task has no proof to
 *      submit, so this evaluation is not provable)
 *   3. public_balance < minimum             -> REJECT / THRESHOLD_MISMATCH
 *   4. current_block >= expiry_block        -> REJECT / EXPIRED_CONDITION
 *   5. recipient != condition_recipient     -> REJECT / RECIPIENT_MISMATCH
 *   6. amount > max_transfer                -> REJECT / AMOUNT_OVERFLOW
 *   otherwise                               -> APPROVE / VALID_CONDITION
 *
 * Boundaries: balance >= minimum passes, amount <= max_transfer passes,
 * current_block < expiry_block passes.
 */

function parseInput(input) {
  if (!input || typeof input !== "object") return null;

  const minimum = parseUint(input.minimum);
  const publicBalance = parseUint(input.public_balance);
  const amount = parseUint(input.amount);
  const maxTransfer = parseUint(input.max_transfer);
  const expiryBlock = parseUint(input.expiry_block);
  const currentBlock = parseUint(input.current_block);

  if (
    minimum === null ||
    publicBalance === null ||
    amount === null ||
    maxTransfer === null ||
    expiryBlock === null ||
    currentBlock === null
  ) {
    return null;
  }

  if (
    typeof input.registered_vk !== "string" ||
    !input.registered_vk ||
    typeof input.proof_vk !== "string" ||
    !input.proof_vk ||
    typeof input.recipient !== "string" ||
    !input.recipient ||
    typeof input.condition_recipient !== "string" ||
    !input.condition_recipient ||
    typeof input.proof_tx !== "string" ||
    !input.proof_tx
  ) {
    return null;
  }

  return {
    registeredVk: input.registered_vk,
    proofVk: input.proof_vk,
    minimum,
    publicBalance,
    expiryBlock,
    currentBlock,
    recipient: input.recipient,
    conditionRecipient: input.condition_recipient,
    amount,
    maxTransfer,
    proofTx: input.proof_tx,
  };
}

/**
 * Evaluate a parsed input. `isProofTxSeen` consults the agent's seen-set.
 * Returns { decision, reason_code, provable }.
 */
function evaluate(parsed, isProofTxSeen) {
  if (toFieldElement(parsed.proofVk) !== toFieldElement(parsed.registeredVk)) {
    return { decision: "REJECT", reason_code: "VK_SUBSTITUTION", provable: true };
  }
  if (isProofTxSeen(parsed.proofTx)) {
    return { decision: "REJECT", reason_code: "PROOF_REUSED", provable: false };
  }
  if (parsed.publicBalance < parsed.minimum) {
    return { decision: "REJECT", reason_code: "THRESHOLD_MISMATCH", provable: true };
  }
  if (parsed.currentBlock >= parsed.expiryBlock) {
    return { decision: "REJECT", reason_code: "EXPIRED_CONDITION", provable: true };
  }
  if (toFieldElement(parsed.recipient) !== toFieldElement(parsed.conditionRecipient)) {
    return { decision: "REJECT", reason_code: "RECIPIENT_MISMATCH", provable: true };
  }
  if (parsed.amount > parsed.maxTransfer) {
    return { decision: "REJECT", reason_code: "AMOUNT_OVERFLOW", provable: true };
  }
  return { decision: "APPROVE", reason_code: "VALID_CONDITION", provable: true };
}

/**
 * Circuit inputs for gatekeeper.wasm (signal names recovered from the
 * official artifact itself and confirmed by proving):
 *   taskId, registeredVkHash, proofVkHash, minimum, publicBalance,
 *   expiryBlock, currentBlock, recipient, conditionRecipient, amount,
 *   maxTransfer, decision, salt (private)
 * The circuit emits 13 public signals, in this exact order (confirmed
 * empirically against the artifact — see test/run-tests.js):
 *   [Poseidon(taskId, salt), registeredVkHash, proofVkHash, minimum,
 *    publicBalance, expiryBlock, currentBlock, recipient,
 *    conditionRecipient, amount, maxTransfer, decision, taskId]
 * so `decision` is public signal #11 and `taskId` is #12.
 */
function buildCircuitInputs(envelope, parsed, decision, salt) {
  return {
    taskId: toFieldElement(envelope.task_id).toString(10),
    registeredVkHash: toFieldElement(parsed.registeredVk).toString(10),
    proofVkHash: toFieldElement(parsed.proofVk).toString(10),
    minimum: parsed.minimum.toString(10),
    publicBalance: parsed.publicBalance.toString(10),
    expiryBlock: parsed.expiryBlock.toString(10),
    currentBlock: parsed.currentBlock.toString(10),
    recipient: toFieldElement(parsed.recipient).toString(10),
    conditionRecipient: toFieldElement(parsed.conditionRecipient).toString(10),
    amount: parsed.amount.toString(10),
    maxTransfer: parsed.maxTransfer.toString(10),
    decision: decision === "APPROVE" ? "1" : "0",
    salt: salt.toString(10),
  };
}

module.exports = { parseInput, evaluate, buildCircuitInputs };
