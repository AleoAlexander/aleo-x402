/**
 * Example: Express API server accepting Aleo x402 payments
 *
 * This demonstrates the resource server side of the x402 flow.
 * Protected endpoints require payment via Aleo USDCx.
 *
 * Usage:
 *   PAY_TO=aleo1... FACILITATOR_URL=http://localhost:8080 tsx src/index.ts
 */

import express from "express";
import { x402ResourceServer } from "@x402/core/server";
import { HTTPFacilitatorClient } from "@x402/core/types";
import { x402HTTPResourceServer } from "@x402/core/http";
import {
  registerExactAleoServerScheme,
  ALEO_TESTNET,
} from "@x402/aleo";
import type { Network } from "@x402/core/types";

async function main() {
  const payTo = process.env.PAY_TO;
  if (!payTo) {
    console.error("Set PAY_TO environment variable to your Aleo address");
    process.exit(1);
  }

  const facilitatorUrl =
    process.env.FACILITATOR_URL || "http://localhost:8080";
  const port = parseInt(process.env.PORT || "3000", 10);
  const network = (process.env.ALEO_NETWORK || ALEO_TESTNET) as Network;

  // 1. Create a facilitator client pointing to the Aleo facilitator server
  const facilitatorClient = new HTTPFacilitatorClient({
    url: facilitatorUrl,
  });

  // 2. Create the resource server and register the Aleo scheme
  const resourceServer = new x402ResourceServer(facilitatorClient);
  registerExactAleoServerScheme(resourceServer, { networks: [network] });

  // 3. Initialize — fetches /supported from the facilitator
  await resourceServer.initialize();

  // 4. Create Express app
  const app = express();

  // 5. Create the HTTP resource server for Express integration
  const httpServer = new x402HTTPResourceServer(resourceServer);

  // 6. Protect endpoints with payment requirements
  app.get("/weather", async (req, res) => {
    // Check for payment / return 402
    const result = await httpServer.processHTTPRequest(
      {
        method: req.method,
        url: req.url,
        headers: req.headers as Record<string, string>,
      },
      {
        scheme: "exact",
        network,
        payTo,
        price: "$0.01",
        maxTimeoutSeconds: 300,
      },
      {
        url: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
        description: "Current weather data",
        mimeType: "application/json",
      },
    );

    if (result.requiresPayment) {
      res.status(402).json(result.requiresPayment);
      return;
    }

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    // Serve the protected resource
    res.json({
      location: "San Francisco, CA",
      temperature: 68,
      unit: "fahrenheit",
      conditions: "Partly cloudy",
      timestamp: new Date().toISOString(),
    });
  });

  app.listen(port, () => {
    console.log(`Example server listening on http://localhost:${port}`);
    console.log(`Payment recipient: ${payTo}`);
    console.log(`Facilitator: ${facilitatorUrl}`);
    console.log(`Network: ${network}`);
    console.log(`\nProtected endpoints:`);
    console.log(`  GET /weather — $0.01 per request`);
  });
}

main().catch(console.error);
