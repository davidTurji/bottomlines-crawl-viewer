import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";

import { AssistantMessage, TypingDots, UserBubble } from "./chat/ChatMessage";
import { ChatComposer } from "./chat/ChatComposer";
import { ChatSuggestions } from "./chat/ChatSuggestions";
import { api, type ChatFrame } from "@/lib/api";

/**
 * Ask AI drawer, ported from bottomlines-app's AskAILauncher.
 *
 * Rendered once per page. Shows a floating "Ask AI" pill in the bottom-
 * right when closed; opening slides in a right-side drawer portal-mounted
 * to document.body (outside the page's spacing utilities, otherwise
 * `space-y-*` from an ancestor pushes a fixed element down the screen).
 *
 * Owns the transcript, streaming state, and per-token localStorage
 * persistence so the conversation survives a page refresh and follows the
 * report by share token. Callers drive it from their own composers by
 * ref: `drawerRef.current?.askAndOpen(q)` opens the drawer and sends the
 * question in the same gesture, matching the console's Overview page.
 *
 * Escape closes. Backdrop click closes. The pill hides when open, or
 * always when `hideLauncher` is set (for pages whose own composer is the
 * one visible trigger).
 */

export type AskAIDrawerHandle = {
  askAndOpen: (q: string) => void;
  open: () => void;
  close: () => void;
};

export type AskAIDrawerProps = {
  /** Share token; scopes the persisted transcript so different reports don't cross. */
  token: string;
  /** Starter questions shown when the transcript is empty. */
  suggestions: string[];
  /** Drawer header title. */
  title?: string;
  /** Drawer composer placeholder. */
  placeholder?: string;
  /** Hide the floating pill. Use when the page renders its own trigger. */
  hideLauncher?: boolean;
};

type Msg = { id: string; role: "user" | "assistant"; content: string; error?: boolean };

function storageKey(token: string) {
  return `bl-crawl-viewer:chat:${token}`;
}

function loadChat(token: string): Msg[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey(token)) ?? "[]");
  } catch {
    return [];
  }
}

function persistChat(token: string, msgs: Msg[]) {
  try {
    localStorage.setItem(storageKey(token), JSON.stringify(msgs));
  } catch {
    /* quota — session-only fallback */
  }
}

export const AskAIDrawer = forwardRef<AskAIDrawerHandle, AskAIDrawerProps>(
  function AskAIDrawer(
    { token, suggestions, title = "Ask AI", placeholder = "Ask a follow-up…", hideLauncher = false },
    handleRef,
  ) {
    const [open, setOpen] = useState(false);
    const [composer, setComposer] = useState("");
    const [pending, setPending] = useState(false);
    const [messages, setMessages] = useState<Msg[]>(() => loadChat(token));
    const scrollRef = useRef<HTMLDivElement>(null);
    const composerRef = useRef<HTMLTextAreaElement>(null);

    // Swap history when the token changes (different report).
    useEffect(() => {
      setMessages(loadChat(token));
    }, [token]);

    useEffect(() => {
      persistChat(token, messages);
    }, [token, messages]);

    // Focus composer on open, scroll to bottom on new messages.
    useEffect(() => {
      if (open) requestAnimationFrame(() => composerRef.current?.focus());
    }, [open]);
    useEffect(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, [messages, pending]);

    // Escape closes.
    useEffect(() => {
      if (!open) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    /**
     * Send a question. Streams the answer into the trailing assistant
     * message. Ref-friendly (stable identity via useCallback) so the
     * imperative handle doesn't rebuild every render.
     */
    const send = useCallback(
      async (rawQuestion: string) => {
        const q = rawQuestion.trim();
        if (!q || pending) return;
        setComposer("");
        const userId = `u-${Date.now()}`;
        const assistantId = `a-${Date.now()}`;
        setMessages((m) => [
          ...m,
          { id: userId, role: "user", content: q },
          { id: assistantId, role: "assistant", content: "" },
        ]);
        setPending(true);
        try {
          let acc = "";
          for await (const frame of api.chat(token, q) as AsyncIterable<ChatFrame>) {
            if (frame.type === "text") {
              acc += frame.delta;
            } else if (frame.type === "tool_call") {
              acc += `\n\n_[${frame.name}]_\n`;
            } else if (frame.type === "error") {
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, content: frame.message, error: true }
                    : msg,
                ),
              );
              return;
            }
            setMessages((m) =>
              m.map((msg) => (msg.id === assistantId ? { ...msg, content: acc } : msg)),
            );
          }
        } catch (err) {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: (err as Error).message, error: true }
                : msg,
            ),
          );
        } finally {
          setPending(false);
          composerRef.current?.focus();
        }
      },
      [token, pending],
    );

    // Imperative handle for parents that render their own trigger.
    const sendRef = useRef(send);
    sendRef.current = send;
    useImperativeHandle(
      handleRef,
      () => ({
        askAndOpen: (q: string) => {
          setOpen(true);
          // Defer so the drawer mounts before send fires — otherwise the
          // scroll ref it captures isn't attached yet.
          requestAnimationFrame(() => sendRef.current(q));
        },
        open: () => setOpen(true),
        close: () => setOpen(false),
      }),
      [],
    );

    return (
      <>
        {/* Floating launcher pill — same shape as bottomlines-app. */}
        {!open && !hideLauncher && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:-translate-y-0.5 hover:shadow-xl"
          >
            <Sparkles className="h-4 w-4" />
            Ask AI
          </button>
        )}

        {open &&
          createPortal(
            <>
              <div
                className="fixed inset-0 z-40 bg-slate-900/10 backdrop-blur-[1px]"
                onClick={() => setOpen(false)}
              />
              <aside
                role="dialog"
                aria-label={title}
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col border-l border-border bg-white shadow-2xl"
              >
                <header className="flex h-[46px] flex-shrink-0 items-center gap-2 border-b border-border/50 px-5">
                  <Sparkles className="h-4 w-4 flex-shrink-0 text-primary" />
                  <h2 className="truncate text-[13px] font-medium text-foreground">{title}</h2>
                  <button
                    onClick={() => setOpen(false)}
                    className="ml-auto flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </header>

                <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
                  {messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-7 px-5 py-12">
                      <h3 className="text-center text-[18px] font-medium tracking-tight text-foreground">
                        What do you want to know?
                      </h3>
                      {suggestions.length > 0 && (
                        <ChatSuggestions items={suggestions} onSelect={send} />
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-6 px-5 py-6">
                      {messages.map((m) =>
                        m.role === "user" ? (
                          <UserBubble key={m.id}>{m.content}</UserBubble>
                        ) : (
                          <AssistantMessage
                            key={m.id}
                            text={m.content}
                            error={m.error}
                            showCopy={!m.error && !pending}
                          />
                        ),
                      )}
                      {pending &&
                        messages[messages.length - 1]?.content === "" && <TypingDots />}
                    </div>
                  )}
                </div>

                <div className="flex-shrink-0 px-5 pb-5 pt-2">
                  <ChatComposer
                    compact
                    value={composer}
                    onChange={setComposer}
                    onSubmit={send}
                    pending={pending}
                    placeholder={placeholder}
                    composerRef={composerRef}
                  />
                </div>
              </aside>
            </>,
            document.body,
          )}
      </>
    );
  },
);
