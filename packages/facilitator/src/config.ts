export interface FacilitatorConfig {
  /** Aleo private key for the facilitator account */
  aleoPrivateKey: string;
  /** API URL for the Aleo network (default: https://api.provable.com/v2) */
  aleoApiUrl?: string;
  /** Port to listen on (default: 8080) */
  port: number;
  /** Network to support (default: "aleo:mainnet") */
  network: string;
}

/**
 * Load facilitator configuration from environment variables.
 */
export function loadConfig(): FacilitatorConfig {
  const aleoPrivateKey = process.env.ALEO_PRIVATE_KEY;
  if (!aleoPrivateKey) {
    throw new Error("ALEO_PRIVATE_KEY environment variable is required");
  }

  return {
    aleoPrivateKey,
    aleoApiUrl: process.env.ALEO_API_URL,
    port: parseInt(process.env.PORT || "8080", 10),
    network: process.env.ALEO_NETWORK || "aleo:mainnet",
  };
}
