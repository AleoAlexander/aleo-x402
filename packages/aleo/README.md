# @x402/aleo

Aleo blockchain mechanism for the [x402 payment protocol](https://github.com/x402). Implements private stablecoin (USDCx) transfers with zero-knowledge proofs and Transition View Key (TVK) selective disclosure.

## Installation

```bash
pnpm install @x402/aleo
```

Requires `@provablehq/sdk` as a peer dependency:

```bash
pnpm install @provablehq/sdk
```

## Overview

This package provides the Aleo-specific `exact` scheme implementation across the three x402 roles:

| Role | Class | Purpose |
|------|-------|---------|
| **Client** | `ExactAleoClientScheme` | Builds private transfer transactions with ZK proofs |
| **Server** | `ExactAleoServerScheme` | Parses prices and configures payment requirements |
| **Facilitator** | `ExactAleoFacilitatorScheme` | Verifies transactions via TVK decryption, broadcasts and confirms on-chain |

The payment flow uses the USDCx compliant stablecoin program (`usdcx_stablecoin.aleo`), which enforces freeze-list compliance via Credentials records.

### How TVK Verification Works

1. The **client** builds a `transfer_private_with_creds` transaction (fully proved, not broadcast) and derives a Transition View Key (TVK) from the transition's TPK.
2. The client sends the serialized transaction + TVK to the facilitator (via the server).
3. The **facilitator** uses the TVK to decrypt the transition's private inputs and verify the recipient address and amount — without learning anything else about the sender's records.
4. Once verified, the facilitator broadcasts the transaction and waits for on-chain confirmation.

## Usage

### Client

```typescript
import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import {
  registerExactAleoClientScheme,
  toClientAleoSigner,
  ALEO_MAINNET,
} from "@x402/aleo";

const signer = toClientAleoSigner("APrivateKey1...", {
  network: ALEO_MAINNET,
  credentialsRecord: "{ owner: aleo1..., ... }",
  tokenRecord: "{ owner: aleo1..., amount: ... }",
});

const coreClient = new x402Client();
registerExactAleoClientScheme(coreClient, { signer });

const client = new x402HTTPClient(coreClient);
```

#### Signer Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `network` | `string` | `"aleo:mainnet"` | CAIP-2 network identifier |
| `apiUrl` | `string` | Per-network default | Custom API endpoint |
| `credentialsRecord` | `string` | — | Pre-existing Credentials record (skips `get_credentials` step) |
| `tokenRecord` | `string` | — | Pre-existing Token record (avoids network scan) |

The signer automatically caches updated Credentials and Token records from transaction outputs for subsequent transfers.

### Server

```typescript
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { x402HTTPResourceServer } from "@x402/core/http";
import { registerExactAleoServerScheme } from "@x402/aleo";

const resourceServer = new x402ResourceServer(
  new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" }),
);
registerExactAleoServerScheme(resourceServer);

await resourceServer.initialize();

// Configure a route with Aleo payment
const routes = {
  "GET /api/data": {
    accepts: {
      scheme: "exact",
      network: "aleo:mainnet",
      payTo: "aleo1...",
      price: "$0.01",
    },
  },
};
```

### Facilitator

```typescript
import { x402Facilitator } from "@x402/core/facilitator";
import {
  registerExactAleoFacilitatorScheme,
  toFacilitatorAleoSigner,
} from "@x402/aleo";

const signer = toFacilitatorAleoSigner("APrivateKey1...");

const facilitator = new x402Facilitator();
registerExactAleoFacilitatorScheme(facilitator, {
  signer,
  networks: "aleo:mainnet",
});
```

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `ALEO_MAINNET` | `"aleo:mainnet"` | Mainnet CAIP-2 identifier |
| `ALEO_TESTNET` | `"aleo:testnet"` | Testnet CAIP-2 identifier |
| `USDCX_PROGRAM_ID_MAINNET` | `"usdcx_stablecoin.aleo"` | USDCx program (mainnet) |
| `USDCX_PROGRAM_ID_TESTNET` | `"test_usdcx_stablecoin.aleo"` | USDCx program (testnet) |
| `USDCX_DECIMALS` | `6` | Decimal places (1 USDCx = 1,000,000 micro-units) |
| `TRANSFER_FUNCTION` | `"transfer_private_with_creds"` | Recommended transfer function |
| `TRANSFER_FUNCTION_NO_CREDS` | `"transfer_private"` | Fallback (uses Merkle proofs) |

## Utilities

Low-level functions for working with Aleo transactions directly:

```typescript
import {
  parseTransaction,
  getTransferTransition,
  decryptTransition,
  extractTransferInputs,
  getTransactionId,
  parseAleoInteger,
  isValidAleoAddress,
} from "@x402/aleo";
```

| Function | Description |
|----------|-------------|
| `parseTransaction(serialized)` | Parse a serialized transaction string into a WASM `Transaction` object |
| `getTransactionId(serialized)` | Extract the transaction ID (`at1...`) from a serialized transaction |
| `getTransferTransition(tx)` | Get the first execution transition from a parsed transaction |
| `decryptTransition(transition, tvk)` | Decrypt a transition's private inputs using a TVK |
| `extractTransferInputs(decrypted)` | Extract `{ recipient, amount }` from a decrypted transition |
| `parseAleoInteger(value)` | Parse an Aleo integer string (e.g. `"1000000u128"`) to `bigint` |
| `isValidAleoAddress(address)` | Validate an `aleo1...` address format |

## Testing

### Unit Tests

Unit tests mock the `@provablehq/sdk` WASM layer and run in under a second:

```bash
pnpm --filter @x402/aleo test
```

### Integration Tests

Integration tests exercise the real cryptographic flow — building ZK-proved transactions, generating TVKs, and decrypting transitions. They require a funded testnet account with both Token and Credentials records.

#### Setup

1. Copy the example env file and fill in your testnet credentials:

```bash
cp packages/aleo/.env.example packages/aleo/.env
```

2. Edit `.env` with your values:

```env
ALEO_PRIVATE_KEY=APrivateKey1...
ALEO_CREDENTIALS_RECORD={ owner: aleo1..., freeze_list_root: ... }
ALEO_TOKEN_RECORD={ owner: aleo1..., amount: ... }
```

To obtain these records:
- **Private key**: Any Aleo testnet account with USDCx tokens
- **Token record**: A `Token` record from `test_usdcx_stablecoin.aleo` owned by your account. Obtain test USDCx via the [testnet USDCx minting site](https://usdcx.aleo.dev/).
- **Credentials record**: A `Credentials` record from `test_usdcx_stablecoin.aleo/get_credentials`. This proves your account is not on the freeze list.

#### Running

```bash
pnpm --filter @x402/aleo test:integration
```

This takes 30-60 seconds (ZK proof generation). On first run, proving keys are downloaded and cached. The test:

1. Generates a fresh recipient account
2. Builds a `transfer_private_with_creds` transaction with ZK proofs
3. Parses the serialized transaction and extracts the transfer transition
4. Verifies the transition targets the correct program and function
5. Decrypts the transition using the TVK
6. Asserts the decrypted recipient and amount match the original inputs

If env vars are missing, the integration suite is skipped automatically.

## Project Structure

```
packages/aleo/
├── src/
│   ├── index.ts                         # Public API exports
│   ├── constants.ts                     # Network IDs, program IDs, config
│   ├── signer.ts                        # ClientAleoSigner / FacilitatorAleoSigner interfaces
│   ├── types.ts                         # ExactAleoPayload, AleoErrorReason
│   ├── utils.ts                         # Transaction parsing, decryption, validation
│   ├── signers/
│   │   ├── clientSigner.ts              # toClientAleoSigner factory
│   │   └── facilitatorSigner.ts         # toFacilitatorAleoSigner factory
│   └── exact/
│       ├── client/                      # Client scheme + registration
│       ├── facilitator/                 # Facilitator scheme + registration
│       └── server/                      # Server scheme + registration
├── test/
│   ├── client-scheme.test.ts            # Client scheme unit tests
│   ├── facilitator-scheme.test.ts       # Facilitator verify/settle unit tests
│   ├── server-scheme.test.ts            # Server price parsing unit tests
│   ├── utils.test.ts                    # Utility function unit tests
│   └── tvk-roundtrip.integration.test.ts # End-to-end TVK integration test
├── vitest.config.ts                     # Unit test config (excludes integration)
├── vitest.integration.config.ts         # Integration test config (180s timeout)
├── .env.example                         # Template for integration test env vars
└── package.json
```
