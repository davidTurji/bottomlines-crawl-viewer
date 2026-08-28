const BASE = (import.meta.env.VITE_API_BASE as string) ?? "/api";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ApiError(res.status, detail || `${method} ${path} → ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  auth: (token: string, idToken: string) =>
    req<{ ok: boolean; email: string; customer_id: number }>(
      "POST",
      `/v1/viewer/auth`,
      { token, id_token: idToken },
    ),
  summary: (token: string) => req<Summary>("GET", `/v1/viewer/${token}/summary`),
  developerEvents: (
    token: string,
    event: "added" | "removed" | "changed",
    page = 1,
  ) =>
    req<DeveloperEventsPage>(
      "GET",
      `/v1/viewer/${token}/developer-events?event=${event}&page=${page}&page_size=50`,
    ),
  lineEvents: (
    token: string,
    filters: {
      event?: "added" | "removed" | "cert_changed";
      ssp_domain?: string;
      developer_id?: number;
      matched_seat_only?: boolean;
      page?: number;
    } = {},
  ) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    }
    return req<LineEventsPage>(
      "GET",
      `/v1/viewer/${token}/line-events?${q.toString()}`,
    );
  },
  matchedDevelopers: (token: string, page = 1) =>
    req<MatchedDevelopersPage>(
      "GET",
      `/v1/viewer/${token}/matched-developers?page=${page}&page_size=100`,
    ),
  chat: async function* (
    token: string,
    prompt: string,
  ): AsyncGenerator<ChatFrame> {
    const res = await fetch(`${BASE}/v1/viewer/${token}/chat`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok || !res.body) {
      throw new ApiError(res.status, `chat stream failed: ${res.status}`);
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const raw of parts) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const chunk = line.slice(5).trim();
        if (!chunk) continue;
        try {
          yield JSON.parse(chunk) as ChatFrame;
        } catch {
          /* skip */
        }
      }
    }
  },
};

// ---- types ----

export type Summary = {
  crawl_id: number;
  source: string;
  status: string;
  queued_at: string | null;
  finished_at: string | null;
  started_at: string | null;
  previous_job_id: number | null;
  counters: {
    developer_count: number;
    fetched_count: number;
    error_count: number;
    not_found_count: number;
    unreadable_count: number;
    developers_with_lines: number;
    matched: { lines: number; developers: number; apps: number };
  };
  hero_diff: {
    line_totals: { added: number; removed: number; cert_changed: number };
    line_totals_matched_seat: {
      added: number;
      removed: number;
      cert_changed: number;
    };
    developer_totals: { added: number; removed: number; changed: number };
    top_ssps: Record<string, { ssp_domain: string; count: number }[]>;
  };
};

export type DeveloperEvent = {
  developer_id: number;
  developer_name: string | null;
  developer_domain: string | null;
  developer_platform: string | null;
  matched_lines_prev: number;
  matched_lines_current: number;
  lines_added: number;
  lines_removed: number;
  lines_cert_changed: number;
  top_ssps: { ssp_domain: string; count: number }[];
  occurred_at: string | null;
};

export type DeveloperEventsPage = {
  event: string;
  page: number;
  page_size: number;
  total: number;
  rows: DeveloperEvent[];
};

export type LineEvent = {
  developer_id: number;
  developer_name: string | null;
  developer_domain: string | null;
  file_kind: string;
  ssp_domain: string;
  publisher_id: string;
  relationship: string;
  event: string;
  old_cert_id: string | null;
  new_cert_id: string | null;
  matched_seat: boolean;
  occurred_at: string | null;
};

export type LineEventsPage = {
  page: number;
  page_size: number;
  total: number;
  rows: LineEvent[];
};

export type MatchedDeveloper = {
  developer_id: number;
  name: string | null;
  domain: string | null;
  platform: string | null;
  line_count: number;
};

export type MatchedDevelopersPage = {
  page: number;
  page_size: number;
  total: number;
  rows: MatchedDeveloper[];
};

export type ChatFrame =
  | { type: "text"; delta: string }
  | { type: "tool_call"; name: string; args: unknown; result_preview: unknown }
  | { type: "done" }
  | { type: "error"; message: string };
