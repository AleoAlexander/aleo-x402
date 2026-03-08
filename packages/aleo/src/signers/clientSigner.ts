import {
  Account,
  ProgramManager,
  AleoNetworkClient,
  AleoKeyProvider,
  NetworkRecordProvider,
} from "@provablehq/sdk";
import type { ClientAleoSigner } from "../signer.js";
import {
  ALEO_API_URLS,
  ALEO_MAINNET,
  USDCX_TRANSFER_FUNCTION,
} from "../constants.js";

export interface ClientAleoSignerOptions {
  /** CAIP-2 network identifier (default: "aleo:mainnet") */
  network?: string;
  /** Custom API URL (overrides default for the network) */
  apiUrl?: string;
  /**
   * Pre-existing Credentials record plaintext string.
   * If provided, skips the initial get_credentials step.
   * Obtain one via `usdcx_stablecoin.aleo/get_credentials`.
   */
  credentialsRecord?: string;
  /**
   * Pre-existing Token record plaintext string.
   * If provided, uses this specific record for the transfer.
   * Otherwise the record provider scans for a suitable record.
   */
  tokenRecord?: string;
}

/**
 * Create a ClientAleoSigner from a private key string.
 *
 * This factory wraps the @provablehq/sdk Account and ProgramManager
 * to build x402 wrapper program transactions via `usdcx_transfer_with_proof`.
 *
 * The signer manages the Credentials and Token record lifecycle:
 * - If a credentialsRecord is provided in options, it uses that
 * - If a tokenRecord is provided in options, it uses that
 *
 * @param privateKey - Aleo private key string (e.g. "APrivateKey1...")
 * @param options - Optional configuration
 * @returns A ClientAleoSigner implementation
 */
export function toClientAleoSigner(
  privateKey: string,
  options: ClientAleoSignerOptions = {},
): ClientAleoSigner {
  const network = options.network ?? ALEO_MAINNET;
  const apiUrl = options.apiUrl ?? ALEO_API_URLS[network];
  if (!apiUrl) {
    throw new Error(`No API URL configured for network: ${network}`);
  }

  const account = new Account({ privateKey });
  const address = account.address().toString();

  // Mutable state: cached credentials record (consumed and re-emitted each transfer)
  let cachedCredentials: string | undefined = options.credentialsRecord;
  let cachedTokenRecord: string | undefined = options.tokenRecord;

  function createProgramManager(): {
    programManager: ProgramManager;
    networkClient: AleoNetworkClient;
  } {
    const networkClient = new AleoNetworkClient(apiUrl);
    networkClient.setAccount(account);

    const keyProvider = new AleoKeyProvider();
    keyProvider.useCache(true);

    const recordProvider = new NetworkRecordProvider(account, networkClient);
    const programManager = new ProgramManager(
      apiUrl,
      keyProvider,
      recordProvider,
    );
    programManager.setAccount(account);

    return { programManager, networkClient };
  }

  return {
    address,

    async buildPrivateTransfer(
      recipient: string,
      amount: bigint,
      asset: string,
      priorityFee: number = 0,
    ): Promise<{ transaction: string }> {
      const { programManager } = createProgramManager();

      // Both Token and Credentials records are required for the x402 wrapper
      if (!cachedTokenRecord) {
        throw new Error(
          "Token record must be provided. Set the tokenRecord option.",
        );
      }
      if (!cachedCredentials) {
        throw new Error(
          "Credentials record must be provided. Set the credentialsRecord option.",
        );
      }

      // Build the inputs array for usdcx_transfer_with_proof:
      //   - recipient: address (public)
      //   - amount: u128 (public)
      //   - input_record: Token.record (private)
      //   - credentials: Credentials.record (private)
      const inputs: string[] = [
        recipient,
        `${amount}u128`,
        cachedTokenRecord,
        cachedCredentials,
      ];

      const tx = await programManager.buildExecutionTransaction({
        programName: asset,
        functionName: USDCX_TRANSFER_FUNCTION,
        priorityFee,
        privateFee: false,
        inputs,
      });

      // Cache returned records for subsequent transfers
      const transitions = tx.transitions();
      if (transitions && transitions.length > 0) {
        const transferTransition = transitions[0];
        try {
          const outputs = transferTransition.ownedRecords(account.viewKey());
          for (const record of outputs) {
            const recordStr = record.toString();
            if (recordStr.includes("freeze_list_root")) {
              cachedCredentials = recordStr;
            } else if (recordStr.includes("amount")) {
              cachedTokenRecord = recordStr;
            }
          }
        } catch {
          cachedCredentials = undefined;
          cachedTokenRecord = undefined;
        }
      }

      return { transaction: tx.toString() };
    },
  };
}
