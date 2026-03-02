import { Transaction, Transition, Field } from "@provablehq/sdk";
import type { ExactAleoPayload } from "./types.js";

/**
 * Parse a serialized Aleo transaction string into a Transaction WASM object.
 */
export function parseTransaction(serialized: string): Transaction {
  return Transaction.fromString(serialized);
}

/**
 * Extract the transaction ID from a serialized transaction string.
 */
export function getTransactionId(serialized: string): string {
  const tx = parseTransaction(serialized);
  return tx.id();
}

/**
 * Extract the first execution transition from a transaction.
 * For transfer_private transactions, this is the transfer transition.
 *
 * @throws Error if the transaction has no transitions
 */
export function getTransferTransition(tx: Transaction): Transition {
  const transitions = tx.transitions();
  if (!transitions || transitions.length === 0) {
    throw new Error("Transaction has no transitions");
  }
  // The first transition is the execution transition (the transfer).
  // Fee transitions are separate and come after.
  return transitions[0];
}

/**
 * Decrypt a transition's private inputs using the provided TVK.
 * Returns the decrypted transition with plaintext inputs/outputs.
 */
export function decryptTransition(
  transition: Transition,
  tvk: string,
): Transition {
  const tvkField = Field.fromString(tvk);
  return transition.decryptTransition(tvkField);
}

/**
 * Extract the recipient address and transfer amount from a decrypted
 * compliant stablecoin transfer transition's inputs.
 *
 * The compliant stablecoin (usdcx_stablecoin.aleo) has two transfer variants:
 *
 * transfer_private_with_creds(recipient, amount, Token, Credentials):
 *   input[0] = recipient address (private)
 *   input[1] = amount u128 (private)
 *   input[2] = Token record (private)
 *   input[3] = Credentials record (private)
 *
 * transfer_private(recipient, amount, Token, [MerkleProof;2]):
 *   input[0] = recipient address (private)
 *   input[1] = amount u128 (private)
 *   input[2] = Token record (private)
 *   input[3] = [MerkleProof;2] (private)
 *
 * Both share the same layout for the first two inputs.
 *
 * @throws Error if inputs cannot be extracted
 */
export function extractTransferInputs(decryptedTransition: Transition): {
  recipient: string;
  amount: bigint;
} {
  const inputs = decryptedTransition.inputs(true);
  if (!inputs || inputs.length < 2) {
    throw new Error(
      `Expected at least 2 inputs, got ${inputs?.length ?? 0}`,
    );
  }

  // input[0] is the recipient address, input[1] is the amount
  const recipientInput = inputs[0];
  const amountInput = inputs[1];

  const recipient = extractPlaintextValue(recipientInput);
  const amountStr = extractPlaintextValue(amountInput);

  // Amount is formatted as "NNNNu128" — strip the type suffix
  const amount = parseAleoInteger(amountStr);

  return { recipient, amount };
}

/**
 * Extract a plaintext value from a transition input object.
 * The input object format from WASM is: { type: "private"|"public", id: "...", value: "..." }
 */
function extractPlaintextValue(input: unknown): string {
  if (input && typeof input === "object" && "value" in input) {
    return String((input as { value: unknown }).value);
  }
  // If it's already a string, return as-is
  if (typeof input === "string") {
    return input;
  }
  throw new Error(`Cannot extract value from input: ${JSON.stringify(input)}`);
}

/**
 * Parse an Aleo integer value string (e.g. "1000000u128") to a BigInt.
 * Handles u8, u16, u32, u64, u128, i8, i16, i32, i64, i128 suffixes.
 */
export function parseAleoInteger(value: string): bigint {
  // Strip type suffix like "u64", "u128", "i64", etc.
  const cleaned = value.replace(/[ui]\d+$/, "");
  return BigInt(cleaned);
}

/** @deprecated Use parseAleoInteger instead */
export const parseAleoU64 = parseAleoInteger;

/**
 * Validate that a string is a valid Aleo address (starts with "aleo1").
 */
export function isValidAleoAddress(address: string): boolean {
  return /^aleo1[a-z0-9]{58}$/.test(address);
}

/**
 * Extract and validate the ExactAleoPayload from a PaymentPayload.payload.
 */
export function extractAleoPayload(
  payload: Record<string, unknown>,
): ExactAleoPayload {
  const { transaction, transitionViewKey, payer } = payload;

  if (typeof transaction !== "string" || !transaction) {
    throw new Error("Missing or invalid 'transaction' in payload");
  }
  if (typeof transitionViewKey !== "string" || !transitionViewKey) {
    throw new Error("Missing or invalid 'transitionViewKey' in payload");
  }
  if (typeof payer !== "string" || !payer) {
    throw new Error("Missing or invalid 'payer' in payload");
  }

  return { transaction, transitionViewKey, payer };
}
