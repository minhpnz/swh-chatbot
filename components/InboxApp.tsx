'use client';
import { useEffect, useState } from 'react';

type Esc = {
  id: string; conversation_id: string; reason: string; risk_level: string;
  summary: string; status: string; created_at: string;
};

export function InboxApp() {
  const [pw, setPw] = useState('');
  const [authed, setAuthed] = useState(false);
  const [escalations, setEscalations] = useState<Esc[]>([]);

  async function load(password: string) {
    const res = await fetch('/api/swh/admin/escalations', { headers: { 'x-swh-admin': password } });
    if (res.status === 401) {
      setAuthed(false);
      alert('Sai mật khẩu');
      return;
    }
    const data = await res.json();
    setEscalations(data.escalations ?? []);
    setAuthed(true);
    sessionStorage.setItem('swh_admin_pw', password);
  }
  useEffect(() => {
    const saved = sessionStorage.getItem('swh_admin_pw');
    if (saved) {
      setPw(saved);
      load(saved);
    }
  }, []);

  async function resolve(id: string) {
    await fetch('/api/swh/admin/escalations', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-swh-admin': pw },
      body: JSON.stringify({ id, status: 'resolved' }),
    });
    load(pw);
  }

  if (!authed) {
    return (
      <div className="mx-auto mt-32 max-w-sm space-y-3 p-4">
        <h1 className="text-lg font-semibold">SwH Inbox</h1>
        <input
          className="w-full rounded border px-3 py-2"
          type="password"
          placeholder="Mật khẩu"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') load(pw); }}
        />
        <button className="w-full rounded bg-pink-500 py-2 text-white" onClick={() => load(pw)}>Vào</button>
      </div>
    );
  }

  const open = escalations.filter((e) => e.status !== 'resolved').length;

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <h1 className="text-lg font-semibold">Cần follow-up ({open})</h1>
      {escalations.map((e) => (
        <div key={e.id} className="rounded border p-3 text-sm">
          <div className="flex justify-between">
            <span className="font-medium uppercase text-pink-600">{e.reason} · {e.risk_level}</span>
            <span className="text-gray-400">{new Date(e.created_at).toLocaleString('vi-VN')}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-gray-700">{e.summary}</p>
          <div className="mt-2 flex items-center gap-3">
            <span className={`rounded px-2 py-0.5 text-xs ${e.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {e.status}
            </span>
            <a className="text-xs text-blue-600 underline" href={`/api/swh/admin/conversations/${e.conversation_id}`} target="_blank" rel="noreferrer">
              xem hội thoại (JSON)
            </a>
            {e.status !== 'resolved' && (
              <button className="text-xs text-green-700 underline" onClick={() => resolve(e.id)}>đánh dấu đã xử lý</button>
            )}
          </div>
        </div>
      ))}
      {escalations.length === 0 && <p className="text-gray-400">Chưa có case nào.</p>}
    </div>
  );
}
