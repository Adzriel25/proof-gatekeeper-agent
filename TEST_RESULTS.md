# Test Results & Deploy Steps — Proof Gatekeeper Agent

Measured locally on 2026-11-15 (this VM, Node v24.22.1, snarkjs 0.7.6).
No deployment, registration, or signing was performed. All secrets in
tests are throwaway local values set via environment variables.

## Circuit artifacts (official, from agentgames.zkverify.io)

| File | Source | Size | SHA-256 |
| --- | --- | --- | --- |
| `circuits/gatekeeper.wasm` | `https://agentgames.zkverify.io/circuits/gatekeeper.wasm` | 1,755,820 B | `be00aefe3c8ba910951a242f50e55937bf82a0375ad4b69c2ef10629ab92764f` |
| `circuits/gatekeeper_final.zkey` | `https://agentgames.zkverify.io/circuits/gatekeeper_final.zkey` | 309,750 B | `adfe95a439a7063a82a4967ef026d2dd6857a4d02c63b3caf63dac02e01af80d` |
| `circuits/verification_key.json` | exported from the zkey (`snarkjs zkey export verificationkey`) | — | protocol groth16, curve bn128, **13 public signals** |

Registered vkHash (from `/api/circuit-info`, mainnet):
`0x6b79c6012a6d8651f3e13bc4d2a20370280ab49700c90c5316d4168bfbad77b0`

Public-signal order, confirmed empirically by matching a generated
proof's signals against the known inputs:
`[Poseidon(taskId, salt), registeredVkHash, proofVkHash, minimum,
publicBalance, expiryBlock, currentBlock, recipient, conditionRecipient,
amount, maxTransfer, decision, taskId]` — `decision` is signal #11,
`taskId` is #12.

## Unit + integration suite — `npm test` (test/run-tests.js)

**74 passed, 0 failed** (exit code 0).

- **HMAC gate:** tampered body → 401; wrong secret → 401; missing
  signature → 401.
- **Preflight:** signed `agent-games.preflight.v1` → 200
  `{ ok: true, protocolVersion: "v1" }` with a valid response signature.
- **Health:** 200 `{ ok: true, protocolVersion: "v1" }`.
- **Decision cases, each with a REAL Groth16 proof generated locally and
  verified with `snarkjs groth16 verify` against the extracted VK:**

  | Case | Decision | reason_code | Proof verifies | End-to-end |
  | --- | --- | --- | --- | --- |
  | Valid condition | APPROVE | VALID_CONDITION | yes | 1,146 ms (cold, incl. WASM load) |
  | VK substitution | REJECT | VK_SUBSTITUTION | yes | 389 ms |
  | Threshold mismatch (balance 999 < 1000) | REJECT | THRESHOLD_MISMATCH | yes | 468 ms |
  | Expired condition (current == expiry) | REJECT | EXPIRED_CONDITION | yes | 399 ms |
  | Recipient mismatch | REJECT | RECIPIENT_MISMATCH | yes | 391 ms |
  | Amount overflow (1001 > 1000) | REJECT | AMOUNT_OVERFLOW | yes | 352 ms |
  | Proof reused (same proof_tx, new task_id) | REJECT | PROOF_REUSED | n/a — no proof attached, as documented | — |

  Every response carried a valid `x-agent-games-signature`, exactly 13
  public signals, the correct `decision` signal (#11) and `taskId`
  signal (#12).
- **Idempotent redelivery:** re-sending the valid task returns a
  byte-identical response body (not misread as proof reuse).
- **Circuit referee (negative checks):** proving `decision=APPROVE` for a
  VK-substitution statement fails witness generation, and proving
  `decision=REJECT` for a valid statement fails too — the circuit
  enforces `decision == AND(five checks)`, and this agent's off-chain
  policy agrees with it on every tested case.
- **Boundaries:** balance == minimum → APPROVE; amount == max_transfer →
  APPROVE; current_block == expiry − 1 → APPROVE.
- **Standalone proof timing:** `groth16.fullProve` = **292 ms** for the
  valid case (hard platform deadline: 60,000 ms).

## HTTP smoke test — `npm run smoke` (test/smoke.js)

**10 passed, 0 failed.** Boots the real local server (same AgentCore as
the Vercel function) and drives it over HTTP: health GET, signed
preflight, signed valid task → APPROVE with locally verified proof
(round-trip **1,196 ms** cold), reused proof_tx → REJECT/PROOF_REUSED,
bad signature → 401.

## Vercel handler simulation

`api/agent.js` invoked directly with mock req/res: GET → 200 health
body; POST valid signed task → 200 APPROVE/VALID_CONDITION, valid
response signature header, 13 public signals, **1,496 ms** in a cold
process (includes WASM load).

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `AGENT_GAMES_HMAC_SECRET` | **yes** | Platform secret from dashboard → agent → **Rotate Secret** (plaintext shown once). The agent returns 500 on POSTs until this is set; GET health still answers. |
| `KURIER_API_KEY` | no | Mainnet Kurier key (register at Kurier / docs.zkverify.io). Without it, submission is skipped and responses carry proof + public_signals with `proof_tx` echoing the task's reference. |
| `KURIER_API_URL` | no | Default `https://api.kurier.xyz/api/v1` (mainnet). |
| `GATEKEEPER_VK_HASH` | no | Default = registered gatekeeper vkHash above. |
| `KURIER_POLL_BUDGET_MS` | no | Default 15000. Polling stops once an on-chain txHash exists; finalization continues server-side at Kurier. |
| `TASK_SOFT_DEADLINE_MS` | no | Default 50000 (platform hard deadline is 60 s). |
| `SEEN_STORE_PATH` | no | Seen-set file. Defaults to `/tmp/agentgames-seen.json` on Vercel, `data/seen.json` locally. |
| `CIRCUITS_DIR`, `PORT` | no | Artifact location override; local server port (default 8787). |

## Deploy steps (exact order — run once the user is logged in to Vercel
## and has completed the Agent Games account registration)

1. **Deploy the project** (this directory is the project root):
   ```bash
   cd ~/workspace/agentgames/agent
   npx vercel link          # choose/create the project on the user's account
   npx vercel deploy --prod # note the production URL, e.g. https://<project>.vercel.app
   ```
   `vercel.json` already sets `api/agent.js` to `maxDuration: 60` and
   bundles `circuits/**` via `includeFiles`. Sanity check after deploy:
   `curl https://<project>.vercel.app/api/agent` →
   `{"ok":true,"protocolVersion":"v1"}`.
2. **Register the endpoint** in the Agent Games dashboard with the FULL
   path: `https://<project>.vercel.app/api/agent`. The dashboard health
   check (GET) passes immediately.
3. **Get the HMAC secret:** dashboard → agent → **Rotate Secret** → copy
   the one-time plaintext.
4. **Set env vars** in Vercel (Project → Settings → Environment
   Variables, Production): `AGENT_GAMES_HMAC_SECRET` = the secret from
   step 3; optionally `KURIER_API_KEY` (after registering for a Kurier
   mainnet key). Then **redeploy** (`npx vercel deploy --prod`) so the
   function picks the values up.
5. **Preflight:** the platform's signed preflight
   (`agent-games.preflight.v1`) now verifies against the real secret and
   the dashboard marks the agent active.
6. **Practice:** run at least one practice task (required before scored
   rounds; practice allows up to 10 dispatches/hour). Confirm decisions
   + proofs show as verified on the dashboard.
7. **Compete:** Round 3 opens **today, 15 Nov 17:30 WIB** (rounds run
   17:30–03:30 WIB, 8 tasks/agent). Nothing else to start — the platform
   dispatches tasks to the registered endpoint.

### Known limitations / watch-outs

- **Seen-set durability on Vercel:** state lives in warm-instance memory
  + `/tmp`; a cold start can forget earlier `proof_tx` values. Within a
  round, platform traffic keeps instances warm. If PROOF_REUSED
  reliability across cold starts becomes a problem, move the same code
  to a single long-lived host via `npm start` (identical pipeline).
- **First cold call** ≈ 1.5 s (WASM load) — far inside the 60 s window.
- **Kurier is optional** for answering tasks: the signed response always
  carries the Groth16 proof + public signals; Kurier adds the on-chain
  tx reference when a key is configured. No VFY funds are needed for the
  Kurier REST path used here.
