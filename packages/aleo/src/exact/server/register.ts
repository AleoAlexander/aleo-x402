import type { Network } from "@x402/core/types";
import { x402ResourceServer } from "@x402/core/server";
import { ALEO_CAIP_FAMILY } from "../../constants.js";
import { ExactAleoScheme } from "./scheme.js";

export interface AleoResourceServerConfig {
  /** Optional specific networks to register (defaults to wildcard aleo:*) */
  networks?: Network[];
}

/**
 * Register the Aleo "exact" scheme with an x402ResourceServer.
 *
 * @param server - The x402ResourceServer instance to register with
 * @param config - Optional configuration
 * @returns The server instance for chaining
 */
export function registerExactAleoScheme(
  server: x402ResourceServer,
  config: AleoResourceServerConfig = {},
): x402ResourceServer {
  const scheme = new ExactAleoScheme();

  if (config.networks && config.networks.length > 0) {
    config.networks.forEach((network) => {
      server.register(network, scheme);
    });
  } else {
    server.register(ALEO_CAIP_FAMILY as Network, scheme);
  }

  return server;
}
