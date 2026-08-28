import { useRef, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { api, type ChatFrame } from "../lib/api";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Who removed my lines this week?",
  "What changed for Magnite?",
  "Show me all new resellers.",
  "Which of my seats are unauthorized?",
];

export default function ChatDrawer({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = async (prompt: string) => {
    if (!prompt.trim() || streaming) return;
    setMessages((m) => [...m, { role: "user", content: prompt }, { role: "assistant", content: "" }]);
    setDraft("");
    setStreaming(true);
    try {
      let assistantText = "";
      for await (const frame of api.chat(token, prompt) as AsyncIterable<ChatFrame>) {
        if (frame.type === "text") {
          assistantText += frame.delta;
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { role: "assistant", content: assistantText };
            return copy;
          });
        } else if (frame.type === "tool_call") {
          assistantText += `\n\n_[${frame.name}]_\n`;
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { role: "assistant", content: assistantText };
            return copy;
          });
        } else if (frame.type === "error") {
          assistantText += `\n\n**Error:** ${frame.message}`;
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { role: "assistant", content: assistantText };
            return copy;
          });
        }
        scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" });
      }
    } finally {
      setStreaming(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-primary-foreground shadow-lg transition-transform hover:scale-105"
      >
        <MessageSquare className="h-5 w-5" />
        <span className="font-medium">Ask about your crawl</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/30"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex w-full max-w-md flex-col border-l border-border bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-border p-4">
              <h3 className="font-display font-semibold">Bottomlines Crawl AI</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </header>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Ask me anything about this week's crawl or the IAB spec.
                  </p>
                  <ul className="space-y-2">
                    {SUGGESTIONS.map((s) => (
                      <li key={s}>
                        <button
                          onClick={() => send(s)}
                          className="w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "ml-auto max-w-[85%] bg-primary text-primary-foreground"
                      : "mr-auto max-w-[92%] bg-muted"
                  }`}
                >
                  <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
                </div>
              ))}
              {streaming && (
                <p className="text-xs text-muted-foreground">Thinking…</p>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(draft);
              }}
              className="flex gap-2 border-t border-border p-3"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask about your crawl…"
                disabled={streaming}
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={streaming || !draft.trim()}
                className="rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
