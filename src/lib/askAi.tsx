import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";

import {
  api,
  ApiError,
  type AskAnswer,
  type AskFileCheck,
  type AskPage,
  type AskStatus,
  type AskTurn,
} from "./api";
import { useReportScope } from "./reportScope";
import { attachmentId } from "./askAttachment";
export { isPastedList } from "./askAttachment";

/**
 * ASK AI, THE STATE BEHIND THE PANEL.
 *
 * One provider per report, mounted by the Layout, so the header button and
 * the side pane read the same thing: whether the backend offers the panel
 * at all, how many questions are left on each page, and the conversation
 * for the page the reader is standing on.
 *
 * Every number here comes from the server. The browser never decides how
 * many questions remain or whether the budget is spent; it shows what
 * `/ask/status` and each `/ask` answer say, and a refusal from the server
 * is rendered as the server worded it. The transcript is the one thing kept
 * here, per page, in memory only. Closing the panel or changing pages keeps
 * the conversation; a reload, logout or new login starts fresh.
 */

export type AskMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** The server refused to answer (not in the report, off topic, a limit). */
  refused?: boolean;
  /** Still waiting for the server. */
  pending?: boolean;
  /** Just arrived: write it out progressively, once. Never persisted. */
  reveal?: boolean;
  /** Answered from the report itself: no quota used. */
  local?: boolean;
  /** This answer's share of the report's quota, in percent. */
  usedPct?: number;
  /** A question sent with a file: the file's name and rows, shown on the bubble. */
  file?: { name: string; rows: number };
  /** An answer about a file: which rows to offer as a download ("all",
   *  "carrying" or a status), and the file it was about. */
  download?: string;
  downloadFile?: string;
  downloadId?: string;
};

/**
 * The file attached to the conversation. Kept in this tab's memory only,
 * never in storage, and sent again with each question: the server reads it
 * per request and stores nothing.
 */
export type AskAttachment = {
  id?: string;
  name: string;
  size: number;
  /** The file's bytes, base64. Empty until read. */
  data: string;
  state: "reading" | "ready" | "error";
  /** The server's sentence when it would not read the file. */
  error?: string;
  check?: AskFileCheck;
  /** Shown once on the question it was first sent with. */
  sent?: boolean;
};

/** The download choices in words. The statuses are the server's labels
 *  (services/ask_files.STATUS_LABELS); a check's own counts win. */
export const DOWNLOAD_LABEL: Record<string, string> = {
  all: "All rows",
  carrying: "Rows that carry your line",
  carries: "Carries your line",
  partner: "Through a partner",
  lost: "Lost this week",
  inactive: "Inactive",
  not_this_line: "Not this seller ID",
  your_line: "One of your lines",
  not_your_line: "Not one of your lines",
  not_in_report: "Not in this report",
  cannot_match: "Cannot match this id",
  not_recognised: "Not recognised",
};

/** What the file picker accepts when the server has not said. */
export const DEFAULT_ACCEPT = ".csv,.tsv,.txt,.xlsx";
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

function readAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? "");
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export const ASK_PAGES: AskPage[] = ["overview", "discovery", "declarations", "sellers", "schain"];

/**
 * The AI usage policy on the main site. Linked from the empty panel (the
 * consent line) and from the line under the composer. Overridable at build
 * time so a local preview can point at a local copy of the site.
 */
export const AI_POLICY_URL =
  (import.meta.env.VITE_AI_POLICY_URL as string | undefined) || "https://bottomlines.ai/ai-policy";

export const PAGE_LABEL: Record<AskPage, string> = {
  overview: "Overview",
  discovery: "Discovery",
  declarations: "Declarations",
  sellers: "Sellers.json",
  schain: "Schain",
};

/** Which report page a path is, relative to the report's base path. The
 *  retired /changes and /discovered paths count as the pages they land on. */
export function pageOf(pathname: string, basePath: string): AskPage {
  let rest = pathname;
  if (basePath && rest.startsWith(basePath)) rest = rest.slice(basePath.length);
  const first = rest.replace(/^\/+/, "").split("/")[0] ?? "";
  if (first === "discovery" || first === "discovered") return "discovery";
  if (first === "declarations") return "declarations";
  if (first === "sellers") return "sellers";
  if (first === "schain") return "schain";
  return "overview";
}

type AskAiState = {
  /** The server offers the panel on this report. False hides the button. */
  available: boolean;
  status: AskStatus | null;
  open: boolean;
  setOpen: (next: boolean) => void;
  finishReveal: (id: string) => void;
  page: AskPage;
  messages: AskMessage[];
  draft: string;
  setDraft: (text: string) => void;
  pending: boolean;
  /** Percent of the report's AI quota left, or null when it is unknown. */
  allowanceLeft: number | null;
  budgetExhausted: boolean;
  send: (question: string) => void;
  clear: () => void;
  attachment: AskAttachment | null;
  /** Attach a file (picker, drop or paste): read here, checked by the server. */
  attach: (file: File) => void;
  /** Attach pasted text as a list. */
  attachText: (text: string) => void;
  detach: () => void;
  /** Save the checked file: "all", "carrying" or a status, as CSV or Excel. */
  download: (only: string, format: "csv" | "xlsx") => Promise<void>;
};

const AskAiContext = createContext<AskAiState | null>(null);
// The report shell needs only this flag, not every keystroke/message/quota update.
const AskAiAvailableContext = createContext(false);

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** The server's refusal detail, when the error body carries one. */
function refusalDetail(err: unknown): { code?: string; message?: string } | null {
  if (!(err instanceof ApiError)) return null;
  try {
    const parsed = JSON.parse(err.message) as { detail?: unknown };
    const detail = parsed?.detail;
    if (detail && typeof detail === "object") return detail as { code?: string; message?: string };
    if (typeof detail === "string") return { message: detail };
  } catch {
    /* not JSON */
  }
  return null;
}

const UNAVAILABLE_NOW =
  "The assistant is not available right now. Try again in a minute.";
const STATUS_POLL_MS = 60_000;
const STATUS_REFRESH_MIN_MS = 5_000;

export function AskAiProvider({ children }: { children: ReactNode }) {
  const { token, basePath } = useReportScope();
  const { pathname } = useLocation();
  const page = pageOf(pathname, basePath);

  const [status, setStatus] = useState<AskStatus | null>(null);
  const available = Boolean(status?.enabled);
  const [open, setOpen] = useState(false);
  const refreshStatus = useRef<(() => Promise<void>) | null>(null);
  const allowanceRevision = useRef(0);
  const [pending, setPending] = useState(false);
  const [transcripts, setTranscripts] = useState<Partial<Record<AskPage, AskMessage[]>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<AskPage, string>>>({});
  const draft = drafts[page] ?? "";
  const setDraft = useCallback((text: string) => {
    setDrafts((previous) => ({ ...previous, [page]: text }));
  }, [page]);
  const pendingRef = useRef(false);
  const [attachment, setAttachment] = useState<AskAttachment | null>(null);
  // The newest attach wins: a slow check of a file the reader has since
  // replaced or removed must not land.
  const attachSeq = useRef(0);

  // Fetch once for the launcher, and revalidate when the reader comes back.
  // Every backend endpoint independently enforces access.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    let reading = false;
    let lastRead = -Infinity;
    const refresh = async () => {
      const now = performance.now();
      if (reading || document.visibilityState === "hidden" || now - lastRead < STATUS_REFRESH_MIN_MS) return;
      lastRead = now;
      reading = true;
      const revision = allowanceRevision.current;
      try {
        const next = await api.askStatus(token);
        if (alive) {
          setStatus((current) => {
            if (!next?.enabled || !current || revision === allowanceRevision.current) return next;
            // A status read started before a question returned can carry an
            // older balance. Keep the answer's quota and update the metadata.
            return {
              ...next,
              allowance_left_pct: current.allowance_left_pct,
              budget_exhausted: current.budget_exhausted,
            };
          });
          if (!next?.enabled) setOpen(false);
        }
      } catch (err) {
        // A throttle or transient outage must not dismiss a reader's chat.
        if (alive && err instanceof ApiError && [401, 403, 404, 410].includes(err.status)) {
          setStatus(null);
          setOpen(false);
        }
      } finally { reading = false; }
    };
    refreshStatus.current = refresh;
    void refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive = false;
      refreshStatus.current = null;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [token]);

  useEffect(() => {
    if (!open) return;
    const refresh = () => void refreshStatus.current?.();
    refresh();
    const timer = window.setInterval(refresh, STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [open]);

  // Earlier versions stored chats in this tab. Retire only this report's
  // legacy keys; new messages and files never go into browser storage.
  useEffect(() => {
    for (const reportPage of ASK_PAGES) {
      try { sessionStorage.removeItem(`pf.ask.${token}.${reportPage}`); } catch { /* storage unavailable */ }
    }
  }, [token]);

  const messages = useMemo(() => transcripts[page] ?? [], [transcripts, page]);

  const update = useCallback(
    (forPage: AskPage, fn: (prev: AskMessage[]) => AskMessage[]) => {
      setTranscripts((t) => {
        const next = fn(t[forPage] ?? []);
        return { ...t, [forPage]: next };
      });
    },
    [],
  );

  const finishReveal = useCallback((id: string) => {
    setTranscripts((previous) => {
      for (const reportPage of ASK_PAGES) {
        const thread = previous[reportPage];
        if (thread?.some((message) => message.id === id && message.reveal)) {
          return { ...previous, [reportPage]: thread.map((message) => message.id === id ? { ...message, reveal: false } : message) };
        }
      }
      return previous;
    });
  }, []);

  const applyAllowance = useCallback((leftPct?: number | null, exhausted?: boolean) => {
    if (leftPct === undefined && exhausted === undefined) return;
    allowanceRevision.current += 1;
    setStatus((s) =>
      s
        ? {
            ...s,
            allowance_left_pct: leftPct === undefined ? s.allowance_left_pct : leftPct,
            budget_exhausted: exhausted ?? s.budget_exhausted,
          }
        : s,
    );
  }, []);

  const attach = useCallback(
    (file: File) => {
      if (!token) return;
      const seq = ++attachSeq.current;
      const accept = (status?.files?.accept ?? DEFAULT_ACCEPT).split(",");
      const maxBytes = status?.files?.max_bytes ?? DEFAULT_MAX_BYTES;
      const name = file.name || "file";
      const ext = name.includes(".") ? `.${name.split(".").pop()!.toLowerCase()}` : "";
      const fail = (error: string) =>
        setAttachment({ name, size: file.size, data: "", state: "error", error });
      if (ext && !accept.includes(ext)) {
        fail("Ask AI reads .csv, .tsv, .txt and .xlsx files.");
        return;
      }
      if (file.size > maxBytes) {
        fail("The file is larger than 5 MB. Ask AI reads files up to 5 MB.");
        return;
      }
      setAttachment({ name, size: file.size, data: "", state: "reading" });
      Promise.all([readAsBase64(file), attachmentId(file)])
        .then(([data, id]) => {
          if (seq !== attachSeq.current) return;
          setAttachment({ id, name, size: file.size, data, state: "reading" });
          return api.askFile(token, { name, data }).then((check) => {
            if (seq !== attachSeq.current) return;
            setAttachment({ id, name, size: file.size, data, state: "ready", check });
          });
        })
        .catch((err: unknown) => {
          if (seq !== attachSeq.current) return;
          fail(refusalDetail(err)?.message || "The file could not be read. Try again.");
        });
    },
    [token, status],
  );

  const attachText = useCallback(
    (text: string) => attach(new File([text], "Pasted list.txt", { type: "text/plain" })),
    [attach],
  );

  const detach = useCallback(() => {
    attachSeq.current += 1;
    setAttachment(null);
  }, []);

  const download = useCallback(
    async (only: string, format: "csv" | "xlsx") => {
      if (!token || !attachment || attachment.state !== "ready") return;
      await api.askFileDownload(token, { name: attachment.name, data: attachment.data, only, format });
    },
    [token, attachment],
  );

  const send = useCallback(
    (question: string) => {
      if (attachment && attachment.state !== "ready") return;
      const withFile = attachment?.state === "ready" ? attachment : null;
      const clean = question.trim() || (withFile ? "Check this file against my report" : "");
      if (!clean || pendingRef.current || !token) return;
      const forPage = page;
      const prior = transcripts[forPage] ?? [];
      // The earlier turns the server may use as context for a follow up:
      // answered exchanges only, newest last, as role + text.
      const history: AskTurn[] = prior
        .filter((m) => !m.pending && !m.refused)
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
      const userId = newId();
      const botId = newId();
      pendingRef.current = true;
      setPending(true);
      const fileNote =
        withFile && !withFile.sent && withFile.check
          ? { name: withFile.name, rows: withFile.check.file.rows }
          : undefined;
      if (withFile && !withFile.sent) setAttachment({ ...withFile, sent: true });
      update(forPage, (prev) => [
        ...prev,
        { id: userId, role: "user", content: clean, ...(fileNote ? { file: fileNote } : {}) },
        { id: botId, role: "assistant", content: "", pending: true },
      ]);
      api
        .ask(token, {
          page: forPage,
          question: clean,
          history,
          ...(withFile ? { attachment: { name: withFile.name, data: withFile.data } } : {}),
        })
        .then((res: AskAnswer) => {
          update(forPage, (prev) =>
            prev.map((m) =>
              m.id === botId
                ? {
                    id: botId,
                    role: "assistant",
                    content: res.answer,
                    refused: !res.answerable,
                    reveal: true,
                    local: res.local,
                    usedPct: res.counted ? res.used_pct : 0,
                    ...(withFile && res.download
                      ? { download: res.download, downloadFile: withFile.name, downloadId: withFile.id }
                      : {}),
                  }
                : m,
            ),
          );
          applyAllowance(res.allowance_left_pct, res.budget_exhausted);
        })
        .catch((err: unknown) => {
          const detail = refusalDetail(err);
          const text = detail?.message || UNAVAILABLE_NOW;
          update(forPage, (prev) =>
            prev.map((m) => (m.id === botId ? { id: botId, role: "assistant", content: text, refused: true, reveal: true } : m)),
          );
          if (detail?.code === "budget") applyAllowance(0, true);
        })
        .finally(() => {
          pendingRef.current = false;
          setPending(false);
        });
    },
    [token, page, transcripts, update, applyAllowance, attachment],
  );

  const clear = useCallback(() => {
    update(page, () => []);
    setDrafts((previous) => ({ ...previous, [page]: "" }));
    attachSeq.current += 1;
    setAttachment(null);
  }, [page, update]);

  const allowanceLeft = status ? status.allowance_left_pct ?? null : null;

  const value = useMemo<AskAiState>(
    () => ({
      available,
      status,
      open,
      setOpen,
      finishReveal,
      page,
      messages,
      draft,
      setDraft,
      pending,
      allowanceLeft,
      budgetExhausted: Boolean(status?.budget_exhausted),
      send,
      clear,
      attachment,
      attach,
      attachText,
      detach,
      download,
    }),
    [available, status, open, finishReveal, page, messages, draft, setDraft, pending, allowanceLeft, send, clear, attachment, attach,
     attachText, detach, download],
  );

  return (
    <AskAiAvailableContext.Provider value={available}>
      <AskAiContext.Provider value={value}>{children}</AskAiContext.Provider>
    </AskAiAvailableContext.Provider>
  );
}

export function useAskAiAvailable(): boolean {
  return useContext(AskAiAvailableContext);
}

export function useAskAi(): AskAiState {
  const ctx = useContext(AskAiContext);
  if (!ctx) {
    throw new Error("useAskAi must be used inside AskAiProvider");
  }
  return ctx;
}
