export type Stage = "New lead" | "Contacted" | "Interested" | "Closed";
export const STAGES: Stage[] = [
  "New lead",
  "Contacted",
  "Interested",
  "Closed",
];
export type Plan = "free" | "starter" | "growth" | "agency";
export type Business = {
  placeId?: string;
  name: string;
  website: string | null;
  address?: string;
  rating?: number | null;
  reviewCount?: number | null;
  reviewBenchmark?: number | null;
  mapsUrl?: string;
  attribution?: string[];
  sourceToken?: string;
};
export type Metrics = {
  performance: number | null;
  lcpMs: number | null;
  https: boolean | null;
  mobileViewport: boolean | null;
  booking: "detected" | "not_detected" | "unknown";
  bookingUrl: string | null;
  socialLinks: string[];
  reviewCount: number | null;
  reviewBenchmark: number | null;
};
export type ScorePart = {
  key: string;
  label: string;
  weight: number;
  opportunity: number | null;
  detail: string;
};
export type Scoring = {
  score: number | null;
  coverage: number;
  parts: ScorePart[];
};
export type Finding = {
  title: string;
  evidence: string;
  action: string;
  severity: "opportunity" | "good" | "unknown";
  source: string;
};
export type Audit = {
  id: string;
  business: Business;
  createdAt: string;
  stage: Stage;
  notes: string;
  metrics: Metrics;
  scoring: Scoring;
  findings: Finding[];
  warnings: string[];
  outreach?: Outreach;
  demo?: boolean;
  followUpDate?: string | null;
};
export type Outreach = {
  subject: string;
  email: string;
  followUp: string;
  source: "template" | "ai";
  dm?: string;
  service?: string;
  tone?: "friendly" | "direct";
};
export type AppConfig = {
  auth: boolean;
  search: boolean;
  audits: boolean;
  ai: boolean;
  billing: boolean;
};
export type Account = {
  plan: Plan;
  usage: { action: string; used: number; allowance: number }[];
  subscriptionStatus: string | null;
  billingInterval?: "monthly" | "yearly" | null;
  renewalStatus?: string | null;
  paidUntil?: string | null;
  hasSubscription?: boolean;
};

export type AgencyProfile = {
  name: string;
  logo: string;
  service: string;
  tone: "friendly" | "direct";
};
export const defaultProfile: AgencyProfile = {
  name: "Your agency",
  logo: "",
  service: "Website improvements",
  tone: "friendly",
};
export type AuditJob = {
  id: string;
  business: Business;
  status: "queued" | "running" | "completed" | "failed";
  error: string | null;
  audit_id: string | null;
  created_at: string;
  started_at: string | null;
  attempts: number;
};
export type AuditChanges = {
  stage?: Stage;
  notes?: string;
  followUpDate?: string | null;
  outreach?: Outreach;
};
