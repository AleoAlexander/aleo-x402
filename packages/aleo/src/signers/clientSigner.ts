import {
  Account,
  ProgramManager,
  AleoNetworkClient,
  AleoKeyProvider,
  NetworkRecordProvider,
} from "@provablehq/sdk";
import type { RecordPlaintext } from "@provablehq/sdk";
import type { ClientAleoSigner } from "../signer.js";
import {
  ALEO_API_URLS,
  ALEO_MAINNET,
  TRANSFER_FUNCTION,
  TRANSFER_FUNCTION_NO_CREDS,
  GET_CREDENTIALS_FUNCTION,
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
 * to build compliant stablecoin transfer_private_with_creds transactions
 * and generate TVKs.
 *
 * The signer manages the Credentials record lifecycle:
 * - If a credentialsRecord is provided in options, it uses that
 * - Otherwise, callers must supply credentials via the options or
 *   obtain them externally via the get_credentials program function
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
    ): Promise<{ transaction: string; transitionViewKey: string }> {
      const { programManager } = createProgramManager();

      // Determine which transfer function to use based on credentials availability
      const useCredentials = !!cachedCredentials;
      const functionName = useCredentials
        ? TRANSFER_FUNCTION
        : TRANSFER_FUNCTION_NO_CREDS;

      // Build the inputs array based on the function variant
      //
      // transfer_private_with_creds(recipient, amount, Token, Credentials):
      //   - recipient: address (private)
      //   - amount: u128 (private)
      //   - input_record: Token.record
      //   - credentials: Credentials.record
      //
      // transfer_private(recipient, amount, Token, [MerkleProof;2]):
      //   - recipient: address (private)
      //   - amount: u128 (private)
      //   - input_record: Token.record
      //   - sender_merkle_proofs: [MerkleProof;2] (private)
      //
      // Note: Record inputs (Token, Credentials) are resolved by the SDK's
      // record provider — they're passed as plaintext record strings.
      const inputs: string[] = [
        recipient,
        `${amount}u128`,
      ];

      // Add Token record if explicitly provided
      if (cachedTokenRecord) {
        inputs.push(cachedTokenRecord);
      }

      // Add Credentials record for transfer_private_with_creds
      if (useCredentials) {
        // If we didn't push a token record above, we need to let
        // the record provider find one — but the SDK expects inputs
        // in positional order, so we must have the Token record first.
        if (!cachedTokenRecord) {
          throw new Error(
            "Token record must be provided when using cached credentials. " +
            "Set the tokenRecord option or let the record provider handle both.",
          );
        }
        inputs.push(cachedCredentials!);
      }

      const tx = await programManager.buildExecutionTransaction({
        programName: asset,
        functionName,
        priorityFee,
        privateFee: false,
        inputs,
      });

      // Extract the transfer transition (first one) and derive TVK
      const transitions = tx.transitions();
      if (!transitions || transitions.length === 0) {
        throw new Error("Built transaction has no transitions");
      }

      const transferTransition = transitions[0];
      const tvk = account.generateTransitionViewKey(
        transferTransition.tpk().toString(),
      );

      // If using credentials, the returned Credentials record is in outputs.
      // For transfer_private_with_creds, outputs are:
      //   output[0] = Token (change, back to sender)
      //   output[1] = Token (to recipient)
      //   output[2] = ComplianceRecord (to investigator)
      //   output[3] = Credentials (returned, reusable)
      //
      // We need to decrypt output[3] to cache the new Credentials record
      // for the next transfer. The old one is consumed.
      if (useCredentials) {
        try {
          const outputs = transferTransition.ownedRecords(account.viewKey());
          // Find the Credentials record among our owned outputs
          for (const record of outputs) {
            const recordStr = record.toString();
            if (recordStr.includes("freeze_list_root")) {
              cachedCredentials = recordStr;
              break;
            }
          }
        } catch {
          // If we can't extract the new credentials, clear the cache.
          // Next transfer will fall back to transfer_private with Merkle proofs.
          cachedCredentials = undefined;
        }

        // Similarly, cache the change Token record for the next transfer
        try {
          const outputs = transferTransition.ownedRecords(account.viewKey());
          for (const record of outputs) {
            const recordStr = record.toString();
            if (recordStr.includes("amount") && !recordStr.includes("freeze_list_root")) {
              cachedTokenRecord = recordStr;
              break;
            }
          }
        } catch {
          cachedTokenRecord = undefined;
        }
      }

      return {
        transaction: tx.toString(),
        transitionViewKey: tvk.toString(),
      };
    },
  };
}
