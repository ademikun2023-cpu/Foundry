import { z } from "zod";
export const businessSchema = z.object({
  placeId: z.string().max(256).optional(),
  sourceToken: z.string().max(10000).optional(),
  name: z.string().trim().min(2).max(180),
  website: z
    .url()
    .max(2048)
    .refine((v) => /^https?:\/\//.test(v), "Use an HTTP or HTTPS website.")
    .nullable(),
  address: z.string().max(500).optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  reviewCount: z.number().int().min(0).max(10000000).nullable().optional(),
  reviewBenchmark: z.number().min(0).max(10000000).nullable().optional(),
  mapsUrl: z
    .url()
    .refine((v) => v.startsWith("https://"), "Use HTTPS.")
    .optional(),
  attribution: z.array(z.string().max(500)).max(10).optional(),
});
