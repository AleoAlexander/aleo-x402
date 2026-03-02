/**
 * Example: AI agent paying for API access with Aleo USDCx
 *
 * This demonstrates the client-side x402 payment flow:
 * 1. Request a protected resource
 * 2. Receive 402 Payment Required with payment requirements
 * 3. Build a private transfer_private transaction with ZK proofs
 * 4. Retry the request with the payment payload
 *
 * Usage:
 *   ALEO_PRIVATE_KEY=APrivateKey1... API_URL=http://localhost:3000 tsx src/index.ts
 */

import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/client";
import {
  registerExactAleoClientScheme,
  toClientAleoSigner,
  ALEO_TESTNET,
} from "@x402/aleo";
import type { Network } from "@x402/core/types";

async function main() {
  const privateKey = process.env.ALEO_PRIVATE_KEY;
  if (!privateKey) {
    console.error("Set ALEO_PRIVATE_KEY environment variable");
    process.exit(1);
  }

  const apiUrl = process.env.API_URL || "http://localhost:3000";
  const network = (process.env.ALEO_NETWORK || ALEO_TESTNET) as Network;

  // 1. Create the Aleo signer from the private key
  const signer = toClientAleoSigner(privateKey, { network });
  console.log(`Client address: ${signer.address}`);

  // 2. Create the x402 client and register the Aleo scheme
  const client = new x402Client();
  registerExactAleoClientScheme(client, { signer, networks: [network] });
  const httpClient = new x402HTTPClient(client);

  // 3. Make a request to the protected resource
  console.log(`\nRequesting ${apiUrl}/weather...`);
  const response = await fetch(`${apiUrl}/weather`);

  if (response.status !== 402) {
    console.log(`Response status: ${response.status}`);
    const body = await response.text();
    console.log(`Body: ${body}`);
    return;
  }

  // 4. Parse the 402 response
  console.log("Received 402 Payment Required");
  const paymentRequired = httpClient.getPaymentRequiredResponse(
    (name) => response.headers.get(name),
    await response.json(),
  );

  console.log("Payment requirements:", JSON.stringify(paymentRequired, null, 2));

  // 5. Build the payment payload (this triggers ZK proof generation)
  console.log("\nBuilding payment transaction (generating ZK proofs)...");
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);

  // 6. Encode the payment as an HTTP header
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

  // 7. Retry the request with the payment
  console.log("Retrying request with payment...");
  const paidResponse = await fetch(`${apiUrl}/weather`, {
    headers: paymentHeaders,
  });

  console.log(`Response status: ${paidResponse.status}`);
  if (paidResponse.ok) {
    const data = await paidResponse.json();
    console.log("Resource data:", JSON.stringify(data, null, 2));

    // 8. Check settlement response
    const settleResponse = httpClient.getPaymentSettleResponse(
      (name) => paidResponse.headers.get(name),
    );
    console.log("Settlement:", JSON.stringify(settleResponse, null, 2));
  }
}

main().catch(console.error);
