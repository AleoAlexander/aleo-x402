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
      // 63 chars total: "aleo1" + 58 lowercase alphanumeric
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
        transitionViewKey: "123field",
        payer: "aleo1abc",
      };
      const result = extractAleoPayload(payload);
      expect(result).toEqual(payload);
    });

    it("should throw for missing transaction", () => {
      expect(() =>
        extractAleoPayload({ transitionViewKey: "f", payer: "p" }),
      ).toThrow("Missing or invalid 'transaction'");
    });

    it("should throw for missing transitionViewKey", () => {
      expect(() =>
        extractAleoPayload({ transaction: "t", payer: "p" }),
      ).toThrow("Missing or invalid 'transitionViewKey'");
    });

    it("should throw for missing payer", () => {
      expect(() =>
        extractAleoPayload({ transaction: "t", transitionViewKey: "f" }),
      ).toThrow("Missing or invalid 'payer'");
    });
  });
});
