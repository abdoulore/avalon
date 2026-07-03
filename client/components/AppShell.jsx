"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, BookOpen, Clapperboard, CreditCard, LogOut, Menu, Receipt, Sparkles, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { usePaymentMode } from "../hooks/usePaymentMode";
import { AvalonMark } from "./Logo";
import { WakeBanner } from "./WakeBanner";

const LINKS = [
  { href: "/discover", label: "Discover", Icon: Sparkles },
  { href: "/app", label: "Watch & Read", Icon: Clapperboard },
  { href: "/dashboard", label: "Dashboard", Icon: BarChart3 },
  { href: "/transactions", label: "Transactions", Icon: Receipt },
  { href: "/top-up", label: "Top up", Icon: CreditCard },
  { href: "/creator", label: "Creator", Icon: Upload },
  { href: "/docs", label: "Docs", Icon: BookOpen },
];

export function AppShell({ children, requireAuth = true }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const { circle, network, loaded } = usePaymentMode();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (requireAuth && !loading && !user) {
      router.replace("/login");
    }
  }, [requireAuth, loading, user, router]);

  // Don't flash protected content (or fire its API calls) before the redirect.
  if (requireAuth && !user) {
    return (
      <div className="av grid min-h-[100dvh] place-items-center bg-ink-950 font-sans text-sm text-zinc-500 antialiased">
        {loading ? "Checking your session…" : "Redirecting to sign in…"}
      </div>
    );
  }

  return (
    <div className="av min-h-[100dvh] bg-ink-950 font-sans text-zinc-200 antialiased">
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
          scrolled || open ? "border-b border-white/10 bg-ink-950/85 backdrop-blur-md" : "border-b border-transparent"
        }`}
      >
        <nav className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="flex flex-none items-center gap-2 text-[15px] font-semibold tracking-tight text-white">
            <AvalonMark size={24} />
            Avalon
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {LINKS.map(({ href, label, Icon }) => {
              const active = pathname === href || (href === "/app" && pathname === "/app");
              return (
                <Link
                  key={href}
                  href={href}
                  className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm transition-colors ${
                    active ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon size={15} className={active ? "text-brand" : ""} /> {label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            {loaded ? (
              <span
                title={circle ? "Settling real test USDC on Arc testnet" : "Local mock economy, no chain"}
                className={`hidden items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium sm:inline-flex ${
                  circle ? "border-brand/40 bg-brand/10 text-brand" : "border-white/10 bg-white/5 text-zinc-400"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${circle ? "bg-brand av-ping" : "bg-zinc-500"}`} />
                {circle ? `Arc testnet · ${network}` : "Mock mode"}
              </span>
            ) : null}
            {user ? (
              <button
                type="button"
                onClick={() => {
                  signOut();
                  router.replace("/login");
                }}
                title={`Signed in as ${user.name} — sign out`}
                className="hidden items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-[12px] text-zinc-400 transition-colors hover:border-white/25 hover:text-white md:inline-flex"
              >
                <span className="max-w-[12ch] truncate">{user.name}</span>
                <LogOut size={13} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-zinc-300 md:hidden"
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </nav>

        {open ? (
          <div className="border-t border-white/10 bg-ink-950/95 px-5 py-3 backdrop-blur-md md:hidden">
            <div className="grid gap-1">
              {LINKS.map(({ href, label, Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`inline-flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm ${
                      active ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon size={16} className={active ? "text-brand" : ""} /> {label}
                  </Link>
                );
              })}
              {user ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    signOut();
                    router.replace("/login");
                  }}
                  className="inline-flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
                >
                  <LogOut size={16} /> Sign out ({user.name})
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-[1200px] px-5 pb-24 pt-24 sm:px-8">{children}</main>
      <WakeBanner />
    </div>
  );
}
