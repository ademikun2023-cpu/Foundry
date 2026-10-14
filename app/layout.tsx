import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Foundry — Local lead intelligence",
    template: "%s · Foundry",
  },
  description:
    "Find local businesses with measurable digital-presence gaps. Evidence-based audits, transparent scores, and outreach drafts for agencies.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
