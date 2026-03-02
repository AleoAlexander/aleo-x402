import { describe, it, expect } from "vitest";
import { ExactAleoScheme } from "../src/exact/server/scheme.js";
import { ALEO_MAINNET, ALEO_TESTNET, USDCX_PROGRAM_IDS } from "../src/constants.js";

describe("ExactAleoScheme (server)", () => {
  const scheme = new ExactAleoScheme();

  describe("parsePrice", () => {
    it('should parse dollar string "$0.01" to micro-units', async () => {
      const result = await scheme.parsePrice("$0.01", ALEO_MAINNET);
      expect(result.amount).toBe("10000");
      expect(result.asset).toBe(USDCX_PROGRAM_IDS[ALEO_MAINNET]);
    });

    it('should parse dollar string "$1.50" to micro-units', async () => {
      const result = await scheme.parsePrice("$1.50", ALEO_MAINNET);
      expect(result.amount).toBe("1500000");
    });

    it("should parse numeric price to micro-units", async () => {
      const result = await scheme.parsePrice(0.1, ALEO_MAINNET);
      expect(result.amount).toBe("100000");
    });

    it("should parse string number to micro-units", async () => {
      const result = await scheme.parsePrice("0.25", ALEO_TESTNET);
      expect(result.amount).toBe("250000");
      expect(result.asset).toBe(USDCX_PROGRAM_IDS[ALEO_TESTNET]);
    });

    it("should pass through AssetAmount objects", async () => {
      const input = { asset: "custom.aleo", amount: "999" };
      const result = await scheme.parsePrice(input, ALEO_MAINNET);
      expect(result).toEqual(input);
    });

    it("should handle zero price", async () => {
      const result = await scheme.parsePrice(0, ALEO_MAINNET);
      expect(result.amount).toBe("0");
    });

    it("should handle whole dollar amounts", async () => {
      const result = await scheme.parsePrice("$100", ALEO_MAINNET);
      expect(result.amount).toBe("100000000");
    });

    it("should throw for negative price", async () => {
      await expect(scheme.parsePrice(-1, ALEO_MAINNET)).rejects.toThrow(
        "Invalid price",
      );
    });

    it("should throw for unsupported network", async () => {
      await expect(
        scheme.parsePrice("$1.00", "aleo:unknown" as `${string}:${string}`),
      ).rejects.toThrow("No USDCx program ID");
    });
  });

  describe("enhancePaymentRequirements", () => {
    it("should pass through requirements unchanged", async () => {
      const requirements = {
        scheme: "exact",
        network: ALEO_MAINNET,
        asset: USDCX_PROGRAM_IDS[ALEO_MAINNET],
        amount: "10000",
        payTo: "aleo1abc123",
        maxTimeoutSeconds: 300,
        extra: {},
      };

      const result = await scheme.enhancePaymentRequirements(
        requirements,
        { x402Version: 2, scheme: "exact", network: ALEO_MAINNET },
        [],
      );

      expect(result).toEqual(requirements);
    });
  });
});
