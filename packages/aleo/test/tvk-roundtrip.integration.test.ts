import { describe, it, expect } from "vitest";
import { Account } from "@provablehq/sdk";
import { toClientAleoSigner } from "../src/signers/clientSigner.js";
import {
  parseTransaction,
  getTransferTransition,
  decryptTransition,
  extractTransferInputs,
  getTransactionId,
} from "../src/utils.js";
import {
  ALEO_TESTNET,
  USDCX_PROGRAM_ID_TESTNET,
  TRANSFER_FUNCTION,
} from "../src/constants.js";

const PRIVATE_KEY = process.env.ALEO_PRIVATE_KEY;
const CREDENTIALS_RECORD = process.env.ALEO_CREDENTIALS_RECORD;
const TOKEN_RECORD = process.env.ALEO_TOKEN_RECORD;

const hasEnv = !!(PRIVATE_KEY && CREDENTIALS_RECORD && TOKEN_RECORD);

describe.skipIf(!hasEnv)("TVK round-trip integration", () => {
  it("should build tx, decrypt with TVK, and extract correct inputs", async () => {
    // Generate a fresh recipient so we never collide with real accounts
    const recipient = new Account();
    const recipientAddress = recipient.address().toString();
    const transferAmount = 1_000_000n;

    // Create a client signer with pre-existing records
    const signer = toClientAleoSigner(PRIVATE_KEY!, {
      network: ALEO_TESTNET,
      credentialsRecord: CREDENTIALS_RECORD!,
      tokenRecord: TOKEN_RECORD!,
    });

    // 1. Build a private transfer transaction (generates ZK proofs)
    const { transaction, transitionViewKey } =
      await signer.buildPrivateTransfer(
        recipientAddress,
        transferAmount,
        USDCX_PROGRAM_ID_TESTNET,
      );

    // 2. Parse the serialized transaction
    const tx = parseTransaction(transaction);

    // 3. Extract the transfer transition
    const transition = getTransferTransition(tx);

    // 4. Verify program and function
    expect(transition.programId()).toBe(USDCX_PROGRAM_ID_TESTNET);
    expect(transition.functionName()).toBe(TRANSFER_FUNCTION);

    // 5. Decrypt the transition using the TVK
    const decrypted = decryptTransition(transition, transitionViewKey);

    // 6. Extract and verify the transfer inputs
    const inputs = extractTransferInputs(decrypted);
    expect(inputs.recipient).toBe(recipientAddress);
    expect(inputs.amount).toBe(transferAmount);

    // 7. Verify the transaction ID format
    const txId = getTransactionId(transaction);
    expect(txId).toMatch(/^at1/);
  });
});
