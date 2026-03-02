import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExactAleoScheme } from "../src/exact/facilitator/scheme.js";
import type { FacilitatorAleoSigner } from "../src/signer.js";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { AleoErrorReason } from "../src/types.js";
import {
  ALEO_TESTNET,
  USDCX_PROGRAM_IDS,
  TRANSFER_FUNCTION,
} from "../src/constants.js";

let txCounter = 0;

const TESTNET_ASSET = USDCX_PROGRAM_IDS[ALEO_TESTNET];

// Mock transition object with programId/functionName methods
function createMockTransition() {
  return {
    programId: vi.fn(() => TESTNET_ASSET),
    functionName: vi.fn(() => TRANSFER_FUNCTION),
  };
}

// Mock the utils module — the WASM imports aren't available in unit tests
vi.mock("../src/utils.js", () => ({
  extractAleoPayload: vi.fn((payload: Record<string, unknown>) => ({
    transaction: payload.transaction as string,
    transitionViewKey: payload.transitionViewKey as string,
    payer: payload.payer as string,
  })),
  getTransactionId: vi.fn(() => `at1mock_tx_id_${++txCounter}`),
  parseTransaction: vi.fn(() => ({
    id: () => `at1mock_tx_id_${txCounter}`,
    transitions: () => [createMockTransition()],
  })),
  getTransferTransition: vi.fn(() => createMockTransition()),
  decryptTransition: vi.fn(() => ({ mock: true })),
  extractTransferInputs: vi.fn(() => ({
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
      transitionViewKey: "123field",
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
      // The mock transition returns TESTNET_ASSET as programId, but
      // requirements expect a different asset
      const requirements = createRequirements({
        asset: "wrong_program.aleo",
      });

      const result = await scheme.verify(createPayload(), requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(AleoErrorReason.INVALID_TRANSACTION);
      expect(result.invalidMessage).toContain("wrong_program.aleo");
    });

    it("should reject if function name is not a known transfer variant", async () => {
      // Override getTransferTransition to return a transition with an unexpected function
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
