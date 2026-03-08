# Aleo x402 Payment Protocol Integration

Private micropayments over HTTP using Aleo's zero-knowledge proof system and the x402 payment protocol.

## What is this?

This project integrates the [Aleo blockchain](https://aleo.org) into the [x402 protocol](https://github.com/coinbase/x402) as a new mechanism package. It enables **private USDCx stablecoin payments** where transaction amounts, sender addresses, and recipient addresses remain encrypted on-chain.

The key innovation is the **x402 wrapper program** (`x402.aleo`): the client executes `usdcx_transfer_with_proof` which exposes recipient and amount as **public inputs**, allowing the facilitator to read and verify them directly from the transaction — without any decryption or access to the client's keys.

## Packages

| Package | Description |
|---------|-------------|
| `@x402/aleo` | Core mechanism — client, facilitator, and server scheme implementations |
| `@x402/aleo-facilitator` | Deployable Hono server with `/verify`, `/settle`, `/supported` endpoints |

## Payment Flow

```
Client → GET /resource → 402 Payment Required
Client → Build usdcx_transfer_with_proof tx (ZK proofs, public inputs)
Client → GET /resource + X-PAYMENT {transaction, payer}
Server → POST /verify to Facilitator (read public inputs → check recipient + amount)
Server ← 200 OK + resource (optimistic delivery)
Server → POST /settle to Facilitator (broadcast tx → confirm on-chain)
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

### Running the Facilitator

```bash
cd packages/facilitator
ALEO_PRIVATE_KEY=APrivateKey1... pnpm dev
```

### Running the Example Server

```bash
cd examples/server
PAY_TO=aleo1... FACILITATOR_URL=http://localhost:8080 pnpm start
```

### Running the Example Client

```bash
cd examples/client
ALEO_PRIVATE_KEY=APrivateKey1... API_URL=http://localhost:3000 pnpm start
```

## Architecture

- **Scheme**: `"exact"` (same as EVM/Solana/Aptos — chain identified by `network` field)
- **Network IDs** (CAIP-2): `"aleo:mainnet"`, `"aleo:testnet"`
- **Asset**: USDCx compliant stablecoin (via `x402.aleo` wrapper)
- **Verification**: Public inputs read directly from the transaction — no decryption needed
- **Delivery**: Optimistic — resource served after verify, settlement is async
- **Fee model**: Client pays all Aleo network fees (embedded in the transaction)

## Key Differences from EVM/Solana x402

1. Client pre-builds the *entire* transaction (with ZK proofs) before sending
2. Wrapper program exposes recipient and amount as public inputs for facilitator verification
3. Resource served **optimistically** after `/verify` — settlement is async
4. The facilitator does NOT receive the payment; `payTo` is the resource server's address
5. Client pays all network fees

## Dependencies

| Package | Purpose |
|---------|---------|
| `@x402/core` | Protocol types, facilitator/client orchestration, HTTP encoding |
| `@provablehq/sdk` | Account, ProgramManager, Transaction, Transition |
| `hono` | Facilitator server framework |
| `vitest` | Testing |
| `tsup` | Build |
