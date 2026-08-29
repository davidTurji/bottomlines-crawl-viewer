import { useCallback, useRef, useState } from "react";
import { api, type ChatFrame } from "./api";

/**
 * Reusable stream handler for the inline Ask AI thread on every page.
 *
 * Owns the transcript, the send action, and the streaming state so a page can
 * mount the inline composer without repeating the SSE plumbing that used to
 * live inside ChatDrawer.
 */
export type ChatMsg = { role: "user" | "assistant"; content: string };

export function useChatStream(token: string) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef(false);

  const send = useCallback(
    async (prompt: string) => {
      const clean = prompt.trim();
      if (!clean || streaming) return;
      setMessages((m) => [
        ...m,
        { role: "user", content: clean },
        { role: "assistant", content: "" },
      ]);
      setStreaming(true);
      abortRef.current = false;
      try {
        let assistantText = "";
        for await (const frame of api.chat(token, clean) as AsyncIterable<ChatFrame>) {
          if (abortRef.current) break;
          if (frame.type === "text") {
            assistantText += frame.delta;
          } else if (frame.type === "tool_call") {
            assistantText += `\n\n_[${frame.name}]_\n`;
          } else if (frame.type === "error") {
            assistantText += `\n\n**Error:** ${frame.message}`;
          }
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { role: "assistant", content: assistantText };
            return copy;
          });
        }
      } finally {
        setStreaming(false);
      }
    },
    [token, streaming],
  );

  const reset = useCallback(() => {
    abortRef.current = true;
    setMessages([]);
  }, []);

  return { messages, streaming, send, reset };
}
