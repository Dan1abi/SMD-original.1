import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store.jsx';
import { ask } from '../ai/provider.js';
import { chatContext } from '../ai/context.js';

const STORAGE = 'ubs.chat.v1';

export default function ChatAssistant({ biz, onClose }) {
  const { profile, bookings } = useStore();
  const [messages, setMessages] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE));
      if (saved?.length) return saved;
    } catch {
      /* празно */
    }
    return [{ role: 'bot', text: `Здравейте, ${profile.fullName.split(' ')[0]}! 👋 Аз съм AI асистентът. Питайте ме за свободни часове, работно време, цени, плащане или условия.` }];
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState(() =>
    biz ? ['Кога е най-близкият свободен час?', 'Какво е работното време?', 'Колко струва?', 'Как мога да платя?'] : ['Какви бизнеси има?', 'Има ли маса утре в 20:00 за 4 души?', 'Моите резервации']
  );
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
    try {
      sessionStorage.setItem(STORAGE, JSON.stringify(messages.slice(-40)));
    } catch {
      /* празно */
    }
  }, [messages]);

  const send = async (text) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setBusy(true);
    const ctx = { biz, profile, bookings, answers: chatContext.bizId === biz?.id ? chatContext.answers : null };
    const reply = await ask(q, ctx, messages);
    // кратка пауза — по-естествено усещане за разговор
    await new Promise((r) => setTimeout(r, 250));
    setMessages((m) => [...m, { role: 'bot', text: reply.text }]);
    if (reply.suggestions) setSuggestions(reply.suggestions);
    setBusy(false);
  };

  return (
    <div className="chat" role="dialog" aria-label="AI асистент">
      <div className="chat-head">
        <div>
          <b>🤖 AI асистент</b>
          <div className="small muted">{biz ? `Контекст: ${biz.name}` : 'Всички бизнеси'}</div>
        </div>
        <button className="link" onClick={onClose} aria-label="Затвори">✕</button>
      </div>
      <div className="chat-body">
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.text.split('\n').map((line, j) => (
              <span key={j}>
                {line}
                <br />
              </span>
            ))}
          </div>
        ))}
        {busy && <div className="msg bot typing">…</div>}
        <div ref={endRef} />
      </div>
      <div className="chat-sugg">
        {suggestions.map((s) => (
          <button key={s} className="chip" onClick={() => send(s)}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Напишете въпрос…" aria-label="Съобщение" />
        <button className="btn primary" disabled={busy || !input.trim()}>
          Изпрати
        </button>
      </form>
    </div>
  );
}
