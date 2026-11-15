"use strict";

const fs = require("fs");
const path = require("path");
const snarkjs = require("snarkjs");

const silentLogger = { log() {}, debug() {}, info() {}, warn() {}, error() {} };

/**
 * Resolve the circuits directory: CIRCUITS_DIR env first, then a list of
 * candidate locations (project root relative to cwd or to this file), so
 * the same code works locally, in the plain Node server, and inside a
 * Vercel function bundle (where vercel.json includes circuits/**).
 */
function resolveCircuitsDir(explicit) {
  const candidates = [];
  if (explicit) candidates.push(explicit);
  if (process.env.CIRCUITS_DIR) candidates.push(process.env.CIRCUITS_DIR);
  candidates.push(path.join(process.cwd(), "circuits"));
  candidates.push(path.join(__dirname, "..", "circuits"));
  candidates.push(path.join(__dirname, "..", "..", "circuits"));
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, "gatekeeper.wasm"))) return dir;
  }
  return candidates[0];
}

class Prover {
  constructor(circuitsDir) {
    this.dir = resolveCircuitsDir(circuitsDir);
    this.wasmPath = path.join(this.dir, "gatekeeper.wasm");
    this.zkeyPath = path.join(this.dir, "gatekeeper_final.zkey");
    this.vkPath = path.join(this.dir, "verification_key.json");
    this._vk = null;
  }

  verificationKey() {
    if (!this._vk) {
      this._vk = JSON.parse(fs.readFileSync(this.vkPath, "utf8"));
    }
    return this._vk;
  }

  /**
   * Generate a Groth16 proof for the given circuit inputs.
   * Throws when witness generation fails — which is exactly what happens
   * when the requested `decision` contradicts the circuit's own AND of the
   * five field checks (the circuit is the referee).
   */
  async prove(circuitInputs) {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      this.wasmPath,
      this.zkeyPath,
      silentLogger
    );
    return { proof, publicSignals };
  }

  /** Local verification against the VK extracted from the official zkey. */
  async verify(publicSignals, proof) {
    return snarkjs.groth16.verify(this.verificationKey(), publicSignals, proof, silentLogger);
  }
}

module.exports = { Prover, resolveCircuitsDir };
