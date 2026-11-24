import { localReply } from './assistant.js';

/**
 * Слой за доставчик на AI. По подразбиране — локален (src/ai/assistant.js).
 * Ако е зададен VITE_AI_ENDPOINT (ваш backend прокси към езиков модел — НИКОГА не слагайте API ключ във фронтенда),
 * въпросите, на които локалният асистент не е сигурен, се препращат натам заедно с контекста на бизнеса.
 */
const ENDPOINT = import.meta.env?.VITE_AI_ENDPOINT || '';

function buildContext(ctx) {
  const b = ctx.biz;
  return b ? { business: { name: b.name, category: b.category, about: b.about, faq: b.faq, hours: b.hours } } : {};
}

export async function ask(message, ctx, history = []) {
  const local = localReply(message, ctx);
  if (!ENDPOINT || local.confident) return local;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: history.slice(-10), context: buildContext(ctx) }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return { text: data.reply || local.text, confident: true };
  } catch {
    return local;
  }
}
