import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Coins,
  Cpu,
  Fingerprint,
  Gauge,
  Github,
  Layers,
  PenLine,
  Receipt,
} from "lucide-react";
import { AvalonMark } from "../components/Logo";
import { Nav } from "../components/landing/Nav";
import { Reveal } from "../components/landing/Reveal";
import { LiveMeter } from "../components/landing/LiveMeter";
import { AgentDemo } from "../components/landing/AgentDemo";
import { Brands } from "../components/landing/Brands";

const REPO_URL = "https://github.com/abdoulore/avalon";

const STEPS = [
  { n: "01", Icon: PenLine, title: "Approve once", body: "Authorize a per-session cap. A single signature reserves it against your Circle Gateway balance." },
  { n: "02", Icon: Gauge, title: "Stream and meter", body: "Video bills per second, books per page. Each draw is an atomic deduction, so concurrency can never overspend." },
  { n: "03", Icon: Cpu, title: "Ember paces it", body: "Guards run first; judgment calls go to Ember: continue, throttle, or stop. The decision is shown on screen." },
  { n: "04", Icon: Layers, title: "Settle in batches", body: "Draws fold into one on-chain Gateway settlement. One ledger row, a real tx ref, 85% to the creator." },
];

export default function LandingPage() {
  return (
    <div className="av min-h-[100dvh] bg-ink-950 font-sans text-zinc-200 antialiased">
      <Nav />

      {/* ============================ HERO ============================ */}
      <section className="relative flex min-h-[100dvh] items-center overflow-hidden pt-16">
        <div aria-hidden className="av-grid pointer-events-none absolute inset-0" />
        <div aria-hidden className="av-glow pointer-events-none absolute right-[-10%] top-1/4 h-[520px] w-[520px]" />

        <div className="relative mx-auto grid w-full max-w-[1180px] items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-brand av-ping" />
              Usage-based media on Arc
            </span>

            <h1 className="mt-6 text-balance text-5xl font-semibold leading-[0.98] tracking-tighter text-white sm:text-6xl lg:text-[68px]">
              Watch by the <span className="text-brand">second</span>.
              <br />
              Pay by the <span className="text-brand">moment</span>.
            </h1>

            <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-zinc-400">
              Approve a budget once. Ember, an AI agent, paces the spend in real time. Every second settles in USDC on Arc.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/app"
                className="group inline-flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-ink-950 shadow-[0_0_30px_-6px_rgba(52,211,153,0.6)] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
              >
                Open the app
                <ArrowUpRight size={16} className="transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              <a
                href="#how"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:border-white/30 hover:text-white"
              >
                How it works
              </a>
            </div>
          </div>

          <Reveal y={28} amount={0.2}>
            <LiveMeter />
          </Reveal>
        </div>
      </section>

      {/* ===================== PROOF / STACK STRIP ==================== */}
      <section className="border-y border-white/[0.06] bg-ink-900/40 py-7">
        <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
          <p className="mb-4 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-600">
            Built on the Circle &amp; Arc stack
          </p>
          <Brands />
        </div>
      </section>

      {/* ========================= HOW IT WORKS ====================== */}
      <section id="how" className="mx-auto max-w-[1180px] scroll-mt-24 px-5 py-24 sm:px-8 sm:py-28">
        <Reveal>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand">How it works</span>
          <h2 className="mt-3 max-w-[20ch] text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            One approval. Then the meter does the rest.
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-4">
          {STEPS.map((s, idx) => (
            <Reveal key={s.n} delay={idx * 0.08}>
              <div className="relative">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-full border border-white/15 bg-ink-850 font-mono text-sm text-brand">
                    {s.n}
                  </span>
                  {idx < STEPS.length - 1 ? <span className="hidden h-px flex-1 bg-gradient-to-r from-white/15 to-transparent md:block" /> : null}
                </div>
                <s.Icon size={20} className="mt-6 text-zinc-500" />
                <h3 className="mt-3 text-lg font-semibold text-white">{s.title}</h3>
                <p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-zinc-400">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* =========================== EMBER (THE AGENT) ======================= */}
      <section id="agent" className="scroll-mt-24 border-t border-white/[0.06] bg-ink-900/30 py-24 sm:py-28">
        <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
          <Reveal>
            <h2 className="max-w-[24ch] text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Ember decides how fast to spend, not a threshold.
            </h2>
            <p className="mt-4 max-w-[68ch] text-lg leading-relaxed text-zinc-400">
              Given the remaining budget, how much of the current item is consumed, and what is queued, Ember makes a
              real allocation call. The UI separates a live model decision from a deterministic guard from a safe
              fallback, so you can see exactly when the AI is in control.
            </p>
          </Reveal>

          <Reveal delay={0.1} className="mt-12">
            <AgentDemo />
          </Reveal>
        </div>
      </section>

      {/* ========================= BUILT ON ARC ====================== */}
      <section id="arc" className="mx-auto max-w-[1180px] scroll-mt-24 px-5 py-24 sm:px-8 sm:py-28">
        <Reveal>
          <h2 className="max-w-[22ch] text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Real test USDC, settling on Arc testnet.
          </h2>
          <p className="mt-4 max-w-[60ch] text-lg leading-relaxed text-zinc-400">
            Not a mock. Sessions produce settlement rows with a real Gateway tx ref, carrying the signed authorization as
            payment proof.
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* big stat */}
          <Reveal className="md:col-span-1">
            <div className="flex h-full flex-col justify-between rounded-2xl border border-brand/20 bg-brand/[0.05] p-6">
              <CheckCircle2 size={22} className="text-brand" />
              <div className="mt-10">
                <div className="font-mono text-5xl font-medium tabular-nums tracking-tight text-white">27<span className="text-zinc-500">/27</span></div>
                <div className="mt-2 text-sm text-zinc-400">invariants tested. Cap holds under concurrent draws; settlement reconciles; retries settle exactly once.</div>
              </div>
            </div>
          </Reveal>

          {/* wide settlement tile with faux ledger */}
          <Reveal delay={0.06} className="md:col-span-2">
            <div className="h-full rounded-2xl border border-white/10 bg-ink-850/60 p-6">
              <div className="flex items-center gap-2.5">
                <Receipt size={20} className="text-zinc-400" />
                <h3 className="text-lg font-semibold text-white">One ledger row per batch</h3>
              </div>
              <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-zinc-400">
                Accrued draws fold into a single EIP-3009 settlement, signed by a Circle developer-controlled wallet.
              </p>
              <div className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-ink-950/70 font-mono text-[12px]">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 text-zinc-500">
                  <span>settlement_batch</span>
                  <span className="rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-brand">settled</span>
                </div>
                <div className="grid gap-1.5 px-4 py-3 text-zinc-400">
                  <div className="flex justify-between"><span className="text-zinc-600">txRef</span><span className="tabular-nums text-zinc-300">gw_0d6b7b71…</span></div>
                  <div className="flex justify-between"><span className="text-zinc-600">amount</span><span className="tabular-nums text-zinc-300">0.0571 USDC</span></div>
                  <div className="flex justify-between"><span className="text-zinc-600">split</span><span className="tabular-nums text-zinc-300">85% creator · 15% platform</span></div>
                </div>
              </div>
            </div>
          </Reveal>

          {/* signed, not popped */}
          <Reveal delay={0.04}>
            <div className="h-full rounded-2xl border border-white/10 bg-ink-850/60 p-6">
              <Fingerprint size={20} className="text-zinc-400" />
              <h3 className="mt-4 text-lg font-semibold text-white">Signed, not popped</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                The buyer wallet signs EIP-3009 authorizations programmatically. No wallet prompt per metered tick.
              </p>
            </div>
          </Reveal>

          {/* atomic */}
          <Reveal delay={0.08}>
            <div className="h-full rounded-2xl border border-white/10 bg-ink-850/60 p-6">
              <Coins size={20} className="text-zinc-400" />
              <h3 className="mt-4 text-lg font-semibold text-white">Atomic to sub-cent</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Amounts are integer atomic USDC units at 6 decimals, so a single watched second has an exact price.
              </p>
            </div>
          </Reveal>

          {/* EIP-712 domain code tile */}
          <Reveal delay={0.12}>
            <div className="h-full rounded-2xl border border-white/10 bg-ink-950/70 p-5">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-600">EIP-712 domain</div>
              <pre className="mt-3 overflow-x-auto font-mono text-[11.5px] leading-relaxed text-zinc-400">
{`name      GatewayWalletBatched
version   1
chainId   5042002
verifying 0x0077…0A19B9
type      TransferWith
          Authorization`}
              </pre>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ========================== CREATORS ========================= */}
      <section id="creators" className="scroll-mt-24 border-t border-white/[0.06] bg-ink-900/30 py-24 sm:py-28">
        <div className="mx-auto grid max-w-[1180px] items-center gap-14 px-5 sm:px-8 lg:grid-cols-2">
          <Reveal>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand">For creators</span>
            <h2 className="mt-3 max-w-[18ch] text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Paid for every second watched.
            </h2>
            <p className="mt-4 max-w-[52ch] text-lg leading-relaxed text-zinc-400">
              Monetize per moment instead of per subscription. Value accrues as people actually watch and read, then
              settles to your wallet in batches on-chain.
            </p>
            <ul className="mt-7 grid gap-3 text-sm text-zinc-300">
              {["Per-second video and per-page book payouts", "85% of every settled batch goes to the creator", "Real on-chain settlement, no invoices to chase"].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <CheckCircle2 size={17} className="mt-0.5 flex-none text-brand" />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="rounded-2xl border border-white/10 bg-ink-850/60 p-7">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">Revenue split</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">per batch</span>
              </div>
              <div className="mt-6 flex items-end justify-between">
                <div>
                  <div className="font-mono text-6xl font-medium tabular-nums tracking-tight text-brand">85%</div>
                  <div className="mt-1 text-sm text-zinc-400">to the creator</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-3xl font-medium tabular-nums tracking-tight text-zinc-400">15%</div>
                  <div className="mt-1 text-sm text-zinc-500">platform</div>
                </div>
              </div>
              <div className="mt-5 flex h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-l-full bg-brand" style={{ width: "85%" }} />
                <div className="h-full bg-white/15" style={{ width: "15%" }} />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ========================= FINAL CTA ========================= */}
      <section className="relative overflow-hidden px-5 py-28 sm:px-8 sm:py-36">
        <div aria-hidden className="av-glow pointer-events-none absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2" />
        <Reveal className="relative mx-auto max-w-[640px] text-center">
          <h2 className="text-balance text-4xl font-semibold tracking-tighter text-white sm:text-5xl">
            Approve once. Watch the meter move.
          </h2>
          <p className="mx-auto mt-5 max-w-[44ch] text-lg leading-relaxed text-zinc-400">
            Sample any title safely in mock mode, or flip to Arc testnet for real settlement.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/app"
              className="group inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3.5 text-sm font-semibold text-ink-950 shadow-[0_0_36px_-6px_rgba(52,211,153,0.65)] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
            >
              Open the app
              <ArrowUpRight size={16} className="transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3.5 text-sm font-semibold text-zinc-200 transition-colors hover:border-white/30 hover:text-white"
            >
              <Github size={16} /> View the source
            </a>
          </div>
        </Reveal>
      </section>

      {/* =========================== FOOTER ========================== */}
      <footer className="border-t border-white/[0.06] bg-ink-950">
        <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-8">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr]">
            <div>
              <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight text-white">
                <AvalonMark size={26} />
                Avalon
              </Link>
              <p className="mt-3 max-w-[40ch] text-sm leading-relaxed text-zinc-500">
                Usage-based media, billed by the moment in USDC on Arc.
              </p>
            </div>

            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-600">Product</div>
              <ul className="mt-4 grid gap-2.5 text-sm text-zinc-400">
                <li><Link href="/app" className="hover:text-white">Open the app</Link></li>
                <li><Link href="/dashboard" className="hover:text-white">Dashboard</Link></li>
                <li><Link href="/top-up" className="hover:text-white">Top up</Link></li>
                <li><Link href="/creator" className="hover:text-white">Creator</Link></li>
              </ul>
            </div>

            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-600">Resources</div>
              <ul className="mt-4 grid gap-2.5 text-sm text-zinc-400">
                <li><a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-white">GitHub <ArrowUpRight size={13} /></a></li>
                <li><a href="#how" className="hover:text-white">How it works</a></li>
                <li><a href="#agent" className="hover:text-white">Ember</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/[0.06] pt-6 text-xs text-zinc-600 sm:flex-row sm:items-center">
            <span>Built on Circle × Arc.</span>
            <span>© {new Date().getFullYear()} Avalon</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
