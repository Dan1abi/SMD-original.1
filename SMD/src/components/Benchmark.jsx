import { useState } from 'react';
import { SlotEngine } from '../engine/slotEngine.js';
import { StayEngine } from '../engine/stayEngine.js';
import { simulate } from '../engine/simulate.js';
import { horizonStart } from '../engine/time.js';

/**
 * Страница „Оптимизация“: стрес тест с изкуствен бизнес с N ресурса и стотици хиляди резервации.
 * Сравнява индексирания двигател с наивен подход (масив от резервации, филтриран при всяка заявка).
 */
function syntheticCfg(n) {
  return {
    id: `bench-${n}`,
    mode: 'slot',
    stepMinutes: 30,
    leadMinutes: 0,
    hours: Array(7).fill('08:00-20:00'),
    resources: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `Ресурс ${i}`, capacity: 2 + (i % 5) })),
    questions: [],
    rules: { duration: { fixed: 60 }, match: [] },
    simulation: { occupancy: 0.35, lengths: [30, 60, 90, 120] },
  };
}

/** Наивен алгоритъм: за всеки ден филтрира целия масив резервации и проверява припокриване. */
function naiveYear(list, R, days, open, len, step) {
  const out = new Uint16Array(days);
  for (let d = 0; d < days; d++) {
    const today = list.filter((b) => b.day === d); // O(B) при всеки ден
    const byRes = new Map();
    for (const b of today) {
      const arr = byRes.get(b.r);
      arr ? arr.push(b) : byRes.set(b.r, [b]);
    }
    let count = 0;
    for (let s = open[0]; s + len <= open[1]; s += step) {
      let any = false;
      for (let r = 0; r < R && !any; r++) {
        const bs = byRes.get(r) || [];
        if (!bs.some((b) => b.start < s + len && s < b.start + b.len)) any = true;
      }
      if (any) count++;
    }
    out[d] = count;
  }
  return out;
}

function naiveStay(list, total, days, nights) {
  // за всяка дата на настаняване: обхожда всички резервации за всяка нощ
  let ok = 0;
  for (let a = 0; a + nights <= days; a++) {
    let worst = 0;
    for (let d = a; d < a + nights; d++) {
      let used = 0;
      for (const b of list) if (b.day <= d && d < b.endDay) used += b.rooms;
      worst = Math.max(worst, used);
    }
    if (total - worst > 0) ok++;
  }
  return ok;
}

const time = (fn) => {
  const t = performance.now();
  const v = fn();
  return [performance.now() - t, v];
};
const tick = () => new Promise((r) => setTimeout(r, 30));

export default function Benchmark() {
  const [n, setN] = useState(200);
  const [rows, setRows] = useState([]);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    const out = [];
    const push = (label, ms, note = '') => {
      out.push({ label, ms, note });
      setRows([...out]);
    };
    setRows([]);
    await tick();

    const cfg = syntheticCfg(n);
    const e = new SlotEngine(cfg, horizonStart());
    const [tGen, count] = time(() => simulate(e));
    push(`Генериране и индексиране на ${count.toLocaleString('bg-BG')} резервации`, tGen, `${n} ресурса × 365 дни × 96 слота = ${(e.occ.length / 1e6).toFixed(1)} M клетки`);
    await tick();

    const p = e.prepare({});
    const [tCold, sum] = time(() => e.yearSummary(p));
    push('Индексиран двигател: свободни часове за цялата година (студен кеш)', tCold, `${sum.filter((x) => x > 0).length} дни със свободни часове`);
    await tick();

    const [tWarm] = time(() => e.yearSummary(p));
    push('Същата заявка повторно (кеш на година + версия)', tWarm, 'O(1) — данните не са се променили');
    await tick();

    const f = e.firstAvailable(p, 1);
    const [tInc] = time(() => {
      e.book(p, f.day, f.start, { id: 'bench' });
      return e.yearSummary(p);
    });
    push('Нова резервация + обновяване на цялата година', tInc, 'инвалидира се само 1 ден от 365');
    await tick();

    const list = [];
    for (const b of e.bookings.values()) list.push({ day: b.day, start: b.start, len: b.len, r: e.rIndex.get(b.resourceIds[0]) });
    const [tNaive, ns] = time(() => naiveYear(list, n, e.days, [32, 80], p.len, e.step));
    const same = ns.every((v, i) => v === sum[i] || i === f.day || i === 0);
    push('Наивен подход: масив от резервации, филтриран при всяка заявка', tNaive, same ? '✓ същият резултат' : 'резултатите се различават');
    out.push({ label: 'Ускорение (студен индекс спрямо наивен)', ms: null, note: `× ${(tNaive / Math.max(tCold, 0.01)).toFixed(0)}`, strong: true });
    out.push({ label: 'Ускорение (кеширан спрямо наивен)', ms: null, note: `× ${(tNaive / Math.max(tWarm, 0.01)).toFixed(0)}`, strong: true });
    setRows([...out]);
    await tick();

    // Хотел: сегментно дърво срещу наивно сканиране
    const hotelCfg = { id: 'bench-hotel', mode: 'stay', maxNights: 30, roomTypes: [{ id: 'x', name: 'X', count: n, capacity: 2, price: 1 }], rules: { stay: { typeAnswer: 't', roomsAnswer: 'r', guestsAnswer: 'g' } }, simulation: { occupancy: 0.8 } };
    const h = new StayEngine(hotelCfg, horizonStart());
    const [tHGen, hc] = time(() => simulate(h));
    push(`Хотел: ${hc.toLocaleString('bg-BG')} престоя в сегментно дърво`, tHGen, `${n} стаи`);
    const hp = h.prepare({ t: 'x', r: 1 });
    const [tSeg, segOk] = time(() => {
      let ok = 0;
      for (let a = 0; a + 7 <= h.days; a++) if (h.freeRooms('x', a, a + 7) > 0) ok++;
      return ok;
    });
    push('Хотел: проверка на всички 7-дневни престои (сегментно дърво, O(log n))', tSeg, `${segOk} възможни дати`);
    const hlist = [...h.bookings.values()];
    const [tHN, nOk] = time(() => naiveStay(hlist, n, h.days, 7));
    push('Хотел: същото с наивно обхождане на всички резервации', tHN, nOk === segOk ? '✓ същият резултат' : 'различни');
    out.push({ label: 'Ускорение (хотел)', ms: null, note: `× ${(tHN / Math.max(tSeg, 0.01)).toFixed(0)}`, strong: true });
    setRows([...out]);
    void hp;
    setRunning(false);
  };

  return (
    <>
      <section className="hero">
        <h1>Оптимизация и производителност</h1>
        <p className="muted">Стрес тест в браузъра: изкуствен бизнес с много ресурси и стотици хиляди резервации. Сравнява индексирания двигател на системата с наивна реализация.</p>
      </section>
      <div className="card">
        <div className="bench-controls">
          <span>Брой ресурси:</span>
          <div className="seg">
            {[50, 100, 200, 500].map((v) => (
              <button key={v} className={n === v ? 'on' : ''} onClick={() => setN(v)} disabled={running}>
                {v}
              </button>
            ))}
          </div>
          <button className="btn primary" onClick={run} disabled={running}>
            {running ? 'Изпълнява се…' : '▶ Стартирай теста'}
          </button>
        </div>
        {rows.length > 0 && (
          <table className="bench">
            <thead>
              <tr><th>Операция</th><th>Време</th><th>Бележка</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className={r.strong ? 'strong' : ''}>
                  <td>{r.label}</td>
                  <td className="mono">{r.ms === null ? '' : `${r.ms.toFixed(r.ms < 1 ? 3 : 1)} ms`}</td>
                  <td>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="about-cols">
        <section className="card">
          <h3>Индекс на заетост</h3>
          <p>Плосък <code>Uint8Array</code> с размер ресурси × дни × 96 (15-минутни слотове). Проверка на клетка — O(1), без обекти и без GC.</p>
        </section>
        <section className="card">
          <h3>Алгоритъм за ден</h3>
          <p>Едно обхождане отзад напред изчислява „колко свободни слота има напред“ — всички начални часове за ресурс се намират за O(96).</p>
        </section>
        <section className="card">
          <h3>Кеш с точкова инвалидация</h3>
          <p>Резултатът за (изискване, ден) се пази с версия на деня. Нова резервация увеличава версията само на своя ден.</p>
        </section>
        <section className="card">
          <h3>Сегментно дърво за хотели</h3>
          <p>Престой [a, b) = една range-add операция; свободни стаи = общо − range-max. И двете O(log n).</p>
        </section>
      </div>
    </>
  );
}
