'use client';
import { useEffect, useRef, useState } from 'react';

type Msg = { role: 'user' | 'assistant'; content: string };
const STORAGE_KEY = 'swh_conversation_id';

export function ChatWidget() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      content: 'Hé lu 🩷 Tụi mình là SpeakwithHang nha. Bạn đang quan tâm lớp nào hay cần tụi mình tư vấn gì hôm nay nè?',
    },
  ]);
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
    <div className="mx-auto flex h-[100dvh] max-w-2xl flex-col bg-white">
      <header className="border-b p-4 text-center font-semibold text-pink-600">SpeakwithHang · Tư vấn</header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <span
              className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                m.role === 'user' ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-900'
              }`}
            >
              {m.content}
            </span>
          </div>
        ))}
        {busy && <div className="text-left text-sm text-gray-400">SwH đang soạn tin…</div>}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 border-t p-3">
        <input
          className="flex-1 rounded-full border px-4 py-2 text-sm outline-none focus:border-pink-400"
          placeholder="Nhập tin nhắn…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
          disabled={busy}
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          className="rounded-full bg-pink-500 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Gửi
        </button>
      </div>
    </div>
  );
}
