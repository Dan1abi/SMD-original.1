import { memo } from 'react';
import { fmtSlot, SLOT_MIN } from '../engine/time.js';

const PARTS = [
  { label: '🌅 Сутрин', to: 12 * 60 },
  { label: '☀️ След обед', to: 17 * 60 },
  { label: '🌙 Вечер', to: 24 * 60 },
];

function TimeSlots({ slots, selected, onPick }) {
  if (!slots.length) return <p className="muted">Няма свободни часове за този ден.</p>;
  let from = 0;
  return (
    <div className="slots">
      {PARTS.map((p) => {
        const list = slots.filter((s) => s * SLOT_MIN >= from && s * SLOT_MIN < p.to);
        from = p.to;
        if (!list.length) return null;
        return (
          <div key={p.label} className="slot-group">
            <div className="slot-label">{p.label}</div>
            <div className="chips">
              {list.map((s) => (
                <button type="button" key={s} className={s === selected ? 'chip time on' : 'chip time'} onClick={() => onPick(s)}>
                  {fmtSlot(s)}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default memo(TimeSlots);
