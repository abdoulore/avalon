"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";

// One docs hub: Overview, Using Avalon, and a developer reference, with a sticky
// sidebar that tracks the section you're reading. Content mirrors the README so
// the two never drift.
const GROUPS = [
  {
    label: "Overview",
    items: [
      { id: "what", label: "What Avalon is" },
      { id: "problem", label: "The problem" },
      { id: "money", label: "How the money moves" },
      { id: "stack", label: "Circle + Arc stack" },
    ],
  },
  {
    label: "Using Avalon",
    items: [
      { id: "approve", label: "Approve a budget" },
      { id: "meter", label: "Watch & read" },
      { id: "ember", label: "Ember, the agent" },
      { id: "funding", label: "Funding on Arc" },
      { id: "verify", label: "Dashboard & verify" },
    ],
  },
];

const ALL_IDS = GROUPS.flatMap((g) => g.items.map((i) => i.id));

export default function DocsPage() {
  const [active, setActive] = useState(ALL_IDS[0]);

  // Scroll-spy: highlight the section currently in view.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -65% 0px", threshold: 0 }
    );
    ALL_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <AppShell requireAuth={false}>
      <div className="grid gap-10 lg:grid-cols-[210px_1fr]">
        {/* Sidebar */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-6">
            {GROUPS.map((g) => (
              <div key={g.label}>
                <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-zinc-600">{g.label}</div>
                <ul className="space-y-0.5 border-l border-white/10">
                  {g.items.map((it) => {
                    const on = active === it.id;
                    return (
                      <li key={it.id}>
                        <a
                          href={`#${it.id}`}
                          className={`-ml-px block border-l-2 py-1.5 pl-3 text-[13px] transition-colors ${
                            on ? "border-brand text-white" : "border-transparent text-zinc-500 hover:text-zinc-200"
                          }`}
                        >
                          {it.label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <article className="min-w-0 max-w-3xl">
          <header className="mb-12">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand">Documentation</span>
            <h1 className="mt-2 text-3xl font-semibold tracking-tighter text-white sm:text-4xl">How Avalon works</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
              Usage-based media, billed by the moment in USDC on Arc. Approve a budget once, watch per second and read per
              page, and an AI agent named Ember paces the spend while value settles to creators in batches on-chain.
            </p>
          </header>

          {/* ---------------- OVERVIEW ---------------- */}
          <Section id="what" eyebrow="Overview" title="What Avalon is">
            <P>
              Avalon meters media the way the cloud meters compute. Video bills per second, books bill per page, and you
              only pay for the moments you actually consume, down to sub-cent amounts in USDC on Arc testnet.
            </P>
            <P>
              The hard part is not metering, it is paying. A wallet prompt for every metered tick is unusable, which is why
              most pay-per-use media never ships. Avalon{"'"}s answer is to <Strong>approve a rate, not a transaction</Strong>:
              one signature authorizes a spending allowance, then the meter draws against it as off-chain accounting and
              settles in batches.
            </P>
          </Section>

          <Section id="problem" eyebrow="Overview" title="The problem">
            <P>
              Per-second billing and per-transaction signing are incompatible. Signing fatigue, one wallet popup per tick,
              is the reason streaming nanopayments have stayed a demo. Avalon removes the per-draw signature entirely. The
              single human action is the up-front authorization; nothing is signed per second or per page after that.
            </P>
          </Section>

          <Section id="money" eyebrow="Overview" title="How the money moves">
            <P>One approval reserves a cap; every tick draws against it; folded draws settle on-chain in batches.</P>
            <Code>{`approve once  ->  reserve cap against Gateway pool   (available -> reserved)
   every tick ->  Ember decides (continue | throttle | stop)
              ->  atomic draw against allowance       (off-chain accounting)
   threshold  ->  claim batch -> sign -> Gateway settle -> finalize
              ->  one ledger row + tx ref             (reserved -> spent)
 session end  ->  release the unused reservation       (reserved -> available)`}</Code>
            <P>
              Creators receive 85% and the platform 15%, split per settled batch. Each batch writes exactly one ledger row,
              so the history reconciles against the per-tick draws behind it.
            </P>
          </Section>

          <Section id="stack" eyebrow="Overview" title="The Circle + Arc stack">
            <DL
              rows={[
                ["Circle Gateway / Nanopayments", "One-time deposit, then batched settlement of folded draws on Arc testnet."],
                ["Circle developer-controlled Wallets", "An EOA buyer wallet signs EIP-3009 authorizations programmatically, no per-draw popup."],
                ["x402 batching", "The facilitator that verifies and settles the signed authorizations."],
                ["USDC on Arc testnet", "The unit of account, down to integer atomic amounts (6 decimals)."],
                ["viem", "On-chain Gateway balance + wallet USDC reads, and the deposit contract calls."],
                ["Arcscan (Blockscout)", "Verify-on-chain links for settled batches and wallet addresses."],
                ["DeepSeek", "The model behind Ember's in-loop budget-allocation decision."],
              ]}
            />
            <P className="mt-4">
              EIP-712 domain is <Mono>GatewayWalletBatched</Mono> v1, chainId <Mono>5042002</Mono> (Arc testnet), with the
              GatewayWallet as the verifying contract (not the USDC token). Amounts are decimal-string atomic USDC.
            </P>
          </Section>

          {/* ---------------- USING AVALON ---------------- */}
          <Section id="approve" eyebrow="Using Avalon" title="Approve a budget">
            <P>
              When you open a title, the approval gate asks for a per-session cap. Pick a preset ($0.06, $0.25, $1, or $5)
              or type a custom amount, then approve once. That cap is reserved against your Gateway balance and the meter
              draws against it. You are not asked again unless it runs out, in which case you can extend.
            </P>
          </Section>

          <Section id="meter" eyebrow="Using Avalon" title="Watch & read">
            <P>
              Video bills per second through socket heartbeats while the tab is focused and playing; pausing or leaving
              stops the meter. Books read as a continuous scroll and bill per page as you reach it; a page you already paid for is free on revisit. Every draw is
              an atomic deduction in integer USDC units, so concurrent draws can never overspend the cap.
            </P>
          </Section>

          <Section id="ember" eyebrow="Using Avalon" title="Ember, the budget agent">
            <P>
              Ember decides how fast to spend. Cheap deterministic guards run first every tick (exhausted, would-exceed,
              or above your rate cap). On a genuine judgment call, low remaining budget with more content queued, Ember
              consults its model to <Strong>continue</Strong>, <Strong>throttle</Strong> to stretch the budget, or{" "}
              <Strong>stop</Strong> and conserve.
            </P>
            <P>
              The decision is shown on screen with its source: <Mono>Ember</Mono> when the model reasoned it,{" "}
              <Mono>rule</Mono> for a deterministic guard, <Mono>model offline</Mono> for the safe fallback. Ember never
              blocks billing, a model timeout or error falls back to approve-within-policy and keeps drawing.
            </P>
          </Section>

          <Section id="funding" eyebrow="Using Avalon" title="Funding on Arc">
            <P>
              In circle mode there is no local balance to top up. The Top up page shows the buyer wallet{"'"}s USDC balance
              and its address, deposits test USDC into Gateway from the browser (approve, then deposit), and reflects the
              new on-chain balance. To add funds, send Arc testnet USDC to the shown address, then deposit it into Gateway.
            </P>
          </Section>

          <Section id="verify" eyebrow="Using Avalon" title="Dashboard & verify on-chain">
            <P>
              The Dashboard shows your settled spend, sessions, and creator payouts. The Transactions page lists every
              settled batch with its Gateway ref and the signed payer to recipient authorization behind it.
            </P>
            <Callout>
              Gateway settles asynchronously: it folds many signed authorizations into periodic on-chain batches
              (<Mono>submitBatch</Mono> on the GatewayWallet contract), so the ref returned at settle time is a Circle
              batch id, not an EVM hash. Individual transfers inside a batch are not separately visible on the explorer
              by design. What IS publicly verifiable on Arcscan: the GatewayWallet{"'"}s live batching activity, and the
              buyer wallet{"'"}s deposits into Gateway. Avalon only renders a <Mono>/tx/</Mono> explorer link when a ref
              is a real <Mono>0x</Mono> hash, and labels batch refs honestly otherwise.
            </Callout>
          </Section>

        </article>
      </div>
    </AppShell>
  );
}

/* ---------- doc primitives ---------- */

function Section({ id, eyebrow, title, children }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-white/[0.06] py-10 first-of-type:border-t-0 first-of-type:pt-0">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-brand/80">{eyebrow}</span>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function P({ children, className = "" }) {
  return <p className={`text-[15px] leading-relaxed text-zinc-400 ${className}`}>{children}</p>;
}

function Strong({ children }) {
  return <strong className="font-semibold text-zinc-200">{children}</strong>;
}

function Mono({ children }) {
  return <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12.5px] text-zinc-200">{children}</code>;
}

function Code({ children }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-white/10 bg-ink-950/70 p-4 font-mono text-[12.5px] leading-relaxed text-zinc-300">
      {children}
    </pre>
  );
}

function Callout({ children }) {
  return (
    <div className="rounded-xl border border-white/10 border-l-2 border-l-brand/60 bg-brand/[0.04] p-4 text-[13.5px] leading-relaxed text-zinc-400">
      {children}
    </div>
  );
}

function DL({ rows }) {
  return (
    <dl className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/10">
      {rows.map(([term, def]) => (
        <div key={term} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] sm:gap-4">
          <dt className="font-mono text-[12.5px] text-zinc-200">{term}</dt>
          <dd className="text-[13.5px] leading-relaxed text-zinc-400">{def}</dd>
        </div>
      ))}
    </dl>
  );
}
