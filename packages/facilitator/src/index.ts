import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { x402Facilitator } from "@x402/core/facilitator";
import type { Network, PaymentPayload, PaymentRequirements } from "@x402/core/types";
import {
  registerExactAleoFacilitatorScheme,
  toFacilitatorAleoSigner,
} from "@x402/aleo";
import { loadConfig } from "./config.js";

const config = loadConfig();

// Create the Aleo facilitator signer
const signer = toFacilitatorAleoSigner(config.aleoPrivateKey, {
  apiUrls: config.aleoApiUrl
    ? { [config.network]: config.aleoApiUrl }
    : undefined,
});

// Create and configure the x402 Facilitator
const facilitator = new x402Facilitator();
registerExactAleoFacilitatorScheme(facilitator, {
  signer,
  networks: config.network as Network,
});

// Create Hono server
const app = new Hono();

app.use("/*", cors());

/**
 * GET /supported — Returns supported payment kinds, extensions, and signers
 */
app.get("/supported", (c) => {
  const supported = facilitator.getSupported();
  return c.json(supported);
});

/**
 * POST /verify — Verify a payment payload against requirements
 */
app.post("/verify", async (c) => {
  try {
    const body = await c.req.json<{
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
    }>();

    const { paymentPayload, paymentRequirements } = body;

    if (!paymentPayload || !paymentRequirements) {
      return c.json(
        {
          isValid: false,
          invalidReason: "invalid_request",
          invalidMessage: "Missing paymentPayload or paymentRequirements",
        },
        400,
      );
    }

    const result = await facilitator.verify(
      paymentPayload,
      paymentRequirements,
    );

    return c.json(result, result.isValid ? 200 : 400);
  } catch (error) {
    return c.json(
      {
        isValid: false,
        invalidReason: "internal_error",
        invalidMessage:
          error instanceof Error ? error.message : "Internal server error",
      },
      500,
    );
  }
});

/**
 * POST /settle — Broadcast and confirm a verified payment
 */
app.post("/settle", async (c) => {
  try {
    const body = await c.req.json<{
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
    }>();

    const { paymentPayload, paymentRequirements } = body;

    if (!paymentPayload || !paymentRequirements) {
      return c.json(
        {
          success: false,
          errorReason: "invalid_request",
          errorMessage: "Missing paymentPayload or paymentRequirements",
          transaction: "",
          network: "",
        },
        400,
      );
    }

    const result = await facilitator.settle(
      paymentPayload,
      paymentRequirements,
    );

    return c.json(result, result.success ? 200 : 500);
  } catch (error) {
    return c.json(
      {
        success: false,
        errorReason: "internal_error",
        errorMessage:
          error instanceof Error ? error.message : "Internal server error",
        transaction: "",
        network: "",
      },
      500,
    );
  }
});

/**
 * Health check endpoint
 */
app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// Start the server
console.log(`Aleo x402 Facilitator starting on port ${config.port}`);
console.log(`Network: ${config.network}`);
console.log(`Facilitator address: ${signer.address}`);

serve({
  fetch: app.fetch,
  port: config.port,
});

console.log(`Listening on http://0.0.0.0:${config.port}`);
