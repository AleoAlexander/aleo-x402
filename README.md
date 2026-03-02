# Aleo x402

## WARNING: This has not been tested or audited and is not yet ready for production!  Use at your own risk.

Private micropayments over HTTP using Aleo zero-knowledge proofs and the [x402 protocol](https://github.com/coinbase/x402).

Clients build fully-proved USDCx stablecoin transfers and provide a **Transition View Key (TVK)** for selective disclosure — the facilitator can verify the recipient and amount without seeing anything else about the transaction.

## Packages

| Package | Path | Description |
|---------|------|-------------|
| [`@x402/aleo`](packages/aleo/) | `packages/aleo` | Core mechanism — client, facilitator, and server schemes |
| `@x402/aleo-facilitator` | `packages/facilitator` | Deployable Hono server (`/verify`, `/settle`, `/supported`) |

## Quick Start

```bash
pnpm install
pnpm build
pnpm test
```

### Facilitator

```bash
cd packages/facilitator
ALEO_PRIVATE_KEY=APrivateKey1... pnpm dev
```

### Example Server

```bash
cd examples/server
PAY_TO=aleo1... FACILITATOR_URL=http://localhost:8080 pnpm start
```

### Example Client

```bash
cd examples/client
ALEO_PRIVATE_KEY=APrivateKey1... API_URL=http://localhost:3000 pnpm start
```

## Payment Flow

```
Client  →  GET /resource                        →  Server
Client  ←  402 + payment requirements           ←  Server
Client  →  Build ZK-proved tx + derive TVK
Client  →  GET /resource + X-PAYMENT header     →  Server
Server  →  POST /verify {tx, tvk}               →  Facilitator
Server  ←  ✓ verified                           ←  Facilitator
Client  ←  200 + resource (optimistic)          ←  Server
Server  →  POST /settle {tx}                    →  Facilitator → Aleo network
```

## How It Differs from EVM/Solana x402

- Client builds the **entire transaction** (with ZK proofs) before sending — the facilitator only broadcasts it
- Verification uses **TVK selective decryption**, not on-chain reads
- Resource is served **optimistically** after `/verify` — settlement is async
- The facilitator never receives funds; `payTo` is the resource server's address
- Client pays all network fees (embedded in the transaction)

## Requirements

- Node.js >= 20
- pnpm 9+
