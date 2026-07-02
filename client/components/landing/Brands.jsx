import { Boxes, CircleDollarSign, CircleDot, Hexagon, Layers, Sparkles, Code2 } from "lucide-react";

// The real Circle + Arc stack, presented as an infrastructure strip (the names
// are the wordmarks). Icons are consistent geometric markers, one family.
const STACK = [
  { name: "Circle Gateway", Icon: CircleDot },
  { name: "Arc testnet", Icon: Hexagon },
  { name: "USDC", Icon: CircleDollarSign },
  { name: "x402 batching", Icon: Layers },
  { name: "EIP-3009", Icon: Code2 },
  { name: "DeepSeek", Icon: Sparkles },
  { name: "viem", Icon: Boxes },
];

function Item({ name, Icon }) {
  return (
    <span className="flex flex-none items-center gap-2.5 px-7 text-zinc-400">
      <Icon size={16} className="text-brand/70" />
      <span className="text-sm font-medium tracking-tight">{name}</span>
    </span>
  );
}

export function Brands() {
  const row = [...STACK, ...STACK];
  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)]">
      <div className="av-marquee flex w-max items-center py-1">
        {row.map((s, idx) => (
          <Item key={`${s.name}-${idx}`} {...s} />
        ))}
      </div>
    </div>
  );
}
