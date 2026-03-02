import type {
  SchemeNetworkFacilitator,
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
  FacilitatorContext,
  Network,
} from "@x402/core/types";
import type { FacilitatorAleoSigner } from "../../signer.js";
import {
  SCHEME,
  ALEO_CAIP_FAMILY,
  TRANSFER_FUNCTION,
  TRANSFER_FUNCTION_NO_CREDS,
} from "../../constants.js";
import { AleoErrorReason } from "../../types.js";
import {
  parseTransaction,
  getTransferTransition,
  decryptTransition,
  extractTransferInputs,
  extractAleoPayload,
  getTransactionId,
  isValidAleoAddress,
} from "../../utils.js";

/**
 * In-memory replay cache: maps transaction ID to timestamp.
 * Entries expire after maxTimeoutSeconds from the payment requirements.
 */
const replayCache = new Map<string, number>();

/** Clean expired entries from the replay cache */
function cleanReplayCache(maxAgeMs: number): void {
  const now = Date.now();
  for (const [txId, timestamp] of replayCache) {
    if (now - timestamp > maxAgeMs) {
      replayCache.delete(txId);
    }
  }
}

/**
 * Aleo facilitator scheme for the "exact" payment mechanism.
 *
 * Verifies payments by:
 * 1. Parsing the serialized transaction
 * 2. Checking replay cache (reject if tx ID already seen)
 * 3. Querying the network (reject if tx already exists on-chain)
 * 4. Using the provided TVK to decrypt the transfer transition's inputs
 * 5. Verifying recipient matches payTo and amount >= required
 *
 * Settles payments by:
 * 1. Broadcasting the pre-built transaction to the network
 * 2. Polling for confirmation
 */
export class ExactAleoScheme implements SchemeNetworkFacilitator {
  readonly scheme = SCHEME;
  readonly caipFamily = ALEO_CAIP_FAMILY;

  constructor(private readonly signer: FacilitatorAleoSigner) {}

  getExtra(_network: Network): Record<string, unknown> | undefined {
    // Aleo doesn't need a fee payer from the facilitator.
    // Client pays all network fees embedded in the transaction.
    return undefined;
  }

  getSigners(_network: string): string[] {
    return [this.signer.address];
  }

  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    _context?: FacilitatorContext,
  ): Promise<VerifyResponse> {
    try {
      // 1. Extract and validate the Aleo payload
      const aleoPayload = extractAleoPayload(payload.payload);

      // 2. Validate payer address
      if (!isValidAleoAddress(aleoPayload.payer)) {
        return {
          isValid: false,
          invalidReason: AleoErrorReason.INVALID_PAYER,
          invalidMessage: "Invalid payer address format",
        };
      }

      // 3. Parse the serialized transaction
      let txId: string;
      try {
        txId = getTransactionId(aleoPayload.transaction);
      } catch {
        return {
          isValid: false,
          invalidReason: AleoErrorReason.INVALID_TRANSACTION,
          invalidMessage: "Failed to parse transaction",
        };
      }

      // 4. Check replay cache
      const maxTimeoutMs = (requirements.maxTimeoutSeconds || 300) * 1000;
      cleanReplayCache(maxTimeoutMs);

      if (replayCache.has(txId)) {
        return {
          isValid: false,
          invalidReason: AleoErrorReason.REPLAY_DETECTED,
          invalidMessage: "Transaction already submitted to facilitator",
        };
      }

      // 5. Check if transaction already exists on-chain
      try {
        const exists = await this.signer.transactionExists(
          txId,
          requirements.network,
        );
        if (exists) {
          return {
            isValid: false,
            invalidReason: AleoErrorReason.TRANSACTION_EXISTS,
            invalidMessage:
              "Transaction already exists on-chain (may have been broadcast directly)",
          };
        }
      } catch {
        // Network query failed — proceed cautiously (optimistic)
      }

      // 6. Parse the transaction and locate the transfer transition
      const tx = parseTransaction(aleoPayload.transaction);
      const transferTransition = getTransferTransition(tx);

      // 6a. Verify the transition calls the expected stablecoin program
      const programId = transferTransition.programId();
      if (programId !== requirements.asset) {
        return {
          isValid: false,
          invalidReason: AleoErrorReason.INVALID_TRANSACTION,
          invalidMessage: `Transaction targets program ${programId}, expected ${requirements.asset}`,
        };
      }

      // 6b. Verify the function is a known private transfer variant
      const fnName = transferTransition.functionName();
      if (fnName !== TRANSFER_FUNCTION && fnName !== TRANSFER_FUNCTION_NO_CREDS) {
        return {
          isValid: false,
          invalidReason: AleoErrorReason.INVALID_TRANSACTION,
          invalidMessage: `Transaction calls ${fnName}, expected ${TRANSFER_FUNCTION} or ${TRANSFER_FUNCTION_NO_CREDS}`,
        };
      }

      // 7. Decrypt the transition using the provided TVK
      let recipient: string;
      let amount: bigint;
      try {
        const decrypted = decryptTransition(
          transferTransition,
          aleoPayload.transitionViewKey,
        );
        const inputs = extractTransferInputs(decrypted);
        recipient = inputs.recipient;
        amount = inputs.amount;
      } catch {
        return {
          isValid: false,
          invalidReason: AleoErrorReason.INVALID_TVK,
          invalidMessage: "Failed to decrypt transition with provided TVK",
        };
      }

      // 8. Verify recipient matches payTo
      if (recipient !== requirements.payTo) {
        return {
          isValid: false,
          invalidReason: AleoErrorReason.RECIPIENT_MISMATCH,
          invalidMessage: `Recipient ${recipient} does not match required payTo ${requirements.payTo}`,
        };
      }

      // 9. Verify amount >= required
      const requiredAmount = BigInt(requirements.amount);
      if (amount < requiredAmount) {
        return {
          isValid: false,
          invalidReason: AleoErrorReason.INSUFFICIENT_AMOUNT,
          invalidMessage: `Amount ${amount} is less than required ${requiredAmount}`,
        };
      }

      // 10. Add to replay cache
      replayCache.set(txId, Date.now());

      return {
        isValid: true,
        payer: aleoPayload.payer,
      };
    } catch (error) {
      return {
        isValid: false,
        invalidReason: AleoErrorReason.INVALID_TRANSACTION,
        invalidMessage:
          error instanceof Error ? error.message : "Unknown verification error",
      };
    }
  }

  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    _context?: FacilitatorContext,
  ): Promise<SettleResponse> {
    try {
      const aleoPayload = extractAleoPayload(payload.payload);

      // 1. Broadcast the pre-built transaction
      let txId: string;
      try {
        txId = await this.signer.broadcastTransaction(
          aleoPayload.transaction,
          requirements.network,
        );
      } catch (error) {
        return {
          success: false,
          errorReason: AleoErrorReason.BROADCAST_FAILED,
          errorMessage:
            error instanceof Error
              ? error.message
              : "Failed to broadcast transaction",
          transaction: "",
          network: requirements.network,
        };
      }

      // 2. Wait for confirmation
      try {
        await this.signer.waitForConfirmation(
          txId,
          requirements.network,
        );
      } catch (error) {
        // Transaction was broadcast but confirmation timed out.
        // It may still confirm later.
        return {
          success: false,
          errorReason: AleoErrorReason.CONFIRMATION_TIMEOUT,
          errorMessage:
            error instanceof Error
              ? error.message
              : "Transaction confirmation timed out",
          payer: aleoPayload.payer,
          transaction: txId,
          network: requirements.network,
        };
      }

      // 3. Clean up replay cache entry (tx is now confirmed on-chain)
      replayCache.delete(txId);

      return {
        success: true,
        payer: aleoPayload.payer,
        transaction: txId,
        network: requirements.network,
      };
    } catch (error) {
      return {
        success: false,
        errorReason: AleoErrorReason.BROADCAST_FAILED,
        errorMessage:
          error instanceof Error ? error.message : "Unknown settlement error",
        transaction: "",
        network: requirements.network,
      };
    }
  }
}
