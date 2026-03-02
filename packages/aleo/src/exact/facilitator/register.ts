import type { Network } from "@x402/core/types";
import { x402Facilitator } from "@x402/core/facilitator";
import type { FacilitatorAleoSigner } from "../../signer.js";
import { ExactAleoScheme } from "./scheme.js";

export interface AleoFacilitatorConfig {
  /** The signer for broadcasting and monitoring transactions */
  signer: FacilitatorAleoSigner;
  /** The networks this facilitator supports (e.g. ["aleo:mainnet"]) */
  networks: Network | Network[];
}

/**
 * Register the Aleo "exact" scheme with an x402Facilitator.
 *
 * @param facilitator - The x402Facilitator instance to register with
 * @param config - Configuration including the Aleo signer and networks
 * @returns The facilitator instance for chaining
 */
export function registerExactAleoScheme(
  facilitator: x402Facilitator,
  config: AleoFacilitatorConfig,
): x402Facilitator {
  const scheme = new ExactAleoScheme(config.signer);
  facilitator.register(config.networks, scheme);
  return facilitator;
}
