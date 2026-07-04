"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, Sparkles, UserPlus } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { AvalonMark } from "./Logo";
import { BTN, BTN_GHOST, Card, INPUT, Field } from "./ui";

// One screen serves /login and /signup; only the fields and endpoint differ.
export function AuthScreen({ mode }) {
  const signup = mode === "signup";
  const router = useRouter();
  const { acceptSession } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(""); // "" | "submit" | "demo"
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy("submit");
    setError("");
    try {
      const payload = await api(signup ? "/auth/signup" : "/auth/login", {
        method: "POST",
        body: JSON.stringify(signup ? { name, email, password } : { email, password }),
      });
      acceptSession(payload);
      router.replace("/app");
    } catch (err) {
      setError(err.message);
      setBusy("");
    }
  }

  async function tryDemo() {
    setBusy("demo");
    setError("");
    try {
      const payload = await api("/auth/demo", { method: "POST" });
      acceptSession(payload);
      router.replace("/app");
    } catch (err) {
      setError(err.message);
      setBusy("");
    }
  }

  return (
    <div className="av grid min-h-[100dvh] place-items-center bg-ink-950 px-5 py-10 font-sans text-zinc-200 antialiased">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-lg font-semibold tracking-tight text-white">
          <AvalonMark size={30} /> Avalon
        </Link>

        <Card className="p-6">
          <h1 className="text-xl font-semibold tracking-tight text-white">
            {signup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">
            {signup
              ? "Watch by the second, read by the page. Only the moments you use are charged."
              : "Sign in to pick up where you left off."}
          </p>

          <form onSubmit={submit} className="mt-5 grid gap-4">
            {signup ? (
              <Field label="Name">
                <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
              </Field>
            ) : null}
            <Field label="Email">
              <input className={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </Field>
            <Field label={signup ? "Password (8+ characters)" : "Password"}>
              <input
                className={INPUT}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={signup ? "new-password" : "current-password"}
                minLength={signup ? 8 : undefined}
                required
              />
            </Field>

            {error ? (
              <div className="rounded-xl border border-stop/40 bg-stop/10 px-3.5 py-2.5 text-sm text-zinc-200">{error}</div>
            ) : null}

            <button className={`${BTN} w-full py-3`} type="submit" disabled={Boolean(busy)}>
              {busy === "submit" ? (
                <Loader2 size={16} className="av-spin" />
              ) : signup ? (
                <UserPlus size={16} />
              ) : (
                <LogIn size={16} />
              )}
              {signup ? "Create account" : "Sign in"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-zinc-600">
            <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
          </div>

          <button className={`${BTN_GHOST} w-full py-3`} type="button" onClick={tryDemo} disabled={Boolean(busy)}>
            {busy === "demo" ? <Loader2 size={16} className="av-spin" /> : <Sparkles size={16} />} Try the demo
          </button>
          <p className="mt-2 text-center text-[11.5px] leading-relaxed text-zinc-600">
            One click, no account: a shared demo profile with test USDC.
          </p>
        </Card>

        <p className="mt-5 text-center text-sm text-zinc-500">
          {signup ? "Already have an account? " : "New to Avalon? "}
          <Link href={signup ? "/login" : "/signup"} className="text-brand underline-offset-4 hover:underline">
            {signup ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </div>
    </div>
  );
}
