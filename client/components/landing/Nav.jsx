"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { AvalonMark } from "../Logo";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#agent", label: "Ember" },
  { href: "#arc", label: "Built on Arc" },
  { href: "#creators", label: "Creators" },
  { href: "/docs", label: "Docs" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? "border-b border-white/10 bg-ink-950/80 backdrop-blur-md" : "border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-white">
          <AvalonMark size={24} />
          Avalon
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-zinc-400 transition-colors hover:text-white">
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/app"
            className="group inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-ink-950 transition-transform duration-150 hover:-translate-y-px active:translate-y-0"
          >
            Open the app
            <ArrowUpRight size={15} className="transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-zinc-300 md:hidden"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </nav>

      {/* mobile sheet */}
      {open ? (
        <div className="border-t border-white/10 bg-ink-950/95 px-5 py-4 backdrop-blur-md md:hidden">
          <div className="grid gap-1">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2.5 text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
              >
                {l.label}
              </a>
            ))}
            <Link
              href="/app"
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-ink-950"
            >
              Open the app <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
