import { memo, useMemo } from 'react';
import { MONTHS, WEEKDAYS_SHORT, addDays } from '../engine/time.js';

/**
 * Годишен календар (365 дни наведнъж).
 * Оптимизации:
 *  - структурата на месеците се изчислява веднъж (useMemo без зависимости от данните);
 *  - DayCell е memo и получава само примитиви → при промяна в един ден се преизчертава само той;
 *  - един onClick на контейнера (event delegation) вместо 365 функции.
 */
const DayCell = memo(function DayCell({ d, n, cls, title }) {
  return (
    <button type="button" data-day={d} className={`day ${cls}`} title={title} disabled={cls.includes('off')}>
      {n}
    </button>
  );
});

function buildMonths(start, days) {
  const months = [];
  let cur = null;
  for (let d = 0; d < days; d++) {
    const date = addDays(start, d);
    const key = date.getFullYear() * 12 + date.getMonth();
    if (!cur || cur.key !== key) {
      // празни клетки до първия ден (седмицата започва в понеделник)
      const first = new Date(date.getFullYear(), date.getMonth(), 1);
      const lead = (first.getDay() + 6) % 7;
      cur = { key, title: `${MONTHS[date.getMonth()]} ${date.getFullYear()}`, lead, offset: date.getDate() - 1, cells: [] };
      months.push(cur);
    }
    cur.cells.push({ d, n: date.getDate() });
  }
  return months;
}

const WEEK_HEAD = [1, 2, 3, 4, 5, 6, 0].map((i) => WEEKDAYS_SHORT[i]);

function YearCalendar({ start, days, cellInfo, onPick }) {
  const months = useMemo(() => buildMonths(start, days), [start, days]);
  const onClick = (e) => {
    const el = e.target.closest('[data-day]');
    if (el && !el.disabled) onPick(Number(el.dataset.day));
  };
  return (
    <div className="year" onClick={onClick}>
      {months.map((m) => (
        <div className="month" key={m.key}>
          <div className="month-title">{m.title}</div>
          <div className="week-head">
            {WEEK_HEAD.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="month-grid">
            {Array.from({ length: m.lead + m.offset }, (_, i) => (
              <span key={'e' + i} className="day empty" />
            ))}
            {m.cells.map(({ d, n }) => {
              const [cls, title] = cellInfo(d);
              return <DayCell key={d} d={d} n={n} cls={cls} title={title} />;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default memo(YearCalendar);
