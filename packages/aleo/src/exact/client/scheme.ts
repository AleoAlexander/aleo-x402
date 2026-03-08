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
 * Builds a fully-proved x402 wrapper transaction where recipient
 * and amount are exposed as public inputs for facilitator verification.
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

    // Build the x402 wrapper transaction with public inputs
    const { transaction } =
      await this.signer.buildPrivateTransfer(
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
