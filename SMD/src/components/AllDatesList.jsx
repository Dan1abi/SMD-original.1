import { memo, useMemo, useState } from 'react';
import { MONTHS, addDays, fmtDate, fmtSlot } from '../engine/time.js';

/**
 * Списък „Всички свободни дати и часове за годината“.
 * Мързеливо рендериране: часовете за даден месец се изчисляват и рендерират само когато месецът е отворен
 * (иначе това биха били хиляди бутони в DOM). Броят свободни дни на месец идва от вече кеширания yearSummary.
 */
function AllDatesList({ engine, req, summary, version, mode, onPickSlot, onPickDay }) {
  const months = useMemo(() => {
    const out = [];
    for (let d = 0; d < engine.days; d++) {
      const date = addDays(engine.start, d);
      const key = date.getFullYear() * 12 + date.getMonth();
      let m = out[out.length - 1];
      if (!m || m.key !== key) out.push((m = { key, title: `${MONTHS[date.getMonth()]} ${date.getFullYear()}`, days: [] }));
      m.days.push(d);
    }
    return out;
  }, [engine]);
  const [open, setOpen] = useState(() => new Set([months[0]?.key]));
  const toggle = (k) => setOpen((s) => {
    const n = new Set(s);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });

  return (
    <div className="alldates">
      {months.map((m) => {
        const freeDays = m.days.filter((d) => summary[d] > 0);
        const isOpen = open.has(m.key);
        return (
          <div key={m.key} className="acc">
            <button type="button" className="acc-head" onClick={() => toggle(m.key)} aria-expanded={isOpen}>
              <span>{isOpen ? '▾' : '▸'} {m.title}</span>
              <span className="muted small">{freeDays.length} свободни дни</span>
            </button>
            {isOpen && (
              <div className="acc-body" data-v={version}>
                {freeDays.length === 0 && <p className="muted small">Няма свободни дати този месец.</p>}
                {freeDays.map((d) => (
                  <div className="acc-row" key={d}>
                    <div className="acc-date">{fmtDate(addDays(engine.start, d))}</div>
                    {mode === 'stay' ? (
                      <div className="chips">
                        <span className="muted small">{summary[d]} свободни стаи от избрания тип</span>
                        <button type="button" className="chip" onClick={() => onPickDay(d)}>
                          Настаняване тази дата
                        </button>
                      </div>
                    ) : (
                      <div className="chips">
                        {engine.daySlots(req, d).map((s) => (
                          <button type="button" key={s} className="chip time" onClick={() => onPickSlot(d, s)}>
                            {fmtSlot(s)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default memo(AllDatesList);
