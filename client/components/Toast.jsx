"use client";

export function Toast({ message }) {
  if (!message) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[60] max-w-sm rounded-xl border border-brand/30 bg-ink-850/95 px-4 py-3 text-sm text-zinc-200 shadow-2xl shadow-black/50 backdrop-blur">
      {message}
    </div>
  );
}
