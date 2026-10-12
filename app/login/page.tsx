import { Suspense } from "react";
import Login from "@/components/login";
export const metadata = { title: "Sign in" };
export default function Page() {
  return (
    <Suspense fallback={<main className="loading-page">Loading…</main>}>
      <Login />
    </Suspense>
  );
}
