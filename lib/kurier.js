"use strict";

/**
 * Kurier (zkVerify) proof submission — mainnet, REST.
 *
 *   POST {KURIER_API_URL}/submit-proof/{KURIER_API_KEY}
 *     { proofType: "groth16", vkRegistered: true,
 *       proofOptions: { library: "snarkjs", curve: "bn128" },
 *       proofData: { proof, publicSignals, vk: <gatekeeper vk_hash> } }
 *     -> { jobId, optimisticVerify }
 *   GET  {KURIER_API_URL}/job-status/{KURIER_API_KEY}/{jobId}
 *     lifecycle: Queued -> Valid -> Submitted -> IncludedInBlock ->
 *                Finalized | Failed
 *
 * The on-chain txHash exists from the Submitted status onward, so polling
 * returns as soon as a txHash is known instead of blocking the task
 * response on finalization; the Kurier job keeps finalizing server-side.
 *
 * This module never throws: any failure returns null / a non-final outcome
 * and the caller still answers the task with the locally generated proof +
 * public_signals. Without a KURIER_API_KEY the submission is skipped
 * gracefully (the in-response proof is the primary evidence path).
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function submitProofAndPoll(cfg, proof, publicSignals, budgetMs) {
  if (!cfg.kurierApiKey) return null;

  const key = cfg.kurierApiKey;
  const deadline = Date.now() + Math.max(0, budgetMs);

  try {
    const submitRes = await fetch(`${cfg.kurierApiUrl}/submit-proof/${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proofType: "groth16",
        vkRegistered: true,
        proofOptions: { library: "snarkjs", curve: "bn128" },
        proofData: { proof, publicSignals, vk: cfg.gatekeeperVkHash },
      }),
    });
    if (!submitRes.ok) {
      console.error(`[kurier] submit-proof HTTP ${submitRes.status}`);
      return null;
    }
    const job = await submitRes.json();
    if (!job.jobId) {
      console.error("[kurier] submit-proof response missing jobId");
      return null;
    }
    console.log(`[kurier] job ${job.jobId} submitted (optimisticVerify=${job.optimisticVerify ?? "n/a"})`);

    let status = "Submitted";
    let lastTxHash;
    while (Date.now() < deadline) {
      await sleep(Math.min(cfg.kurierPollIntervalMs, Math.max(0, deadline - Date.now())));
      if (Date.now() >= deadline) break;
      const statusRes = await fetch(`${cfg.kurierApiUrl}/job-status/${key}/${job.jobId}`);
      if (!statusRes.ok) {
        console.error(`[kurier] job-status HTTP ${statusRes.status}`);
        continue;
      }
      const s = await statusRes.json();
      status = s.status ?? status;
      const txHash = s.txHash ?? (s.transactionInfo && s.transactionInfo.txHash);
      if (txHash) lastTxHash = txHash;
      if (status === "Failed") {
        return { jobId: job.jobId, status, txHash, finalized: false };
      }
      if (txHash) {
        return { jobId: job.jobId, status, txHash, finalized: status === "Finalized" };
      }
    }
    console.log(`[kurier] job ${job.jobId} produced no txHash within budget (last status=${status})`);
    return { jobId: job.jobId, status, txHash: lastTxHash, finalized: false };
  } catch (err) {
    console.error("[kurier] submission error:", err.message);
    return null;
  }
}

module.exports = { submitProofAndPoll };
