// Types
export type { ExactAleoPayload } from "./types.js";
export { AleoErrorReason } from "./types.js";

// Signer interfaces
export type { ClientAleoSigner, FacilitatorAleoSigner } from "./signer.js";

// Signer factory functions
export { toClientAleoSigner } from "./signers/clientSigner.js";
export type { ClientAleoSignerOptions } from "./signers/clientSigner.js";
export { toFacilitatorAleoSigner } from "./signers/facilitatorSigner.js";
export type { FacilitatorAleoSignerOptions } from "./signers/facilitatorSigner.js";

// Constants
export {
  ALEO_MAINNET,
  ALEO_TESTNET,
  NETWORKS,
  ALEO_CAIP_FAMILY,
  USDCX_PROGRAM_IDS,
  USDCX_DECIMALS,
  USDCX_MULTIPLIER,
  ALEO_API_URLS,
  SCHEME,
  X402_PROGRAM_ID_TESTNET,
  X402_PROGRAM_IDS,
  USDCX_TRANSFER_FUNCTION,
} from "./constants.js";

// Client scheme
export { ExactAleoScheme as ExactAleoClientScheme } from "./exact/client/scheme.js";
export { registerExactAleoScheme as registerExactAleoClientScheme } from "./exact/client/register.js";
export type { AleoClientConfig } from "./exact/client/register.js";

// Facilitator scheme
export { ExactAleoScheme as ExactAleoFacilitatorScheme } from "./exact/facilitator/scheme.js";
export { registerExactAleoScheme as registerExactAleoFacilitatorScheme } from "./exact/facilitator/register.js";
export type { AleoFacilitatorConfig } from "./exact/facilitator/register.js";

// Server scheme
export { ExactAleoScheme as ExactAleoServerScheme } from "./exact/server/scheme.js";
export { registerExactAleoScheme as registerExactAleoServerScheme } from "./exact/server/register.js";
export type { AleoResourceServerConfig } from "./exact/server/register.js";

// Utilities
export {
  parseTransaction,
  getTransactionId,
  getTransferTransition,
  extractPublicInputs,
  parseAleoInteger,
  parseAleoU64,
  isValidAleoAddress,
  extractAleoPayload,
} from "./utils.js";
