import "./landing.css";
import { landingHtml } from "./landing-html";
import LandingPricing from "@/components/pricing";
export default function Home() {
  const [before, after] = landingHtml.split("<!-- CTA -->");
  return (
    <div className="landing-page">
      <div dangerouslySetInnerHTML={{ __html: before }} />
      <LandingPricing />
      <div dangerouslySetInnerHTML={{ __html: after }} />
    </div>
  );
}
