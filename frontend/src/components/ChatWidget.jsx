import { useState, useEffect, useRef } from "react";
import { X, Send, Loader2 } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8001";

const WELCOME_MESSAGE = {
  role: "model",
  content:
    "Hi! I'm the UniVicoustic assistant. Ask me anything about our acoustic panels — products, sizes, specs, or how to use the configurator.",
};

export default function ChatWidget({ open, onClose }) {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Error ${res.status}`);
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "model", content: data.reply },
      ]);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed bottom-24 right-6 z-[400] flex flex-col shadow-2xl rounded-2xl overflow-hidden"
      style={{
        width: 360,
        height: 500,
        background: "white",
        border: "1px solid hsl(215,16%,87%)",
      }}
      data-testid="chat-widget"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ background: "hsl(25,40%,46%)" }}
      >
        <div className="flex items-center gap-2">
          <img
            src="/chat-icon.png"
            alt=""
            className="w-6 h-6 object-contain"
            aria-hidden="true"
          />
          <div>
            <p className="text-white font-semibold text-sm leading-tight">
              UniVicoustic Assistant
            </p>
            <p className="text-white/70 text-[11px]">Ask about our panels</p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close chat"
          className="text-white/80 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "text-white rounded-br-sm"
                  : "text-[hsl(215,25%,27%)] rounded-bl-sm"
              }`}
              style={{
                background:
                  msg.role === "user"
                    ? "hsl(25,40%,46%)"
                    : "hsl(215,16%,94%)",
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div
              className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm px-3 py-2"
              style={{ background: "hsl(215,16%,94%)" }}
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[hsl(215,16%,47%)]" />
              <span className="text-xs text-[hsl(215,16%,47%)]">Thinking…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center">
            <p className="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg">
              {error}
            </p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="flex items-end gap-2 px-3 py-3 flex-shrink-0 border-t"
        style={{ borderColor: "hsl(215,16%,87%)" }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question…"
          rows={1}
          maxLength={500}
          disabled={loading}
          className="flex-1 resize-none rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
          style={{
            borderColor: "hsl(215,16%,87%)",
            maxHeight: 96,
            lineHeight: "1.4",
            focusRingColor: "hsl(25,40%,46%)",
          }}
          onInput={(e) => {
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || loading}
          aria-label="Send message"
          className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-opacity disabled:opacity-40"
          style={{ background: "hsl(25,40%,46%)" }}
        >
          <Send className="h-4 w-4 text-white" />
        </button>
      </div>
    </div>
  );
}
