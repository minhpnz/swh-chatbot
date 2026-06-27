'use client';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Msg = { role: 'user' | 'assistant'; content: string };
const STORAGE_KEY = 'swh_conversation_id';
const GREETING = 'Hé lu 🩷 Tụi mình là **SpeakwithHang** nha. Bạn đang quan tâm lớp nào hay cần tụi mình tư vấn gì hôm nay nè?';

// NomadCraft mark — a compass needle in a soft gradient badge.
function NomadLogo({ className = '' }: { className?: string }) {
  return (
    <span className={`grid place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-pink-500 via-rose-500 to-fuchsia-500 shadow-sm ${className}`}>
      <svg viewBox="0 0 24 24" fill="none" className="h-1/2 w-1/2 text-white">
        <path d="M12 2.5 14.2 9.8 21.5 12 14.2 14.2 12 21.5 9.8 14.2 2.5 12 9.8 9.8z" fill="currentColor" opacity="0.95" />
      </svg>
    </span>
  );
}

function Bubble({ role, content }: Msg) {
  const isUser = role === 'user';
  return (
    <div
      data-role={role}
      className={`flex items-end gap-2 duration-300 animate-in fade-in slide-in-from-bottom-2 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {!isUser && <NomadLogo className="h-8 w-8 shrink-0" />}
      <div
        className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed shadow-sm ${
          isUser
            ? 'rounded-br-md bg-gradient-to-br from-pink-500 to-rose-500 text-white'
            : 'rounded-bl-md border border-rose-100/80 bg-white text-gray-800'
        }`}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{content}</span>
        ) : (
          <div className="space-y-2 break-words [&_a]:font-medium [&_a]:text-pink-600 [&_a]:underline [&_a]:underline-offset-2 [&_em]:italic [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:m-0 [&_strong]:font-semibold [&_strong]:text-gray-900 [&_ul]:list-disc [&_ul]:pl-5">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ ...p }) => <a {...p} target="_blank" rel="noreferrer noopener" />,
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatWidget() {
  const [messages, setMessages] = useState<Msg[]>([{ role: 'assistant', content: GREETING }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const convId = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    convId.current = localStorage.getItem(STORAGE_KEY);
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setBusy(true);
    try {
      const res = await fetch('/api/swh/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversation_id: convId.current, text }),
      });
      const data = await res.json();
      if (data.conversation_id) {
        convId.current = data.conversation_id;
        localStorage.setItem(STORAGE_KEY, data.conversation_id);
      }
      setMessages((m) => [...m, { role: 'assistant', content: data.reply ?? 'Tụi mình đang bận xíu, bạn nhắn lại giúp nha!' }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Mạng tụi mình chậm xíu, bạn thử lại nha 🥹' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-[100dvh] max-w-2xl flex-col bg-gradient-to-b from-rose-50/60 via-white to-white">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-rose-100 bg-white/80 px-4 py-3 backdrop-blur-md">
        <NomadLogo className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-semibold text-gray-900">SpeakwithHang</h1>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online
            </span>
          </div>
          <p className="truncate text-xs text-gray-400">Tư vấn tuyển sinh · by NomadCraft</p>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} content={m.content} />
        ))}
        {busy && (
          <div data-role="assistant" className="flex items-end gap-2">
            <NomadLogo className="h-8 w-8 shrink-0" />
            <div className="flex gap-1 rounded-2xl rounded-bl-md border border-rose-100/80 bg-white px-4 py-3 shadow-sm">
              <span className="h-2 w-2 animate-bounce rounded-full bg-rose-300 [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-rose-300 [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-rose-300" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-rose-100 bg-white/90 p-3 backdrop-blur-md">
        <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1.5 pl-4 pr-1.5 shadow-sm transition focus-within:border-pink-400 focus-within:ring-2 focus-within:ring-pink-100">
          <input
            className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-gray-400"
            placeholder="Nhập tin nhắn…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={busy}
            autoFocus
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            aria-label="Gửi"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 px-4 py-2 text-sm font-medium text-white shadow transition hover:brightness-105 active:scale-95 disabled:opacity-40"
          >
            Gửi
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path d="M4 12h15m0 0-6-6m6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-gray-300">SpeakwithHang · powered by NomadCraft</p>
      </div>
    </div>
  );
}
