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
  type AskPage,
  type AskStatus,
  type AskTurn,
} from "./api";
import { useReportScope } from "./reportScope";

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
 * here, per page, in sessionStorage, so a reload or a walk to another page
 * and back finds the conversation where it was.
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
};

export const ASK_PAGES: AskPage[] = ["overview", "discovery", "declarations", "sellers", "schain"];

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
  page: AskPage;
  messages: AskMessage[];
  pending: boolean;
  /** Questions left on the current page, null until the status has loaded. */
  remaining: number | null;
  budgetExhausted: boolean;
  send: (question: string) => void;
  clear: () => void;
};

const AskAiContext = createContext<AskAiState | null>(null);

const storageKey = (token: string, page: AskPage) => `pf.ask.${token}.${page}`;

function loadTranscript(token: string, page: AskPage): AskMessage[] {
  try {
    const raw = sessionStorage.getItem(storageKey(token, page));
    const parsed = raw ? (JSON.parse(raw) as AskMessage[]) : [];
    // A question that was in flight when the tab closed never got its
    // answer; showing it as still thinking would be a lie that never ends.
    // A stored answer is shown whole: the reveal is for the moment it lands.
    return parsed.filter((m) => !m.pending).map((m) => ({ ...m, reveal: false }));
  } catch {
    return [];
  }
}

function saveTranscript(token: string, page: AskPage, messages: AskMessage[]) {
  try {
    sessionStorage.setItem(storageKey(token, page), JSON.stringify(messages));
  } catch {
    /* storage full or blocked: the conversation lives for this view only */
  }
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** The server's refusal detail, when the error body carries one. */
function refusalDetail(err: unknown): { code?: string; message?: string; remaining?: Record<string, number> } | null {
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
  "The assistant is not available right now. Try again in a minute. This question was not counted.";

export function AskAiProvider({ children }: { children: ReactNode }) {
  const { token, basePath } = useReportScope();
  const { pathname } = useLocation();
  const page = pageOf(pathname, basePath);

  const [status, setStatus] = useState<AskStatus | null>(null);
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [transcripts, setTranscripts] = useState<Partial<Record<AskPage, AskMessage[]>>>({});
  const pendingRef = useRef(false);

  // One status read per report. 503 (not offered) and any other failure
  // both hide the button: a control the server will refuse is worse than
  // no control. A 401 is the gate's business and locks the page itself.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    api
      .askStatus(token)
      .then((s) => {
        if (!alive) return;
        setStatus(s);
        setAvailable(Boolean(s?.enabled));
      })
      .catch(() => {
        if (alive) setAvailable(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  // Transcripts load lazily per page, once.
  useEffect(() => {
    if (!token) return;
    setTranscripts((t) => (t[page] ? t : { ...t, [page]: loadTranscript(token, page) }));
  }, [token, page]);

  const messages = useMemo(() => transcripts[page] ?? [], [transcripts, page]);

  const update = useCallback(
    (forPage: AskPage, fn: (prev: AskMessage[]) => AskMessage[]) => {
      setTranscripts((t) => {
        const next = fn(t[forPage] ?? []);
        saveTranscript(token, forPage, next);
        return { ...t, [forPage]: next };
      });
    },
    [token],
  );

  const applyRemaining = useCallback(
    (remaining?: Record<string, number>, budgetExhausted?: boolean) => {
      if (!remaining && budgetExhausted === undefined) return;
      setStatus((s) =>
        s
          ? {
              ...s,
              remaining: remaining ? { ...s.remaining, ...(remaining as AskStatus["remaining"]) } : s.remaining,
              budget_exhausted: budgetExhausted ?? s.budget_exhausted,
            }
          : s,
      );
    },
    [],
  );

  const send = useCallback(
    (question: string) => {
      const clean = question.trim();
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
      update(forPage, (prev) => [
        ...prev,
        { id: userId, role: "user", content: clean },
        { id: botId, role: "assistant", content: "", pending: true },
      ]);
      api
        .ask(token, { page: forPage, question: clean, history })
        .then((res: AskAnswer) => {
          update(forPage, (prev) =>
            prev.map((m) =>
              m.id === botId
                ? { id: botId, role: "assistant", content: res.answer, refused: !res.answerable, reveal: true }
                : m,
            ),
          );
          applyRemaining(res.remaining, res.budget_exhausted);
        })
        .catch((err: unknown) => {
          const detail = refusalDetail(err);
          const text = detail?.message || UNAVAILABLE_NOW;
          update(forPage, (prev) =>
            prev.map((m) => (m.id === botId ? { id: botId, role: "assistant", content: text, refused: true, reveal: true } : m)),
          );
          if (detail?.code === "budget") applyRemaining(detail.remaining, true);
          else if (detail?.remaining) applyRemaining(detail.remaining);
        })
        .finally(() => {
          pendingRef.current = false;
          setPending(false);
        });
    },
    [token, page, transcripts, update, applyRemaining],
  );

  const clear = useCallback(() => {
    update(page, () => []);
  }, [page, update]);

  const remaining = status ? status.remaining?.[page] ?? null : null;

  const value = useMemo<AskAiState>(
    () => ({
      available,
      status,
      open,
      setOpen,
      page,
      messages,
      pending,
      remaining,
      budgetExhausted: Boolean(status?.budget_exhausted),
      send,
      clear,
    }),
    [available, status, open, page, messages, pending, remaining, send, clear],
  );

  return <AskAiContext.Provider value={value}>{children}</AskAiContext.Provider>;
}

export function useAskAi(): AskAiState {
  const ctx = useContext(AskAiContext);
  if (!ctx) {
    throw new Error("useAskAi must be used inside AskAiProvider");
  }
  return ctx;
}
