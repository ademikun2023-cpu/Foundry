import { z } from "zod";
import {
  ApiError,
  authenticate,
  json,
  quota,
  readBody,
  route,
} from "@/lib/server";
import { median } from "@/lib/scoring";
import type { Business } from "@/lib/types";
import { signBusiness } from "@/lib/search-proof";
export const maxDuration = 30;
export async function POST(req: Request) {
  return route(req, async () => {
    const { db, user } = await authenticate(req);
    const { niche, city } = await readBody(
      req,
      z.object({
        niche: z.string().trim().min(2).max(100),
        city: z.string().trim().min(2).max(150),
      }),
    );
    if (!process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_PLACES_ENABLED !== "true")
      throw new ApiError(
        503,
        "Business discovery is temporarily paused. You can still audit a website directly.",
      );
    await quota(db, "search");
    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri,places.attributions",
        },
        body: JSON.stringify({
          textQuery: `${niche} in ${city}`,
          pageSize: 10,
        }),
        signal: AbortSignal.timeout(20000),
        cache: "no-store",
      },
    );
    if (!response.ok)
      throw new ApiError(
        502,
        "Google Places could not complete the search. Check API access, billing and quota.",
      );
    const data = await response.json();
    const businesses: Business[] = (data.places || []).map(
      (p: {
        id: string;
        displayName?: { text: string };
        websiteUri?: string;
        formattedAddress?: string;
        rating?: number;
        userRatingCount?: number;
        googleMapsUri?: string;
        attributions?: { provider?: string }[];
      }) => ({
        placeId: p.id,
        name: p.displayName?.text || "Unnamed business",
        website: p.websiteUri || null,
        address: p.formattedAddress,
        rating: p.rating ?? null,
        reviewCount: p.userRatingCount ?? null,
        mapsUrl: p.googleMapsUri,
        attribution: (p.attributions || [])
          .map((a) => a.provider || "")
          .filter(Boolean),
      }),
    );
    businesses.forEach((b, i) => {
      b.reviewBenchmark = median(
        businesses
          .filter((_, j) => i !== j)
          .flatMap((p) =>
            p.reviewCount === null || p.reviewCount === undefined
              ? []
              : [p.reviewCount],
          ),
      );
    });
    businesses.forEach((b) => {
      b.sourceToken = signBusiness(b, user.id);
    });
    return json({
      businesses,
      attribution: "Google Maps",
      searchedAt: new Date().toISOString(),
    });
  });
}
