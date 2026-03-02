import {
  Account,
  AleoNetworkClient,
} from "@provablehq/sdk";
import type { FacilitatorAleoSigner } from "../signer.js";
import {
  ALEO_API_URLS,
  ALEO_MAINNET,
  DEFAULT_CONFIRMATION_TIMEOUT_MS,
  DEFAULT_CONFIRMATION_POLL_INTERVAL_MS,
} from "../constants.js";

export interface FacilitatorAleoSignerOptions {
  /** Custom API URLs keyed by CAIP-2 network ID */
  apiUrls?: Record<string, string>;
  /** Default confirmation timeout in ms (default: 120000) */
  confirmationTimeoutMs?: number;
  /** Default confirmation poll interval in ms (default: 2000) */
  confirmationPollIntervalMs?: number;
}

/**
 * Create a FacilitatorAleoSigner from a private key string.
 *
 * This factory wraps the @provablehq/sdk AleoNetworkClient for
 * broadcasting transactions and polling for confirmation.
 *
 * @param privateKey - Aleo private key string (e.g. "APrivateKey1...")
 * @param options - Optional configuration
 * @returns A FacilitatorAleoSigner implementation
 */
export function toFacilitatorAleoSigner(
  privateKey: string,
  options: FacilitatorAleoSignerOptions = {},
): FacilitatorAleoSigner {
  const account = new Account({ privateKey });
  const address = account.address().toString();

  const apiUrls = { ...ALEO_API_URLS, ...options.apiUrls };
  const confirmationTimeoutMs =
    options.confirmationTimeoutMs ?? DEFAULT_CONFIRMATION_TIMEOUT_MS;
  const confirmationPollIntervalMs =
    options.confirmationPollIntervalMs ?? DEFAULT_CONFIRMATION_POLL_INTERVAL_MS;

  function getNetworkClient(network: string): AleoNetworkClient {
    const url = apiUrls[network];
    if (!url) {
      throw new Error(`No API URL configured for network: ${network}`);
    }
    const client = new AleoNetworkClient(url);
    client.setAccount(account);
    return client;
  }

  return {
    address,

    async transactionExists(
      txId: string,
      network: string,
    ): Promise<boolean> {
      try {
        const client = getNetworkClient(network);
        await client.getTransaction(txId);
        return true;
      } catch {
        // Transaction not found — this is the expected case
        return false;
      }
    },

    async broadcastTransaction(
      transaction: string,
      network: string,
    ): Promise<string> {
      const client = getNetworkClient(network);
      return client.submitTransaction(transaction);
    },

    async waitForConfirmation(
      txId: string,
      network: string,
      timeoutMs?: number,
    ): Promise<void> {
      const client = getNetworkClient(network);
      const timeout = timeoutMs ?? confirmationTimeoutMs;

      await client.waitForTransactionConfirmation(
        txId,
        confirmationPollIntervalMs,
        timeout,
      );
    },
  };
}
