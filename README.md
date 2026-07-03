# Avalon

**Usage-based media, billed by the moment in USDC on Arc.** Watch video per second and read books per page, paying real test USDC through Circle Gateway nanopayments on Arc testnet. You approve a budget **once**; **Ember**, an AI budget agent, manages the spend in real time; settlement batches on-chain.

> Built on Circle + Arc, addressing streaming & continuous payments and creator/publisher monetization, with an agentic budget layer on top.

- Demo video: https://youtu.be/EP12KS0QKG0
- Live: https://avalon-nine-lilac.vercel.app

---

## The problem

Per-second billing and per-transaction signing are incompatible. If a viewer has to sign a wallet prompt for every metered tick, the experience is unusable. That signing fatigue is why most "pay-per-use" media never ships.

Avalon's answer: **approve a rate, not a transaction.** The user authorizes a spending allowance one time. After that the meter draws against it as off-chain accounting, an agent decides how fast to spend, and value settles to creators in batches on-chain. The single human signature is the up-front authorization; nothing is signed per draw.

---

## What it does

1. **One approval, your budget.** At session start you choose a per-session cap from presets ($0.06 / $0.25 / $1 / $5) or a custom amount. That cap is reserved against your Circle Gateway balance. You are never asked to sign again unless you run out, in which case you can extend.
2. **Live metering.** Video bills per second (socket heartbeats); books bill per page turn. Each draw is an atomic deduction against the allowance in integer atomic USDC units (6dp), so concurrent draws can never overspend the cap.
3. **Ember, the budget agent, decides.** Every tick, cheap deterministic guards run first (exhausted / would-exceed / rate-cap -> throttle). On genuine judgment calls (low remaining budget with more content queued) Ember consults its model (**DeepSeek**) to decide: continue at full rate, **throttle** to stretch the budget, or **stop**. The decision is shown on screen, so the agency is visible, not buried.
4. **Batched settlement.** Accrued draws fold into **one** on-chain Gateway settlement per batch, signed by a Circle developer-controlled wallet (EIP-3009 `TransferWithAuthorization` against the GatewayWallet on Arc). One ledger row per batch, with a real Gateway tx ref. Creators get 85%, platform 15%.
5. **Verify on-chain.** A Transactions view lists every settled batch with its Gateway ref and the signed payer -> recipient authorization, linking out to the Arc explorer (Arcscan) so you can verify the wallet's on-chain activity. Funding is in-app too: in circle mode the top-up page shows the buyer wallet's USDC balance and address, and deposits test USDC into Gateway (approve + deposit) without leaving the browser.

The agent never blocks billing: a model timeout, error, or unparseable reply falls back to "approve within policy" and keeps drawing.

---

## Why Ember is an agent, not a threshold

Ember makes a real allocation call. Given remaining budget, fraction of the current item consumed, and what is queued, it chooses to keep paying, slow the rate, or stop and conserve, and it returns a target rate and a reason. The UI distinguishes a live model decision (`Ember`) from a deterministic guard (`rule`) and from a fallback (`model offline`), so a reviewer can see exactly when the AI is in control.

---

## Circle + Arc stack

| Piece | Used for |
| --- | --- |
| **Circle Gateway / Nanopayments** | One-time deposit, then batched settlement of folded draws on Arc testnet |
| **Circle developer-controlled Wallets** (`@circle-fin/developer-controlled-wallets`) | An EOA buyer wallet signs EIP-3009 authorizations programmatically, with no per-draw popup |
| **x402 protocol** (`@circle-fin/x402-batching`, `@x402/core`, `@x402/evm`) | The batching facilitator that verifies and settles the signed authorizations |
| **USDC on Arc testnet** | The unit of account, down to sub-cent atomic amounts |
| **viem** | On-chain Gateway balance reads, the buyer USDC `balanceOf`, and the deposit contract calls |
| **Arcscan** (Blockscout, `testnet.arcscan.app`) | Verify-on-chain links for settled batches and wallet addresses |
| **DeepSeek** (`deepseek-chat`, OpenAI-compatible) | The model behind Ember's in-loop budget-allocation decision |

EIP-712 domain: `GatewayWalletBatched` v1, chainId `5042002` (Arc testnet), `verifyingContract` = the GatewayWallet (`0x0077777d7EBA4688BDeF3E311b846F25870A19B9`), not the USDC token. Amounts are decimal-string atomic USDC.

---

## Proof it runs on Arc

What's independently verifiable, and what isn't, given how Circle's Gateway batching is architected:

- **Real signing and real facilitator acceptance (fully verifiable).** In `PAYMENT_MODE=circle`, every batch is signed by a genuine Circle developer-controlled wallet (EIP-3009 `TransferWithAuthorization`, not a mock) and submitted to Circle's actual Gateway facilitator (`gateway-api-testnet.circle.com`). The facilitator cryptographically verifies the authorization and returns `success: true` for each one; Avalon records that acceptance as a `settlement_batch` ledger row with the signed authorization as payment proof. This is the code path anyone can read in `circleGatewayService.js`, and it is not simulated.
- **The Gateway pipeline is demonstrably live on Arc (fully verifiable).** The GatewayWallet contract (`0x0077777d7EBA4688BDeF3E311b846F25870A19B9`, verified on Arcscan) is actively processing `submitBatch` calls roughly every 15 minutes from many relayer addresses, and Avalon's own buyer wallet has two directly-attributable on-chain transactions (`approve` + `deposit`) that funded its Gateway balance. This confirms the underlying settlement infrastructure genuinely runs on Arc testnet, not just against a local mock.
- **Batch ref vs EVM hash, and the limit of what's checkable.** The ref returned at settle time is a Circle batch id (a UUID), not yet an EVM hash — Gateway settles asynchronously, batching many depositors' authorizations into one `submitBatch(bytes calldataBytes, bytes signature)` call. That call's contents are opaque, and its only event (`BatchProcessed(batchId, signer, tokenAddress)`) does not expose individual depositor, recipient, or amount by design. We searched the raw calldata of consecutive `submitBatch` transactions for the exact nonce of several of our settlements and found no match, meaning **individual per-transfer on-chain attribution is not independently verifiable via the public block explorer** for this batching architecture — a property of how Circle Gateway is built, not a gap specific to Avalon. The app only renders an explorer `/tx/` link once a ref is a real `0x` hash, and otherwise shows the batch ref honestly rather than a fake link.
- **Tested invariants (27/27, `npm test --workspace server`).** Allowance cap holds under concurrent draws; settlement keeps `settled + inFlight + pending === spent`; settlement nonce is stable so a lost-response retry settles exactly once; reservation keeps `available + reserved + spent === total` and never over-claims; the agent's deterministic guards, model-failure fallback, and dollar->atomic unit conversion are all covered.

---

## How the money moves

```
approve once  ->  reserve cap against Gateway pool  (available -> reserved)
   every tick ->  agent.decide (continue | throttle | stop)
              ->  atomic draw against allowance      (off-chain accounting)
   threshold  ->  claim batch -> sign (Circle wallet) -> Gateway settle -> finalize
              ->  one ledger row + real tx ref        (reserved -> spent)
 session end  ->  release the unused reservation      (reserved -> available)
```

Invariants enforced atomically at every step:
- allowance: `spent + amount <= cap`
- settlement: `settled + inFlight + pending === spent`
- reservation pool: `available + reserved + spent === total`, `available >= 0`

---

## Run it locally

Prereqs: Node 20+, and a MongoDB (local, or a free hosted cluster).

```bash
docker compose up -d mongo          # local Mongo; OR skip and use a hosted cluster
npm install                         # workspaces: client + server

cp server/.env.example server/.env  # set PAYMENT_MODE=mock to start
cp client/.env.local.example client/.env.local

npm run seed --workspace server     # demo catalog + demo user
npm run dev                         # API on :4000, web on :3000
```

No local Mongo (or it needs admin to start)? Use a hosted cluster with no install:
create a free MongoDB Atlas database and set `MONGODB_URI` in `server/.env` to its
SRV string (`mongodb+srv://…/avalon`), then run the seed and dev commands above.

Open http://localhost:3000, pick a title, approve, and watch the meter. `PAYMENT_MODE=mock` debits a mock balance with no chain or signing - the fastest way to see the meter and the agent. Flip to `PAYMENT_MODE=circle` for real Arc settlement.

### Circle / Arc mode (real settlement)

One-time setup, then `PAYMENT_MODE=circle`:

1. Create a Circle developer-controlled wallet set and an **EOA** buyer wallet on `ARC-TESTNET`; register an entity secret. Put the IDs in `server/.env` (`CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `CIRCLE_WALLET_SET_ID`, `CIRCLE_BUYER_WALLET_ID`, `CIRCLE_BUYER_ADDRESS`).
2. Fund the buyer wallet with test USDC (faucet.circle.com), then deposit into Gateway. Either run `node src/scripts/gatewayDeposit.js 0.5`, or do it in the app on the **Top up** page (it shows the wallet balance + address and runs the same approve + deposit on-chain). Both share `gatewayDepositService`.
3. Set `DEEPSEEK_API_KEY` and `AGENT_REASONING=true` to enable the live agent.
4. Optional: `ARC_EXPLORER_URL` (default `https://testnet.arcscan.app`) for the verify-on-chain links.

See `server/.env.example` for every variable and its meaning.

---

## Repo layout

```
server/src
  services/        allowanceService (atomic draw), meterService (the billing spine),
                   settlementService (batched on-chain settle), reservationService
                   (Gateway-balance pool), circleGatewayService (sign + facilitator),
                   gatewayDepositService (approve + deposit + balance reads),
                   ledgerService (settlement history)
  integrations/    agentPaymentProvider (Ember, the budget agent: guards + DeepSeek)
  payments/        paymentMode (the mock/circle seam), circleWalletSigner
                   (dev-controlled wallet), paymentAdapter
  models/          UsageSession, GatewayPool, Ledger, Content, User
  realtime/        socketServer (heartbeat + page transport)
  scripts/         gatewayDeposit, throttle/settle verifiers
client
  components/      MoneyMeter, AgentBanner, SessionGate (the live money + agent UI),
                   VideoViewer, BookReader, AppShell, ui (shared kit + RefreshButton)
  lib/             api, explorer (tx/address links + isTxHash), config
  app/             / (landing), /app (watch & read), /dashboard, /transactions
                   (on-chain explorer), /top-up (mock balance or on-chain deposit),
                   /creator
```

The billing path is one spine: video ticks and book pages both flow through `meterService` -> agent -> `allowanceService.draw` -> batched `settlementService`. There is no separate per-page signing path.

---

## Status and honest notes

- `PAYMENT_MODE=mock` is the demo default (the visible balance decrements immediately). In `circle` mode the on-chain Gateway debit is **batched and asynchronous**, so the buyer's on-chain balance moves after the settlement is batched, not in the same second; the settlement tx ref is the immediate acceptance proof.
- The Gateway pool is keyed per user, which is correct for the single demo buyer wallet; multi-user-per-wallet keying is known, scoped future work.
- Built and iterated during the event; the architecture is intentionally one billing spine so video and books share metering, the agent, and settlement.
