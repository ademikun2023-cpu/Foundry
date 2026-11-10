import { z } from "zod";
export const profileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  logo: z
    .string()
    .max(180000)
    .refine(
      (v) =>
        !v || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v),
      "Upload a PNG, JPEG or WebP logo.",
    ),
  service: z.string().trim().min(2).max(160),
  tone: z.enum(["friendly", "direct"]),
});
export const outreachSchema = z.object({
  subject: z.string().max(200),
  email: z.string().max(6000),
  followUp: z.string().max(4000),
  dm: z.string().max(2000).optional(),
  source: z.enum(["template", "ai"]),
  service: z.string().max(160).optional(),
  tone: z.enum(["friendly", "direct"]).optional(),
});
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function isFollowUpDue(
  a: { followUpDate?: string | null; stage: string },
  today = localDate(),
) {
  return Boolean(
    a.followUpDate && a.followUpDate <= today && a.stage !== "Closed",
  );
}
