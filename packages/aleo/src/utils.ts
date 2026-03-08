import { Transaction, Transition } from "@provablehq/sdk";
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
 * For x402 wrapper transactions, this is the usdcx_transfer_with_proof transition.
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
 * Extract the recipient address and transfer amount from a transition's
 * public inputs. The x402 wrapper program (usdcx_transfer_with_proof)
 * exposes recipient and amount as public inputs, so no decryption is needed.
 *
 * usdcx_transfer_with_proof(recipient, amount, Token, Credentials):
 *   input[0] = recipient address (public)
 *   input[1] = amount u128 (public)
 *   input[2] = Token record (private)
 *   input[3] = Credentials record (private)
 *
 * @throws Error if inputs cannot be extracted
 */
export function extractPublicInputs(transition: Transition): {
  recipient: string;
  amount: bigint;
} {
  const inputs = transition.inputs(true);
  if (!inputs || inputs.length < 2) {
    throw new Error(
      `Expected at least 2 inputs, got ${inputs?.length ?? 0}`,
    );
  }

  const recipientInput = inputs[0];
  const amountInput = inputs[1];

  // Validate that inputs are actually public (security: reject non-wrapper transactions)
  if (recipientInput && typeof recipientInput === "object" && "type" in recipientInput) {
    if ((recipientInput as { type: string }).type !== "public") {
      throw new Error("Expected recipient input to be public");
    }
  }
  if (amountInput && typeof amountInput === "object" && "type" in amountInput) {
    if ((amountInput as { type: string }).type !== "public") {
      throw new Error("Expected amount input to be public");
    }
  }

  const recipient = extractInputValue(recipientInput);
  const amountStr = extractInputValue(amountInput);

  // Amount is formatted as "NNNNu128" — strip the type suffix
  const amount = parseAleoInteger(amountStr);

  return { recipient, amount };
}

/**
 * Extract a value from a transition input object.
 * The input object format from WASM is: { type: "public", id: "...", value: "..." }
 */
function extractInputValue(input: unknown): string {
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
  const { transaction, payer } = payload;

  if (typeof transaction !== "string" || !transaction) {
    throw new Error("Missing or invalid 'transaction' in payload");
  }
  if (typeof payer !== "string" || !payer) {
    throw new Error("Missing or invalid 'payer' in payload");
  }

  return { transaction, payer };
}
