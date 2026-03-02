import type {
  SchemeNetworkServer,
  PaymentRequirements,
  Price,
  AssetAmount,
  Network,
} from "@x402/core/types";
import {
  SCHEME,
  USDCX_PROGRAM_IDS,
  USDCX_MULTIPLIER,
} from "../../constants.js";

/**
 * Aleo server scheme for the "exact" payment mechanism.
 *
 * Converts user-friendly prices to USDCx micro-unit amounts
 * and passes through payment requirements (no fee payer needed
 * since the client pays all Aleo network fees).
 */
export class ExactAleoScheme implements SchemeNetworkServer {
  readonly scheme = SCHEME;

  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    const programId = USDCX_PROGRAM_IDS[network];
    if (!programId) {
      throw new Error(`No USDCx program ID configured for network: ${network}`);
    }

    // If price is already an AssetAmount, pass through
    if (typeof price === "object" && "asset" in price && "amount" in price) {
      return price as AssetAmount;
    }

    // Parse numeric price (in dollars) to USDCx micro-units
    let dollarAmount: number;
    if (typeof price === "string") {
      // Strip dollar sign and parse
      dollarAmount = parseFloat(price.replace(/^\$/, ""));
    } else {
      dollarAmount = price;
    }

    if (isNaN(dollarAmount) || dollarAmount < 0) {
      throw new Error(`Invalid price: ${price}`);
    }

    // Convert to micro-units (6 decimals)
    // Use Math.round to avoid floating point issues
    const microUnits = Math.round(dollarAmount * USDCX_MULTIPLIER);

    return {
      asset: programId,
      amount: microUnits.toString(),
    };
  }

  async enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    _supportedKind: {
      x402Version: number;
      scheme: string;
      network: Network;
      extra?: Record<string, unknown>;
    },
    _facilitatorExtensions: string[],
  ): Promise<PaymentRequirements> {
    // Aleo doesn't need a fee payer from the facilitator.
    // Client pays all fees embedded in the transaction.
    // Pass through requirements unchanged.
    return paymentRequirements;
  }
}
