# Proof Gatekeeper Agent — zkVerify Agent Games (Season 01)

An HTTPS agent endpoint for the **Proof Gatekeeper** event. The platform
POSTs signed task envelopes; this agent verifies the HMAC, makes a
deterministic APPROVE/REJECT decision, generates a real Groth16 proof
locally with snarkjs against the official gatekeeper circuit, optionally
submits it to zkVerify via Kurier, and returns a signed response — well
inside the 60-second hard deadline (measured: ~0.3–1.5 s end-to-end).

## Layout

| Path | Purpose |
| --- | --- |
| `lib/core.js` | Transport-agnostic pipeline (HMAC → preflight → task → proof → signed response), fail-closed |
| `lib/decision.js` | Deterministic policy (7 documented outcomes) + envelope→circuit conversion |
| `lib/hmac.js` | HMAC-SHA256 sign/verify + per-task circuit salt derivation |
| `lib/field.js` | BN128 field helpers (parse / reduce / hash free-form ids) |
| `lib/prover.js` | snarkjs `groth16.fullProve` + local verify wrapper |
| `lib/kurier.js` | Kurier submit-proof + job-status polling (never throws) |
| `lib/store.js` | proof_tx seen-set + response cache (memory + JSON file) |
| `lib/config.js` | All configuration from environment variables |
| `api/agent.js` | Vercel serverless entry (`bodyParser: false` → raw body for HMAC) |
| `api/health.js` | Vercel health entry |
| `src/local-server.js` | Plain Node HTTP server (`npm start`) — local tests / fallback host |
| `circuits/` | Official `gatekeeper.wasm` + `gatekeeper_final.zkey` + extracted `verification_key.json` |
| `test/` | `npm test` (decision + proof suite), `npm run smoke` (HTTP end-to-end) |

## Decision policy (mirrors the circuit exactly)

APPROVE only if **all** hold: `proof_vk == registered_vk`,
`proof_tx` unseen, `public_balance >= minimum`,
`current_block < expiry_block`, `recipient == condition_recipient`,
`amount <= max_transfer`. First failing check determines the
`reason_code` (`VK_SUBSTITUTION`, `PROOF_REUSED`, `THRESHOLD_MISMATCH`,
`EXPIRED_CONDITION`, `RECIPIENT_MISMATCH`, `AMOUNT_OVERFLOW`).
`PROOF_REUSED` carries no proof — documented as having none to submit.

The circuit asserts `decision == AND(five field checks)`; a wrong
decision is unprovable (verified in the test suite both directions).
Public signals (13): `[Poseidon(taskId, salt), registeredVkHash,
proofVkHash, minimum, publicBalance, expiryBlock, currentBlock,
recipient, conditionRecipient, amount, maxTransfer, decision, taskId]`.

## Environment variables

See `.env.example`. Required: `AGENT_GAMES_HMAC_SECRET` (platform
dashboard → agent → Rotate Secret; shown once; never hardcoded).
Optional: `KURIER_API_KEY`, `KURIER_API_URL`, `GATEKEEPER_VK_HASH`,
`KURIER_POLL_BUDGET_MS`, `TASK_SOFT_DEADLINE_MS`, `SEEN_STORE_PATH`,
`CIRCUITS_DIR`, `PORT`.

## Local run & test

```bash
npm install
npm run artifacts   # (re)download official circuit artifacts
npx snarkjs zkey export verificationkey circuits/gatekeeper_final.zkey circuits/verification_key.json
AGENT_GAMES_HMAC_SECRET=<any-throwaway> npm start   # http://localhost:8787
npm test            # 74 checks: decisions + real proofs, all verified locally
npm run smoke       # HTTP end-to-end against the local server
```

## Deploy

See `TEST_RESULTS.md` for the exact, ordered deploy + registration steps.
