// Интерпретатор на декларативните правила от конфигурацията на бизнеса.
// Бизнесите НЕ съдържат код — само данни; тук е единственото място с логика.

export function defaultAnswers(cfg) {
  const a = {};
  for (const q of cfg.questions) {
    if (q.default !== undefined) a[q.id] = Array.isArray(q.default) ? [...q.default] : q.default;
    else a[q.id] = q.type === 'multi' ? [] : '';
  }
  return a;
}

export function isVisible(q, a) {
  const c = q.showIf;
  if (!c) return true;
  const v = a[c.q];
  if (c.eq !== undefined) return v === c.eq;
  if (c.neq !== undefined) return v !== c.neq && v !== '' && v !== undefined;
  if (c.in) return c.in.includes(v);
  if (c.includes) return Array.isArray(v) && v.includes(c.includes);
  return true;
}

const asList = (v) => (Array.isArray(v) ? v : v === undefined || v === '' ? [] : [v]);

/** Продължителност в минути: fixed + сума от стойности, зададени по отговор. */
export function computeDuration(cfg, a) {
  const r = cfg.rules.duration || {};
  let m = r.fixed || 0;
  for (const [qid, map] of Object.entries(r.sum || {})) {
    const q = cfg.questions.find((x) => x.id === qid);
    if (q && !isVisible(q, a)) continue;
    for (const v of asList(a[qid])) m += map[v] || 0;
  }
  return Math.max(m, 15);
}

/** Колко ресурса са нужни едновременно (напр. двама терапевти за масаж за двама). */
export function computeQuantity(cfg, a) {
  const q = cfg.rules.quantity;
  if (!q) return 1;
  if (typeof q === 'number') return q;
  const v = a[q.answer];
  if (q.map) return q.map[v] || 1;
  return Math.max(1, Number(v) || 1);
}

/** Проверява дали ресурс отговаря на изискванията, извлечени от отговорите. */
export function matchResource(cfg, a, res) {
  for (const m of cfg.rules.match || []) {
    const v = a[m.answer];
    if (m.op === 'gte') {
      if (!(res[m.field] >= (Number(v) || 0))) return false;
    } else if (m.op === 'eq') {
      if (v === undefined || v === '' || v === m.any) continue;
      if (res[m.field] !== v) return false;
    } else if (m.op === 'hasAll') {
      // нужни умения: обединение от map[отговор] за всички избрани стойности
      const need = new Set();
      for (const x of asList(v)) for (const s of m.map[x] || []) need.add(s);
      const have = res[m.field] || [];
      for (const s of need) if (!have.includes(s)) return false;
    }
  }
  return true;
}

/** Цена в евро. */
export function computePrice(cfg, a, nights = 0) {
  const p = cfg.price;
  if (!p) return null;
  if (cfg.mode === 'stay') {
    const rt = cfg.roomTypes.find((r) => r.id === a[cfg.rules.stay.typeAnswer]);
    if (!rt || !nights) return null;
    const rooms = Number(a[cfg.rules.stay.roomsAnswer]) || 1;
    const guests = Number(a[cfg.rules.stay.guestsAnswer]) || 1;
    const meal = p.meal[a.meal] || 0;
    return Math.round((rt.price * rooms + meal * guests) * nights * 100) / 100;
  }
  let total = p.fixed || 0;
  for (const [qid, map] of Object.entries(p.sum || {})) {
    const q = cfg.questions.find((x) => x.id === qid);
    if (q && !isVisible(q, a)) continue;
    for (const v of asList(a[qid])) total += map[v] || 0;
  }
  if (p.perAnswer) total += (Number(a[p.perAnswer.answer]) || 0) * p.perAnswer.amount;
  if (p.multiplyBy) total *= computeQuantity(cfg, a);
  return total;
}

export function validateAnswers(cfg, a) {
  const errors = {};
  for (const q of cfg.questions) {
    if (!isVisible(q, a)) continue;
    const v = a[q.id];
    if (q.required && (v === '' || v === undefined || (Array.isArray(v) && v.length === 0))) {
      errors[q.id] = 'Полето е задължително';
    } else if (q.type === 'number' && v !== '') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < q.min || n > q.max) errors[q.id] = `Въведете число от ${q.min} до ${q.max}`;
    }
  }
  if (cfg.mode === 'stay') {
    const s = cfg.rules.stay;
    const rt = cfg.roomTypes.find((r) => r.id === a[s.typeAnswer]);
    const rooms = Number(a[s.roomsAnswer]) || 0;
    const guests = Number(a[s.guestsAnswer]) || 0;
    if (rt && rooms * rt.capacity < guests) {
      errors[s.guestsAnswer] = `${rooms} × „${rt.name}“ побира най-много ${rooms * rt.capacity} души — увеличете броя стаи или изберете друг тип.`;
    }
    if (rt && rooms > rt.count) errors[s.roomsAnswer] = `Разполагаме с общо ${rt.count} стаи от този тип.`;
    if (rooms > guests && guests > 0) errors[s.roomsAnswer] = 'Броят стаи не може да е по-голям от броя гости.';
  }
  return errors;
}

export function formatAnswer(q, v) {
  if (q.type === 'number' || q.type === 'text' || q.type === 'textarea') return v === '' || v === undefined ? '—' : String(v);
  const label = (x) => q.options?.find((o) => o.value === x)?.label ?? x;
  if (Array.isArray(v)) return v.length ? v.map(label).join(', ') : '—';
  return v === '' || v === undefined ? '—' : label(v);
}
