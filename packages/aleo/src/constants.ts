import type { Network } from "@x402/core/types";

/** CAIP-2 network identifiers for Aleo */
export const ALEO_MAINNET: Network = "aleo:mainnet";
export const ALEO_TESTNET: Network = "aleo:testnet";

/** All supported Aleo networks */
export const NETWORKS = [ALEO_MAINNET, ALEO_TESTNET] as const;

/** CAIP namespace wildcard for the Aleo family */
export const ALEO_CAIP_FAMILY = "aleo:*";

/** USDCx compliant stablecoin program ID on mainnet */
export const USDCX_PROGRAM_ID_MAINNET = "usdcx_stablecoin.aleo";

/** USDCx compliant stablecoin program ID on testnet */
export const USDCX_PROGRAM_ID_TESTNET = "test_usdcx_stablecoin.aleo";

/** USDCx asset decimals (6 decimals, same as USDC) */
export const USDCX_DECIMALS = 6;

/** USDCx multiplier for converting from whole units to micro-units */
export const USDCX_MULTIPLIER = 10 ** USDCX_DECIMALS;

/** x402 wrapper program ID on testnet */
export const X402_PROGRAM_ID_TESTNET = "x402.aleo";

/** Map network to x402 wrapper program ID */
export const X402_PROGRAM_IDS: Record<string, string> = {
  [ALEO_TESTNET]: X402_PROGRAM_ID_TESTNET,
};

/**
 * The transfer function in the x402 wrapper program.
 * Takes recipient and amount as public inputs so the facilitator
 * can read them directly without decryption.
 */
export const USDCX_TRANSFER_FUNCTION = "usdcx_transfer_with_proof" as const;

/** Default API endpoints for Aleo networks */
export const ALEO_API_URLS: Record<string, string> = {
  [ALEO_MAINNET]: "https://api.provable.com/v2",
  [ALEO_TESTNET]: "https://api.provable.com/testnet/v2",
};

/** Map network to USDCx program ID */
export const USDCX_PROGRAM_IDS: Record<string, string> = {
  [ALEO_MAINNET]: USDCX_PROGRAM_ID_MAINNET,
  [ALEO_TESTNET]: USDCX_PROGRAM_ID_TESTNET,
};

/** The x402 scheme name — "exact" like EVM/Solana/Aptos */
export const SCHEME = "exact";

/** Default timeout for transaction confirmation polling (ms) */
export const DEFAULT_CONFIRMATION_TIMEOUT_MS = 120_000;

/** Default polling interval for transaction confirmation (ms) */
export const DEFAULT_CONFIRMATION_POLL_INTERVAL_MS = 2_000;

/** Default max timeout for payment requirements (seconds) */
export const DEFAULT_MAX_TIMEOUT_SECONDS = 300;
