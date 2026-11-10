import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import ipaddr from "ipaddr.js";

export function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
export function parsePublicUrl(input: string): URL {
  const url = new URL(input);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new Error(
      "Only public HTTP/HTTPS websites on standard ports can be audited.",
    );
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    (!host.includes(".") && !host.includes(":")) ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)
  )
    throw new Error("This is not a public website.");
  if (ipaddr.isValid(host) && !isPublicAddress(host))
    throw new Error("Private and reserved network addresses are blocked.");
  return url;
}

// DNS is resolved and checked once per hop. The HTTP connection is pinned to the
// checked address, preventing DNS rebinding. Every redirect is checked again.
export async function fetchPublicHtml(
  input: string,
  redirects = 0,
  deadline = Date.now() + 14000,
): Promise<{ html: string; url: string }> {
  if (redirects > 4 || Date.now() >= deadline)
    throw new Error("Website request timed out or redirected too many times.");
  const url = parsePublicUrl(input);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(host, { all: true }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("DNS lookup timed out.")),
        Math.max(1, deadline - Date.now()),
      );
    }),
  ]).finally(() => clearTimeout(timer));
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new Error("Website resolves to a private or reserved network.");
  const result = await new Promise<{ html?: string; redirect?: string }>(
    (resolve, reject) => {
      const transport = url.protocol === "https:" ? https : http;
      const req = transport.get(
        url,
        {
          headers: {
            "User-Agent": "FoundryAudit/1.0",
            Accept: "text/html",
            "Accept-Encoding": "identity",
          },
          lookup: ((
            _host: string,
            _options: unknown,
            cb: (err: Error | null, address: string, family: number) => void,
          ) => cb(null, addresses[0].address, addresses[0].family)) as never,
          family: addresses[0].family,
        },
        (res) => {
          if (
            res.statusCode &&
            [301, 302, 303, 307, 308].includes(res.statusCode) &&
            res.headers.location
          ) {
            res.destroy();
            resolve({ redirect: new URL(res.headers.location, url).href });
            return;
          }
          if (!res.statusCode || res.statusCode >= 400) {
            res.destroy();
            reject(
              new Error("The website did not return a successful response."),
            );
            return;
          }
          if (!res.headers["content-type"]?.includes("text/html")) {
            res.destroy();
            reject(new Error("The website did not return an HTML page."));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 1_500_000)
              req.destroy(
                new Error("Homepage exceeded the inspection size limit."),
              );
            else chunks.push(chunk);
          });
          res.on("end", () =>
            resolve({ html: Buffer.concat(chunks).toString("utf8") }),
          );
          res.on("error", reject);
        },
      );
      const timeout = setTimeout(
        () => req.destroy(new Error("Website inspection timed out.")),
        Math.max(1, deadline - Date.now()),
      );
      req.on("close", () => clearTimeout(timeout));
      req.on("error", reject);
    },
  );
  if (result.redirect)
    return fetchPublicHtml(result.redirect, redirects + 1, deadline);
  return { html: result.html!, url: url.href };
}
