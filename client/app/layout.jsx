import "./globals.css";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

export const metadata = {
  title: "Avalon · Watch by the second. Pay by the moment.",
  description:
    "Usage-based media billed by the moment in USDC on Arc. Approve a budget once; an AI agent manages the spend in real time; settlement batches on-chain.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
