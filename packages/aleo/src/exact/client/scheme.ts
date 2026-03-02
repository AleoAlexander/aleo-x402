import type {
  SchemeNetworkClient,
  PaymentRequirements,
  PaymentPayloadResult,
  PaymentPayloadContext,
} from "@x402/core/types";
import type { ClientAleoSigner } from "../../signer.js";
import { SCHEME, USDCX_PROGRAM_IDS } from "../../constants.js";

/**
 * Aleo client scheme for the "exact" payment mechanism.
 *
 * Builds a fully-proved transfer_private transaction and provides
 * a Transition View Key (TVK) for selective disclosure of the
 * transfer's recipient and amount.
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

    // Resolve the USDCx program ID for this network
    const programId = asset || USDCX_PROGRAM_IDS[network];
    if (!programId) {
      throw new Error(`No USDCx program ID configured for network: ${network}`);
    }

    // Build the transfer_private transaction with ZK proofs
    const { transaction, transitionViewKey } =
      await this.signer.buildPrivateTransfer(
        payTo,
        BigInt(amount),
        programId,
      );

    return {
      x402Version,
      payload: {
        transaction,
        transitionViewKey,
        payer: this.signer.address,
      },
    };
  }
}
