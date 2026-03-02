/**
 * Aleo-specific payload carried inside PaymentPayload.payload.
 * Contains the fully-proved (but not yet broadcast) transaction,
 * a Transition View Key for selective disclosure, and the payer address.
 */
export type ExactAleoPayload = {
  /** Serialized Aleo Transaction (JSON string) — fully proved, not yet broadcast */
  transaction: string;
  /** Transition View Key — enables facilitator to decrypt transfer inputs */
  transitionViewKey: string;
  /** Payer's Aleo address */
  payer: string;
};

/**
 * Aleo-specific error reason codes used in VerifyResponse / SettleResponse.
 */
export const AleoErrorReason = {
  INVALID_TRANSACTION: "invalid_transaction",
  INVALID_TVK: "invalid_tvk",
  RECIPIENT_MISMATCH: "recipient_mismatch",
  INSUFFICIENT_AMOUNT: "insufficient_amount",
  REPLAY_DETECTED: "replay_detected",
  TRANSACTION_EXISTS: "transaction_exists",
  BROADCAST_FAILED: "broadcast_failed",
  CONFIRMATION_TIMEOUT: "confirmation_timeout",
  INVALID_SIGNATURE: "invalid_signature",
  INVALID_PAYER: "invalid_payer",
  UNSUPPORTED_NETWORK: "unsupported_network",
} as const;

export type AleoErrorReason =
  (typeof AleoErrorReason)[keyof typeof AleoErrorReason];
