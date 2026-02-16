/**
 * Lightweight HTTPQL filter evaluator for crawler link filtering.
 * Supports common req.* predicates so only URLs matching the query are crawled.
 * See https://developer.caido.io/guides/filters and docs.caido.io for HTTPQL syntax.
 */

type RequestLike = {
  host: string;
  path: string;
  url: string;
  method: string;
};

function parseQuotedValue(s: string): string {
  const match = s.match(/^"(.*)"$/s);
  const inner = match?.[1];
  if (inner !== undefined) {
    return inner.replace(/\\"/g, '"');
  }
  return s;
}

function parseClause(
  clause: string,
): { ns: string; field: string; op: string; value: string } | undefined {
  const trimmed = clause.trim();
  const match = trimmed.match(
    /^(req|resp)\.(host|path|url|method)\.(eq|ne|cont|ncont|regex|nregex|like|nlike)\s*:\s*("(?:[^"\\]|\\.)*"|[^\s]+)/i,
  );
  if (match === null) return undefined;
  const ns = match[1];
  const field = match[2];
  const op = match[3];
  const rawValue = match[4];
  if (
    ns === undefined ||
    field === undefined ||
    op === undefined ||
    rawValue === undefined
  ) {
    return undefined;
  }
  const value = parseQuotedValue(rawValue.trim());
  return { ns, field, op, value };
}

function evaluateClause(
  req: RequestLike,
  ns: string,
  field: string,
  op: string,
  value: string,
): boolean {
  if (ns === "resp") return true;

  const raw =
    field === "host"
      ? req.host
      : field === "path"
        ? req.path
        : field === "url"
          ? req.url
          : field === "method"
            ? req.method
            : "";

  switch (op.toLowerCase()) {
    case "eq":
      return raw === value;
    case "ne":
      return raw !== value;
    case "cont":
      return raw.includes(value);
    case "ncont":
      return !raw.includes(value);
    case "regex": {
      try {
        return new RegExp(value).test(raw);
      } catch {
        return false;
      }
    }
    case "nregex": {
      try {
        return !new RegExp(value).test(raw);
      } catch {
        return true;
      }
    }
    case "like": {
      const pattern = value
        .replace(/\./g, "\\.")
        .replace(/%/g, ".*")
        .replace(/_/g, ".");
      try {
        return new RegExp(`^${pattern}$`).test(raw);
      } catch {
        return false;
      }
    }
    case "nlike": {
      const pattern = value
        .replace(/\./g, "\\.")
        .replace(/%/g, ".*")
        .replace(/_/g, ".");
      try {
        return !new RegExp(`^${pattern}$`).test(raw);
      } catch {
        return true;
      }
    }
    default:
      return true;
  }
}

export function urlToRequestLike(
  url: string,
  method: string = "GET",
): RequestLike | undefined {
  try {
    const u = new URL(url);
    const path = u.pathname + (u.search ?? "");
    return {
      host: u.hostname.toLowerCase(),
      path,
      url: url.trim(),
      method: method.toUpperCase(),
    };
  } catch {
    return undefined;
  }
}

/**
 * Returns true if the given URL (and optional method) matches the HTTPQL query.
 * Only req.* predicates are evaluated; resp.* is treated as true.
 * Empty or whitespace query returns true (no filtering).
 */
export function matchesHttpqlFilter(
  url: string,
  query: string | undefined,
  method: string = "GET",
): boolean {
  if (query === undefined || query.trim() === "") return true;

  const req = urlToRequestLike(url, method);
  if (req === undefined) return false;

  const andParts = query.split(/\s+AND\s+/i);
  for (const part of andParts) {
    const clause = parseClause(part);
    if (clause === undefined) continue;
    const { ns, field, op, value } = clause;
    if (!evaluateClause(req, ns, field, op, value)) return false;
  }
  return true;
}
