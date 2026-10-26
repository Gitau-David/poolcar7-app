export type Cell = string | number | null | undefined | { raw: string };

/** Forces Excel to keep a phone number as text (keeps the leading 0 and any +). */
export function phone(value: string | null | undefined): Cell {
  const clean = (value ?? "").replace(/[^0-9+()\- ]/g, "").trim();
  return clean ? { raw: `"=""${clean}"""` } : "";
}

/** Local date (YYYY-MM-DD) and time (HH:MM:SS) from an ISO timestamp. */
export function splitStamp(iso: string | null | undefined): [string, string] {
  if (!iso) return ["", ""];
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return ["", ""];
  const p = (n: number) => String(n).padStart(2, "0");
  return [
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
  ];
}

function cell(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return value.raw;
  let s = String(value)
    .replace(/\r?\n|\r/g, " ")
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/\u2192/g, "->")
    .replace(/\u00b7/g, "|")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .trim();
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`;
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, header: string[], rows: Cell[][]) {
  const lines = [header, ...rows].map((r) => r.map(cell).join(","));
  const csv = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
