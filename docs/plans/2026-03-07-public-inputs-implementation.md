# Public Inputs Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace TVK-based selective disclosure with public input extraction from the `x402.aleo` wrapper program.

**Architecture:** The client signer executes `x402.aleo/usdcx_transfer_with_proof` (which takes `recipient` and `amount` as public inputs and internally calls `usdcx_stablecoin.aleo/transfer_private_with_creds`). The facilitator reads the public inputs directly from the transition — no TVK decryption needed.

**Tech Stack:** TypeScript, Vitest, @provablehq/sdk, @x402/core

---

### Task 1: Update Types — Remove TVK from Payload and Error Reasons

**Files:**
- Modify: `packages/aleo/src/types.ts`

**Step 1: Update ExactAleoPayload and AleoErrorReason**

```typescript
/**
 * Aleo-specific payload carried inside PaymentPayload.payload.
 * Contains the fully-proved (but not yet broadcast) transaction
 * and the payer address.
 */
export type ExactAleoPayload = {
  /** Serialized Aleo Transaction (JSON string) — fully proved, not yet broadcast */
  transaction: string;
  /** Payer's Aleo address */
  payer: string;
};

/**
 * Aleo-specific error reason codes used in VerifyResponse / SettleResponse.
 */
export const AleoErrorReason = {
  INVALID_TRANSACTION: "invalid_transaction",
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
```

**Step 2: Commit**

```bash
git add packages/aleo/src/types.ts
git commit -m "refactor: remove TVK from ExactAleoPayload and INVALID_TVK error reason"
```

---

### Task 2: Update Constants — Add x402 Wrapper Program, Remove Old Transfer Functions

**Files:**
- Modify: `packages/aleo/src/constants.ts`

**Step 1: Replace transfer function constants with x402 wrapper constants**

Remove these lines:
```typescript
export const TRANSFER_FUNCTION = "transfer_private_with_creds" as const;
export const TRANSFER_FUNCTION_NO_CREDS = "transfer_private" as const;
export const GET_CREDENTIALS_FUNCTION = "get_credentials" as const;
```

And their JSDoc comment block above them.

Add in their place:
```typescript
/** x402 wrapper program ID on testnet */
export const X402_PROGRAM_ID_TESTNET = "x402.aleo";

/** Map network to x402 wrapper program ID */
export const X402_PROGRAM_IDS: Record<string, string> = {
  [ALEO_TESTNET]: X402_PROGRAM_ID_TESTNET,
};

/**
 * Transfer function name in the x402 wrapper program.
 * Takes recipient and amount as public inputs, then calls
 * usdcx_stablecoin.aleo/transfer_private_with_creds internally.
 */
export const USDCX_TRANSFER_FUNCTION = "usdcx_transfer_with_proof" as const;
```

**Step 2: Commit**

```bash
git add packages/aleo/src/constants.ts
git commit -m "refactor: add x402 wrapper program constants, remove old transfer functions"
```

---

### Task 3: Update Signer Interface — Drop TVK from Return Type

**Files:**
- Modify: `packages/aleo/src/signer.ts`

**Step 1: Update ClientAleoSigner interface**

Replace the entire `ClientAleoSigner` interface with:

```typescript
/**
 * Client-side signer interface for building Aleo compliant stablecoin
 * private transfer transactions via the x402 wrapper program.
 *
 * Implementations wrap the @provablehq/sdk Account + ProgramManager to build
 * an `x402.aleo/usdcx_transfer_with_proof` transaction. The wrapper program takes
 * recipient and amount as public inputs, then calls
 * `usdcx_stablecoin.aleo/transfer_private_with_creds` internally.
 *
 * The compliant stablecoin requires freeze-list compliance. A Credentials
 * record (obtained via `get_credentials`) proves non-inclusion in the freeze
 * list. The signer manages this lifecycle internally.
 */
export interface ClientAleoSigner {
  /** The payer's Aleo address (bech32 string) */
  readonly address: string;

  /**
   * Build a compliant stablecoin private transfer transaction via the
   * x402 wrapper program. The transaction is fully proved but NOT broadcast.
   *
   * The wrapper program exposes recipient and amount as public inputs,
   * allowing the facilitator to verify the transfer without decryption.
   *
   * @param recipient - Recipient's Aleo address
   * @param amount - Amount in micro-units (u128, e.g. 1_000_000 = 1.00 USDCx)
   * @param asset - The x402 wrapper program ID (e.g. "x402.aleo")
   * @param priorityFee - Optional priority fee in microcredits (default: 0)
   * @returns Serialized transaction string
   */
  buildPrivateTransfer(
    recipient: string,
    amount: bigint,
    asset: string,
    priorityFee?: number,
  ): Promise<{ transaction: string }>;
}
```

Leave `FacilitatorAleoSigner` unchanged.

**Step 2: Commit**

```bash
git add packages/aleo/src/signer.ts
git commit -m "refactor: remove TVK from ClientAleoSigner return type"
```

---

### Task 4: Update Client Signer Factory — Execute Wrapper, Remove TVK Derivation

**Files:**
- Modify: `packages/aleo/src/signers/clientSigner.ts`

**Step 1: Rewrite the signer factory**

Replace the full file content with:

```typescript
import {
  Account,
  ProgramManager,
  AleoNetworkClient,
  AleoKeyProvider,
  NetworkRecordProvider,
} from "@provablehq/sdk";
import type { ClientAleoSigner } from "../signer.js";
import { ALEO_API_URLS, ALEO_MAINNET, USDCX_TRANSFER_FUNCTION } from "../constants.js";

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
 * to build x402 wrapper program transactions that expose recipient
 * and amount as public inputs while keeping all other data private.
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

      // Update cached records from transaction outputs.
      // For transfer_with_proof, outputs are:
      //   output[0] = ComplianceRecord (to investigator)
      //   output[1] = Token (change, back to sender)
      //   output[2] = Token (to recipient)
      //   output[3] = Credentials (returned, reusable)
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
          // If we can't extract new records, clear the cache.
          cachedCredentials = undefined;
          cachedTokenRecord = undefined;
        }
      }

      return {
        transaction: tx.toString(),
      };
    },
  };
}
```

**Step 2: Commit**

```bash
git add packages/aleo/src/signers/clientSigner.ts
git commit -m "refactor: client signer executes x402 wrapper, removes TVK derivation"
```

---

### Task 5: Update Utils — Remove TVK Functions, Add extractPublicInputs

**Files:**
- Modify: `packages/aleo/src/utils.ts`

**Step 1: Rewrite utils.ts**

Replace the full file content with:

```typescript
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
  return transitions[0];
}

/**
 * Extract recipient address and transfer amount from a transition's
 * public inputs. The x402 wrapper program exposes these as:
 *   input[0] = recipient address (public)
 *   input[1] = amount u128 (public)
 *
 * @throws Error if public inputs cannot be extracted
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

  const recipient = extractInputValue(inputs[0]);
  const amountStr = extractInputValue(inputs[1]);

  return { recipient, amount: parseAleoInteger(amountStr) };
}

/**
 * Extract a value from a transition input object.
 * The input object format from WASM is: { type: "private"|"public", id: "...", value: "..." }
 */
function extractInputValue(input: unknown): string {
  if (input && typeof input === "object" && "value" in input) {
    return String((input as { value: unknown }).value);
  }
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
```

**Step 2: Commit**

```bash
git add packages/aleo/src/utils.ts
git commit -m "refactor: replace TVK decryption with extractPublicInputs"
```

---

### Task 6: Update Exports

**Files:**
- Modify: `packages/aleo/src/index.ts`

**Step 1: Update index.ts**

Replace the full file content with:

```typescript
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
```

**Step 2: Commit**

```bash
git add packages/aleo/src/index.ts
git commit -m "refactor: update exports for public inputs redesign"
```

---

### Task 7: Update Client Scheme — Drop TVK from Payload

**Files:**
- Modify: `packages/aleo/src/exact/client/scheme.ts`

**Step 1: Update the client scheme**

Replace the full file content with:

```typescript
import type {
  SchemeNetworkClient,
  PaymentRequirements,
  PaymentPayloadResult,
  PaymentPayloadContext,
} from "@x402/core/types";
import type { ClientAleoSigner } from "../../signer.js";
import { SCHEME, X402_PROGRAM_IDS } from "../../constants.js";

/**
 * Aleo client scheme for the "exact" payment mechanism.
 *
 * Builds a fully-proved x402 wrapper transaction where recipient and
 * amount are public inputs, enabling facilitator verification without
 * any decryption.
 */
export class ExactAleoScheme implements SchemeNetworkClient {
  readonly scheme = SCHEME;

  constructor(private readonly signer: ClientAleoSigner) {}

  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
    _context?: PaymentPayloadContext,
  ): Promise<PaymentPayloadResult> {
    const { payTo, amount, network, asset } = paymentRequirements;

    // Resolve the x402 wrapper program ID for this network
    const programId = asset || X402_PROGRAM_IDS[network];
    if (!programId) {
      throw new Error(`No x402 program ID configured for network: ${network}`);
    }

    // Build the usdcx_transfer_with_proof transaction with ZK proofs
    const { transaction } = await this.signer.buildPrivateTransfer(
      payTo,
      BigInt(amount),
      programId,
    );

    return {
      x402Version,
      payload: {
        transaction,
        payer: this.signer.address,
      },
    };
  }
}
```

**Step 2: Commit**

```bash
git add packages/aleo/src/exact/client/scheme.ts
git commit -m "refactor: client scheme uses x402 wrapper, drops TVK from payload"
```

---

### Task 8: Update Facilitator Scheme — Read Public Inputs Instead of TVK

**Files:**
- Modify: `packages/aleo/src/exact/facilitator/scheme.ts`

**Step 1: Rewrite the facilitator scheme**

Replace the full file content with:

```typescript
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
import { SCHEME, ALEO_CAIP_FAMILY, USDCX_TRANSFER_FUNCTION } from "../../constants.js";
import { AleoErrorReason } from "../../types.js";
import {
  parseTransaction,
  getTransferTransition,
  extractPublicInputs,
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
 * 4. Reading recipient and amount from the transition's public inputs
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

      // 7a. Verify the transition calls the expected program
      const programId = transferTransition.programId();
      if (programId !== requirements.asset) {
        return {
          isValid: false,
          invalidReason: AleoErrorReason.INVALID_TRANSACTION,
          invalidMessage: `Transaction targets program ${programId}, expected ${requirements.asset}`,
        };
      }

      // 7b. Verify the function is usdcx_transfer_with_proof
      const fnName = transferTransition.functionName();
      if (fnName !== USDCX_TRANSFER_FUNCTION) {
        return {
          isValid: false,
          invalidReason: AleoErrorReason.INVALID_TRANSACTION,
          invalidMessage: `Transaction calls ${fnName}, expected ${USDCX_TRANSFER_FUNCTION}`,
        };
      }

      // 8. Extract recipient and amount from public inputs
      let recipient: string;
      let amount: bigint;
      try {
        const inputs = extractPublicInputs(transferTransition);
        recipient = inputs.recipient;
        amount = inputs.amount;
      } catch {
        return {
          isValid: false,
          invalidReason: AleoErrorReason.INVALID_TRANSACTION,
          invalidMessage: "Failed to extract public inputs from transition",
        };
      }

      // 9. Verify recipient matches payTo
      if (recipient !== requirements.payTo) {
        return {
          isValid: false,
          invalidReason: AleoErrorReason.RECIPIENT_MISMATCH,
          invalidMessage: `Recipient ${recipient} does not match required payTo ${requirements.payTo}`,
        };
      }

      // 10. Verify amount >= required
      const requiredAmount = BigInt(requirements.amount);
      if (amount < requiredAmount) {
        return {
          isValid: false,
          invalidReason: AleoErrorReason.INSUFFICIENT_AMOUNT,
          invalidMessage: `Amount ${amount} is less than required ${requiredAmount}`,
        };
      }

      // 11. Add to replay cache
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
```

**Step 2: Commit**

```bash
git add packages/aleo/src/exact/facilitator/scheme.ts
git commit -m "refactor: facilitator reads public inputs instead of TVK decryption"
```

---

### Task 9: Update Unit Tests — Utils

**Files:**
- Modify: `packages/aleo/test/utils.test.ts`

**Step 1: Rewrite utils tests**

Replace the full file content with:

```typescript
import { describe, it, expect } from "vitest";
import {
  parseAleoInteger,
  parseAleoU64,
  isValidAleoAddress,
  extractAleoPayload,
} from "../src/utils.js";

describe("utils", () => {
  describe("parseAleoInteger", () => {
    it("should parse u64 value", () => {
      expect(parseAleoInteger("1000000u64")).toBe(BigInt(1000000));
    });

    it("should parse u128 value", () => {
      expect(parseAleoInteger("999u128")).toBe(BigInt(999));
    });

    it("should parse i128 value", () => {
      expect(parseAleoInteger("12345i128")).toBe(BigInt(12345));
    });

    it("should parse plain number string", () => {
      expect(parseAleoInteger("42")).toBe(BigInt(42));
    });

    it("should parse zero", () => {
      expect(parseAleoInteger("0u128")).toBe(BigInt(0));
    });
  });

  describe("parseAleoU64 (deprecated alias)", () => {
    it("should still work as an alias for parseAleoInteger", () => {
      expect(parseAleoU64("1000000u64")).toBe(BigInt(1000000));
      expect(parseAleoU64).toBe(parseAleoInteger);
    });
  });

  describe("isValidAleoAddress", () => {
    it("should accept a valid address", () => {
      const valid =
        "aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px";
      expect(isValidAleoAddress(valid)).toBe(true);
    });

    it("should reject an invalid prefix", () => {
      expect(isValidAleoAddress("eth10000000000000000000000000000000000000000000000000000000000")).toBe(false);
    });

    it("should reject an empty string", () => {
      expect(isValidAleoAddress("")).toBe(false);
    });

    it("should reject uppercase characters", () => {
      expect(
        isValidAleoAddress(
          "aleo1RHGDU77HGYQD3XJJ8UCU3JJ9R2KRWZ6MNZYD80GNCR5FXCWLH5RSVZP9PX",
        ),
      ).toBe(false);
    });
  });

  describe("extractAleoPayload", () => {
    it("should extract valid payload", () => {
      const payload = {
        transaction: '{"type":"execute"}',
        payer: "aleo1abc",
      };
      const result = extractAleoPayload(payload);
      expect(result).toEqual(payload);
    });

    it("should throw for missing transaction", () => {
      expect(() =>
        extractAleoPayload({ payer: "p" }),
      ).toThrow("Missing or invalid 'transaction'");
    });

    it("should throw for missing payer", () => {
      expect(() =>
        extractAleoPayload({ transaction: "t" }),
      ).toThrow("Missing or invalid 'payer'");
    });
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `cd packages/aleo && pnpm test -- test/utils.test.ts`
Expected: All tests pass (12 tests — removed 2 TVK-related extractAleoPayload tests)

**Step 3: Commit**

```bash
git add packages/aleo/test/utils.test.ts
git commit -m "test: update utils tests for public inputs redesign"
```

---

### Task 10: Update Unit Tests — Client Scheme

**Files:**
- Modify: `packages/aleo/test/client-scheme.test.ts`

**Step 1: Rewrite client scheme tests**

Replace the full file content with:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExactAleoScheme } from "../src/exact/client/scheme.js";
import type { ClientAleoSigner } from "../src/signer.js";
import type { PaymentRequirements } from "@x402/core/types";
import { ALEO_TESTNET, X402_PROGRAM_IDS } from "../src/constants.js";

function createMockSigner(): ClientAleoSigner {
  return {
    address: "aleo1clientaddress0000000000000000000000000000000000000000000000",
    buildPrivateTransfer: vi.fn().mockResolvedValue({
      transaction: '{"type":"execute","id":"at1mock_tx_123"}',
    }),
  };
}

describe("ExactAleoScheme (client)", () => {
  let signer: ClientAleoSigner;
  let scheme: ExactAleoScheme;

  beforeEach(() => {
    vi.clearAllMocks();
    signer = createMockSigner();
    scheme = new ExactAleoScheme(signer);
  });

  it("should have scheme 'exact'", () => {
    expect(scheme.scheme).toBe("exact");
  });

  it("should create a payment payload", async () => {
    const requirements: PaymentRequirements = {
      scheme: "exact",
      network: ALEO_TESTNET,
      asset: X402_PROGRAM_IDS[ALEO_TESTNET],
      amount: "100000",
      payTo: "aleo1recipientaddress000000000000000000000000000000000000000000",
      maxTimeoutSeconds: 300,
      extra: {},
    };

    const result = await scheme.createPaymentPayload(2, requirements);

    expect(result.x402Version).toBe(2);
    expect(result.payload).toEqual({
      transaction: '{"type":"execute","id":"at1mock_tx_123"}',
      payer: signer.address,
    });

    expect(signer.buildPrivateTransfer).toHaveBeenCalledWith(
      requirements.payTo,
      BigInt("100000"),
      X402_PROGRAM_IDS[ALEO_TESTNET],
    );
  });

  it("should use the asset from requirements", async () => {
    const requirements: PaymentRequirements = {
      scheme: "exact",
      network: ALEO_TESTNET,
      asset: "custom_token.aleo",
      amount: "500000",
      payTo: "aleo1recipientaddress000000000000000000000000000000000000000000",
      maxTimeoutSeconds: 300,
      extra: {},
    };

    await scheme.createPaymentPayload(2, requirements);

    expect(signer.buildPrivateTransfer).toHaveBeenCalledWith(
      requirements.payTo,
      BigInt("500000"),
      "custom_token.aleo",
    );
  });
});
```

**Step 2: Run tests**

Run: `cd packages/aleo && pnpm test -- test/client-scheme.test.ts`
Expected: 3 tests pass

**Step 3: Commit**

```bash
git add packages/aleo/test/client-scheme.test.ts
git commit -m "test: update client scheme tests for public inputs redesign"
```

---

### Task 11: Update Unit Tests — Facilitator Scheme

**Files:**
- Modify: `packages/aleo/test/facilitator-scheme.test.ts`

**Step 1: Rewrite facilitator scheme tests**

Replace the full file content with:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExactAleoScheme } from "../src/exact/facilitator/scheme.js";
import type { FacilitatorAleoSigner } from "../src/signer.js";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { AleoErrorReason } from "../src/types.js";
import {
  ALEO_TESTNET,
  X402_PROGRAM_IDS,
  USDCX_TRANSFER_FUNCTION,
} from "../src/constants.js";

let txCounter = 0;

const TESTNET_ASSET = X402_PROGRAM_IDS[ALEO_TESTNET];

// Mock transition object with programId/functionName/inputs methods
function createMockTransition() {
  return {
    programId: vi.fn(() => TESTNET_ASSET),
    functionName: vi.fn(() => USDCX_TRANSFER_FUNCTION),
  };
}

// Mock the utils module — the WASM imports aren't available in unit tests
vi.mock("../src/utils.js", () => ({
  extractAleoPayload: vi.fn((payload: Record<string, unknown>) => ({
    transaction: payload.transaction as string,
    payer: payload.payer as string,
  })),
  getTransactionId: vi.fn(() => `at1mock_tx_id_${++txCounter}`),
  parseTransaction: vi.fn(() => ({
    id: () => `at1mock_tx_id_${txCounter}`,
    transitions: () => [createMockTransition()],
  })),
  getTransferTransition: vi.fn(() => createMockTransition()),
  extractPublicInputs: vi.fn(() => ({
    recipient: "aleo1recipient0addr00000000000000000000000000000000000000000000",
    amount: BigInt(100000),
  })),
  isValidAleoAddress: vi.fn((addr: string) => addr.startsWith("aleo1") && addr.length === 63),
}));

function createMockSigner(): FacilitatorAleoSigner {
  return {
    address: "aleo1facilitator00000000000000000000000000000000000000000000000",
    transactionExists: vi.fn().mockResolvedValue(false),
    broadcastTransaction: vi.fn().mockResolvedValue("at1mock_tx_id_123"),
    waitForConfirmation: vi.fn().mockResolvedValue(undefined),
  };
}

function createPayload(overrides: Partial<Record<string, unknown>> = {}): PaymentPayload {
  return {
    x402Version: 2,
    resource: { url: "https://example.com", description: "test", mimeType: "application/json" },
    accepted: {
      scheme: "exact",
      network: ALEO_TESTNET,
      asset: TESTNET_ASSET,
      amount: "100000",
      payTo: "aleo1recipient0addr00000000000000000000000000000000000000000000",
      maxTimeoutSeconds: 300,
      extra: {},
    },
    payload: {
      transaction: '{"type":"execute","id":"at1mock_tx_id_123"}',
      payer: "aleo1payer0address000000000000000000000000000000000000000000000",
      ...overrides,
    },
  };
}

function createRequirements(overrides: Partial<PaymentRequirements> = {}): PaymentRequirements {
  return {
    scheme: "exact",
    network: ALEO_TESTNET,
    asset: TESTNET_ASSET,
    amount: "100000",
    payTo: "aleo1recipient0addr00000000000000000000000000000000000000000000",
    maxTimeoutSeconds: 300,
    extra: {},
    ...overrides,
  };
}

describe("ExactAleoScheme (facilitator)", () => {
  let signer: FacilitatorAleoSigner;
  let scheme: ExactAleoScheme;

  beforeEach(() => {
    vi.clearAllMocks();
    signer = createMockSigner();
    scheme = new ExactAleoScheme(signer);
  });

  describe("verify", () => {
    it("should verify a valid payment", async () => {
      const result = await scheme.verify(createPayload(), createRequirements());

      expect(result.isValid).toBe(true);
      expect(result.payer).toBe(
        "aleo1payer0address000000000000000000000000000000000000000000000",
      );
    });

    it("should reject if transaction already exists on-chain", async () => {
      (signer.transactionExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await scheme.verify(createPayload(), createRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(AleoErrorReason.TRANSACTION_EXISTS);
    });

    it("should reject if recipient does not match payTo", async () => {
      const requirements = createRequirements({
        payTo: "aleo1different0addr00000000000000000000000000000000000000000000",
      });

      const result = await scheme.verify(createPayload(), requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(AleoErrorReason.RECIPIENT_MISMATCH);
    });

    it("should reject if amount is insufficient", async () => {
      const requirements = createRequirements({ amount: "999999" });

      const result = await scheme.verify(createPayload(), requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(AleoErrorReason.INSUFFICIENT_AMOUNT);
    });

    it("should reject invalid payer address", async () => {
      const payload = createPayload({ payer: "invalid_address" });

      const result = await scheme.verify(payload, createRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(AleoErrorReason.INVALID_PAYER);
    });

    it("should reject if program ID does not match asset", async () => {
      const requirements = createRequirements({
        asset: "wrong_program.aleo",
      });

      const result = await scheme.verify(createPayload(), requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(AleoErrorReason.INVALID_TRANSACTION);
      expect(result.invalidMessage).toContain("wrong_program.aleo");
    });

    it("should reject if function name is not usdcx_transfer_with_proof", async () => {
      const { getTransferTransition } = await import("../src/utils.js");
      (getTransferTransition as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        programId: () => TESTNET_ASSET,
        functionName: () => "mint_private",
      });

      const result = await scheme.verify(createPayload(), createRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(AleoErrorReason.INVALID_TRANSACTION);
      expect(result.invalidMessage).toContain("mint_private");
    });
  });

  describe("settle", () => {
    it("should broadcast and confirm transaction", async () => {
      const result = await scheme.settle(createPayload(), createRequirements());

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("at1mock_tx_id_123");
      expect(result.network).toBe(ALEO_TESTNET);
      expect(signer.broadcastTransaction).toHaveBeenCalledOnce();
      expect(signer.waitForConfirmation).toHaveBeenCalledOnce();
    });

    it("should handle broadcast failure", async () => {
      (signer.broadcastTransaction as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error"),
      );

      const result = await scheme.settle(createPayload(), createRequirements());

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(AleoErrorReason.BROADCAST_FAILED);
    });

    it("should handle confirmation timeout", async () => {
      (signer.waitForConfirmation as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Timeout"),
      );

      const result = await scheme.settle(createPayload(), createRequirements());

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(AleoErrorReason.CONFIRMATION_TIMEOUT);
      expect(result.transaction).toBe("at1mock_tx_id_123");
    });
  });

  describe("getExtra", () => {
    it("should return undefined (client pays fees)", () => {
      expect(scheme.getExtra(ALEO_TESTNET)).toBeUndefined();
    });
  });

  describe("getSigners", () => {
    it("should return the facilitator address", () => {
      expect(scheme.getSigners(ALEO_TESTNET)).toEqual([signer.address]);
    });
  });
});
```

**Step 2: Run tests**

Run: `cd packages/aleo && pnpm test -- test/facilitator-scheme.test.ts`
Expected: 11 tests pass (removed 1 TVK-specific test, updated function name test)

**Step 3: Commit**

```bash
git add packages/aleo/test/facilitator-scheme.test.ts
git commit -m "test: update facilitator scheme tests for public inputs redesign"
```

---

### Task 12: Update Integration Test

**Files:**
- Modify: `packages/aleo/test/tvk-roundtrip.integration.test.ts`

**Step 1: Rewrite as public-inputs round-trip test**

Replace the full file content with:

```typescript
import { describe, it, expect } from "vitest";
import { Account } from "@provablehq/sdk";
import { toClientAleoSigner } from "../src/signers/clientSigner.js";
import {
  parseTransaction,
  getTransferTransition,
  extractPublicInputs,
  getTransactionId,
} from "../src/utils.js";
import {
  ALEO_TESTNET,
  X402_PROGRAM_ID_TESTNET,
  USDCX_TRANSFER_FUNCTION,
} from "../src/constants.js";

const PRIVATE_KEY = process.env.ALEO_PRIVATE_KEY;
const CREDENTIALS_RECORD = process.env.ALEO_CREDENTIALS_RECORD;
const TOKEN_RECORD = process.env.ALEO_TOKEN_RECORD;

const hasEnv = !!(PRIVATE_KEY && CREDENTIALS_RECORD && TOKEN_RECORD);

describe.skipIf(!hasEnv)("Public inputs round-trip integration", () => {
  it("should build tx and extract correct public inputs", async () => {
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

    // 1. Build a usdcx_transfer_with_proof transaction (generates ZK proofs)
    const { transaction } = await signer.buildPrivateTransfer(
      recipientAddress,
      transferAmount,
      X402_PROGRAM_ID_TESTNET,
    );

    // 2. Parse the serialized transaction
    const tx = parseTransaction(transaction);

    // 3. Extract the transfer transition
    const transition = getTransferTransition(tx);

    // 4. Verify program and function
    expect(transition.programId()).toBe(X402_PROGRAM_ID_TESTNET);
    expect(transition.functionName()).toBe(USDCX_TRANSFER_FUNCTION);

    // 5. Extract and verify public inputs
    const inputs = extractPublicInputs(transition);
    expect(inputs.recipient).toBe(recipientAddress);
    expect(inputs.amount).toBe(transferAmount);

    // 6. Verify the transaction ID format
    const txId = getTransactionId(transaction);
    expect(txId).toMatch(/^at1/);
  });
});
```

**Step 2: Commit**

```bash
git add packages/aleo/test/tvk-roundtrip.integration.test.ts
git commit -m "test: rewrite integration test for public inputs round-trip"
```

---

### Task 13: Run All Unit Tests

**Step 1: Run the full test suite**

Run: `cd packages/aleo && pnpm test`
Expected: All tests pass (~35 tests across 4 files)

**Step 2: If any failures, fix and re-run before proceeding**

---

### Task 14: Update README

**Files:**
- Modify: `packages/aleo/README.md`

**Step 1:** Update the README to reflect the new architecture:
- Replace all TVK references with public inputs
- Update the "How TVK Verification Works" section to "How Verification Works"
- Update code examples (payload no longer includes `transitionViewKey`)
- Update constants table (remove old transfer functions, add x402 wrapper)
- Update utilities table (remove `decryptTransition`/`extractTransferInputs`, add `extractPublicInputs`)
- Update integration test description (no TVK step)

**Step 2: Commit**

```bash
git add packages/aleo/README.md
git commit -m "docs: update README for public inputs redesign"
```

---

### Task 15: Final Commit — Update Top-Level README and Design Doc

**Step 1:** Update `README.md` (root) to remove TVK references. Change the "Payment Flow" and "How It Differs" sections.

**Step 2:** Commit everything remaining.

```bash
git add README.md docs/
git commit -m "docs: update top-level README and add design doc for public inputs redesign"
```
