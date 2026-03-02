import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExactAleoScheme } from "../src/exact/client/scheme.js";
import type { ClientAleoSigner } from "../src/signer.js";
import type { PaymentRequirements } from "@x402/core/types";
import { ALEO_TESTNET, USDCX_PROGRAM_IDS } from "../src/constants.js";

function createMockSigner(): ClientAleoSigner {
  return {
    address: "aleo1clientaddress0000000000000000000000000000000000000000000000",
    buildPrivateTransfer: vi.fn().mockResolvedValue({
      transaction: '{"type":"execute","id":"at1mock_tx_123"}',
      transitionViewKey: "456field",
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
      asset: USDCX_PROGRAM_IDS[ALEO_TESTNET],
      amount: "100000",
      payTo: "aleo1recipientaddress000000000000000000000000000000000000000000",
      maxTimeoutSeconds: 300,
      extra: {},
    };

    const result = await scheme.createPaymentPayload(2, requirements);

    expect(result.x402Version).toBe(2);
    expect(result.payload).toEqual({
      transaction: '{"type":"execute","id":"at1mock_tx_123"}',
      transitionViewKey: "456field",
      payer: signer.address,
    });

    expect(signer.buildPrivateTransfer).toHaveBeenCalledWith(
      requirements.payTo,
      BigInt("100000"),
      USDCX_PROGRAM_IDS[ALEO_TESTNET],
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
