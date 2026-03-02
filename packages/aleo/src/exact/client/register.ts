import type { Network } from "@x402/core/types";
import { x402Client } from "@x402/core/client";
import type { ClientAleoSigner } from "../../signer.js";
import { ALEO_CAIP_FAMILY, NETWORKS } from "../../constants.js";
import { ExactAleoScheme } from "./scheme.js";

export interface AleoClientConfig {
  /** The signer that builds transfer_private transactions */
  signer: ClientAleoSigner;
  /** Optional specific networks to register (defaults to wildcard aleo:*) */
  networks?: Network[];
}

/**
 * Register the Aleo "exact" scheme with an x402Client.
 *
 * @param client - The x402Client instance to register with
 * @param config - Configuration including the Aleo signer
 * @returns The client instance for chaining
 */
export function registerExactAleoScheme(
  client: x402Client,
  config: AleoClientConfig,
): x402Client {
  const scheme = new ExactAleoScheme(config.signer);

  if (config.networks && config.networks.length > 0) {
    config.networks.forEach((network) => {
      client.register(network, scheme);
    });
  } else {
    client.register(ALEO_CAIP_FAMILY as Network, scheme);
  }

  return client;
}
