import type { Business } from "./types";
// RFC-style quoted CSV cells, including commas and newlines in quoted names.
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("The CSV contains an unclosed quote.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function importProspects(text: string): Business[] {
  if (text.length > 50000) throw new Error("Use a CSV smaller than 50 KB.");
  const rows = csvRows(text.replace(/^\uFEFF/, ""));
  const header = rows[0]?.map((x) => x.toLowerCase()) || [];
  const urlIndex = header.findIndex((x) =>
    ["website", "url", "website url"].includes(x),
  );
  const nameIndex = header.findIndex((x) =>
    ["name", "business", "business name"].includes(x),
  );
  if (urlIndex >= 0) rows.shift();
  const seen = new Set<string>(),
    result: Business[] = [];
  for (const [i, row] of rows.entries()) {
    const raw = (
      urlIndex >= 0 ? row[urlIndex] : row.length > 1 ? row[1] : row[0]
    )?.trim();
    if (!raw) throw new Error(`Row ${i + 1}: a website is required.`);
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      throw new Error(`Row ${i + 1}: enter a valid website.`);
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      !url.hostname.includes(".")
    )
      throw new Error(`Row ${i + 1}: enter a public HTTP or HTTPS website.`);
    url.hash = "";
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const name =
      (nameIndex >= 0
        ? row[nameIndex]
        : urlIndex < 0 && row.length > 1
          ? row[0]
          : "") || url.hostname.replace(/^www\./, "");
    result.push({ name: name.slice(0, 180), website: url.href });
  }
  if (!result.length) throw new Error("Add at least one website.");
  if (result.length > 5)
    throw new Error("Import up to 5 unique websites per batch.");
  return result;
}
