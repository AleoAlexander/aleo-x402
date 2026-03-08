# Public Inputs Redesign

Replace TVK-based selective disclosure with a wrapper Leo program (`x402.aleo`) that exposes recipient and amount as public inputs.

## Motivation

The x402 protocol's 402 response already reveals `payTo` and `amount` in the clear. TVK decryption adds complexity to protect information that is inherently public in this context. A wrapper program that makes these values public inputs eliminates the entire TVK layer while preserving the privacy of all other transaction data (sender records, credentials, balances).

## Wrapper Program

Already written at `leo/x402/src/main.leo`:

```leo
import usdcx_stablecoin.aleo;

program x402.aleo {
    async transition usdcx_transfer_with_proof(
        public recipient: address,
        public amount: u128,
        token_record: usdcx_stablecoin.aleo/Token,
        credentials_record: usdcx_stablecoin.aleo/Credentials
    ) -> (...) {
        let (...) = usdcx_stablecoin.aleo/transfer_private_with_creds(
            recipient, amount, token_record, credentials_record
        );
        return (...);
    }
}
```

Not yet deployed. Testnet only for now.

## Changes

### Payload

`ExactAleoPayload` drops `transitionViewKey`:

```typescript
{ transaction: string; payer: string }
```

### Signer

`ClientAleoSigner.buildPrivateTransfer` returns `{ transaction }` only. Executes `x402.aleo/usdcx_transfer_with_proof` instead of calling the stablecoin program directly. No TVK derivation.

### Facilitator Verification

Reads public inputs directly from the transition instead of TVK-decrypting:

1. Extract payload (no TVK validation)
2. Validate payer address
3. Parse transaction, extract ID
4. Replay cache check
5. Network existence check (reject already-broadcast transactions)
6. Find `usdcx_transfer_with_proof` transition
7. Verify programId === x402 wrapper, functionName === `usdcx_transfer_with_proof`
8. Read public inputs[0] (recipient) and inputs[1] (amount)
9. Assert recipient === payTo, amount >= required

### Constants

- Add: `X402_PROGRAM_ID_TESTNET`, `USDCX_TRANSFER_FUNCTION`
- Remove: `TRANSFER_FUNCTION`, `TRANSFER_FUNCTION_NO_CREDS`

### Utilities

- Remove: `decryptTransition`, `extractTransferInputs`
- Add: `extractPublicInputs(transition)` — reads public inputs, returns `{ recipient, amount }`
- Update: `extractAleoPayload` drops TVK validation
- Remove: `INVALID_TVK` error reason

### Files

| File | Action |
|------|--------|
| `src/types.ts` | Remove `transitionViewKey` from payload, remove `INVALID_TVK` |
| `src/constants.ts` | Add x402 program ID and function, remove old transfer functions |
| `src/signer.ts` | Return type drops TVK |
| `src/signers/clientSigner.ts` | Execute wrapper, remove TVK derivation |
| `src/utils.ts` | Remove TVK utils, add `extractPublicInputs`, update payload extraction |
| `src/index.ts` | Update exports |
| `src/exact/client/scheme.ts` | Drop TVK from payload |
| `src/exact/facilitator/scheme.ts` | Public inputs instead of TVK decryption |
| `src/exact/server/scheme.ts` | No changes |
| `test/*.test.ts` | Update all mocks and assertions |
| `test/tvk-roundtrip.integration.test.ts` | Rewrite as public-inputs round-trip |
| `README.md` | Update architecture description |
