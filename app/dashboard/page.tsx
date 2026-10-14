import { Suspense } from "react";
import Workspace from "@/components/workspace";
export const metadata = { title: "Workspace" };
export default function Dashboard() {
  return (
    <Suspense
      fallback={<main className="loading-page">Opening your workspace…</main>}
    >
      <Workspace />
    </Suspense>
  );
}
