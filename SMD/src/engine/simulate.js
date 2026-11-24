import { SLOT_MIN } from './time.js';

/** Бърз детерминиран PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const FIRST = ['Иван', 'Мария', 'Георги', 'Елена', 'Петър', 'Десислава', 'Николай', 'Йоана', 'Димитър', 'Виктория', 'Стефан', 'Радост'];
const LAST = ['Петров', 'Иванова', 'Георгиев', 'Димитрова', 'Николов', 'Стоянова', 'Христов', 'Тодорова', 'Колев', 'Ангелова'];

/**
 * Генерира реалистично натоварване: по-плътно в близките седмици, по-рядко в далечното бъдеще,
 * пикове в петък/събота. Семето е (бизнес + календарна дата) → данните за конкретна дата
 * са едни и същи при всяко зареждане, дори когато хоризонтът се измести с ден.
 */
function loadFactor(d, weekday, peak) {
  const nearTerm = Math.max(0.12, 1 - d / 150);
  const wk = peak.includes(weekday) ? 1.35 : 1;
  return Math.min(0.95, nearTerm * wk);
}

export function simulate(engine) {
  const cfg = engine.cfg;
  const sim = cfg.simulation || {};
  const peak = sim.peakDays || [5, 6];
  let n = 0;

  if (engine.mode === 'slot') {
    const lens = (sim.lengths || [60]).map((m) => Math.ceil(m / SLOT_MIN));
    const base = sim.occupancy ?? 0.4;
    for (let d = 0; d < engine.days; d++) {
      const h = engine.hours[engine.weekday[d]];
      if (!h) continue;
      const rand = rng(hashStr(cfg.id + engine.iso[d]));
      const p = base * loadFactor(d, engine.weekday[d], peak);
      for (let r = 0; r < engine.R; r++) {
        if (!engine.resOpen[r * engine.days + d]) continue;
        let s = 0;
        while (s < engine.S) {
          if (!h.mask[s]) {
            s++;
            continue;
          }
          if (rand() < p) {
            const len = lens[(rand() * lens.length) | 0];
            if (engine.isFree(r, d, s, len)) {
              engine.add(
                { id: `s${n++}`, sim: true, day: d, start: s, len, resourceIds: [engine.resources[r].id], guest: `${FIRST[(rand() * 12) | 0]} ${LAST[(rand() * 10) | 0]}` },
                { silent: true }
              );
              s += len;
              continue;
            }
          }
          s += engine.step;
        }
      }
    }
  } else {
    const base = sim.occupancy ?? 0.5;
    for (let d = 0; d < engine.days - 1; d++) {
      const date = new Date(engine.start);
      date.setDate(date.getDate() + d);
      const wd = date.getDay();
      const rand = rng(hashStr(cfg.id + date.toDateString()));
      const f = base * loadFactor(d, wd, peak);
      for (const t of engine.roomTypes) {
        const arrivals = Math.round(t.count * f * 0.45 * (0.6 + rand() * 0.8));
        for (let k = 0; k < arrivals; k++) {
          const nights = 1 + ((rand() * 5) | 0);
          const end = Math.min(engine.days, d + nights);
          if (engine.freeRooms(t.id, d, end) >= 1) {
            engine.add({ id: `s${n++}`, sim: true, day: d, endDay: end, type: t.id, rooms: 1 }, { silent: true });
          }
        }
      }
    }
  }
  engine.emit();
  return n;
}

/**
 * „Поток от промени“: на всяко извикване добавя или отменя една случайна симулирана резервация
 * в близките 60 дни. Използва се за демонстрация, че UI остава бърз при постоянни промени —
 * всяка промяна инвалидира кеша само за един ден.
 */
let liveSeq = 0;
export function liveTick(engine, rand = Math.random) {
  const d = 1 + ((rand() * 60) | 0);
  if (rand() < 0.5) {
    // отмяна на случайна симулирана резервация
    if (engine.mode === 'slot') {
      const ids = [...engine.byDay[d]];
      const id = ids.find((x) => engine.bookings.get(x)?.sim);
      if (id) return engine.remove(id), 'remove';
    } else {
      for (const [id, b] of engine.bookings) if (b.sim && b.day === d) return engine.remove(id), 'remove';
    }
  }
  if (engine.mode === 'slot') {
    const r = (rand() * engine.R) | 0;
    const h = engine.hours[engine.weekday[d]];
    if (!h) return null;
    const [a, b] = h.intervals[0].map((m) => m / SLOT_MIN);
    const s = a + engine.step * ((rand() * ((b - a) / engine.step)) | 0);
    const len = engine.step * 2;
    if (engine.isFree(r, d, s, len)) {
      engine.add({ id: `live${liveSeq++}`, sim: true, day: d, start: s, len, resourceIds: [engine.resources[r].id] });
      return 'add';
    }
  } else {
    const t = engine.roomTypes[(rand() * engine.roomTypes.length) | 0];
    const end = Math.min(engine.days, d + 1 + ((rand() * 3) | 0));
    if (engine.freeRooms(t.id, d, end) >= 1) {
      engine.add({ id: `live${liveSeq++}`, sim: true, day: d, endDay: end, type: t.id, rooms: 1 });
      return 'add';
    }
  }
  return null;
}
