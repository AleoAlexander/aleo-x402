/**
 * Client-side signer interface for building Aleo compliant stablecoin
 * private transfer transactions.
 *
 * Implementations wrap the @provablehq/sdk Account + ProgramManager to build
 * a `transfer_private_with_creds` or `transfer_private` transaction and
 * generate a Transition View Key (TVK) for selective disclosure.
 *
 * The compliant stablecoin (usdcx_stablecoin.aleo) requires freeze-list
 * compliance. The recommended flow is:
 *
 * 1. Obtain a Credentials record via `get_credentials` (proves non-inclusion
 *    in the freeze list using a Merkle proof). This only needs to happen once
 *    and is reusable until the freeze list root rotates.
 *
 * 2. Call `transfer_private_with_creds` with the Credentials record.
 *    This is faster than `transfer_private` because no Merkle proof
 *    computation is needed at transfer time.
 *
 * The signer implementation manages credentials lifecycle internally.
 */
export interface ClientAleoSigner {
  /** The payer's Aleo address (bech32 string) */
  readonly address: string;

  /**
   * Build a compliant stablecoin private transfer transaction and return
   * it with the TVK. The transaction is fully proved but NOT broadcast.
   *
   * Implementations should use `transfer_private_with_creds` when a valid
   * Credentials record is available, falling back to `transfer_private`
   * with Merkle proofs otherwise.
   *
   * @param recipient - Recipient's Aleo address
   * @param amount - Amount in micro-units (u128, e.g. 1_000_000 = 1.00 USDCx)
   * @param asset - The stablecoin program ID (e.g. "usdcx_stablecoin.aleo")
   * @param priorityFee - Optional priority fee in microcredits (default: 0)
   * @returns Serialized transaction string and the transition view key
   */
  buildPrivateTransfer(
    recipient: string,
    amount: bigint,
    asset: string,
    priorityFee?: number,
  ): Promise<{ transaction: string; transitionViewKey: string }>;
}

/**
 * Facilitator-side signer interface for broadcasting and monitoring
 * Aleo transactions.
 */
export interface FacilitatorAleoSigner {
  /** The facilitator's Aleo address (used in /supported response) */
  readonly address: string;

  /**
   * Check if a transaction ID already exists on the network.
   * Used for replay prevention — if the tx already exists on-chain,
   * someone may have broadcast it directly (bypassing the facilitator).
   *
   * @param txId - Transaction ID to check
   * @param network - CAIP-2 network identifier
   * @returns true if the transaction exists on-chain
   */
  transactionExists(txId: string, network: string): Promise<boolean>;

  /**
   * Broadcast a pre-built, fully-proved transaction to the Aleo network.
   *
   * @param transaction - Serialized transaction string
   * @param network - CAIP-2 network identifier
   * @returns The transaction ID returned by the network
   */
  broadcastTransaction(
    transaction: string,
    network: string,
  ): Promise<string>;

  /**
   * Poll for transaction confirmation on-chain.
   *
   * @param txId - Transaction ID to watch
   * @param network - CAIP-2 network identifier
   * @param timeoutMs - Maximum time to wait (default: 120000)
   */
  waitForConfirmation(
    txId: string,
    network: string,
    timeoutMs?: number,
  ): Promise<void>;
}
