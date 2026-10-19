/** Shared helpers for ColumnHead search (`f{column}`) and sort (`sort`/`dir`) query params. */

export type ColumnDir = "asc" | "desc";

export function includesText(value: string, query?: string | null) {
  const needle = (query || "").trim().toLowerCase();
  return !needle || value.toLowerCase().includes(needle);
}

export function readSort(sp: { sort?: string; dir?: string }, columns: string[], fallback: string) {
  const sort = columns.includes(sp.sort || "") ? (sp.sort as string) : fallback;
  const dir: ColumnDir = sp.dir === "desc" ? "desc" : "asc";
  return { sort, dir };
}

export function compareText(a: string, b: string, dir: ColumnDir, locale: string) {
  return a.localeCompare(b, locale) * (dir === "desc" ? -1 : 1);
}

export function compareNumber(a: number, b: number, dir: ColumnDir) {
  return (a - b) * (dir === "desc" ? -1 : 1);
}

/** Names of column filter + sort params to keep when a toolbar form submits. */
export function columnParamNames(columns: string[]) {
  return ["sort", "dir", ...columns.map((column) => `f${column}`)] as const;
}

/** Hidden inputs so a GET form does not drop column filters/sort. */
export function columnHiddenFields(sp: Record<string, string | undefined>, columns: string[]) {
  return columnParamNames(columns)
    .map((name) => {
      const value = sp[name];
      return value ? { name, value } : null;
    })
    .filter((item): item is { name: string; value: string } => Boolean(item));
}

/** Merge existing list query with column tools from searchParams. */
export function withColumnParams(base: string, sp: Record<string, string | undefined>, columns: string[]) {
  const params = new URLSearchParams(base.replace(/^\?/, ""));
  for (const name of columnParamNames(columns)) {
    const value = sp[name];
    if (value) params.set(name, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
