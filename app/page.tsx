import "./landing.css";
import { landingHtml } from "./landing-html";
export default function Home() {
  return (
    <div
      className="landing-page"
      dangerouslySetInnerHTML={{ __html: landingHtml }}
    />
  );
}
