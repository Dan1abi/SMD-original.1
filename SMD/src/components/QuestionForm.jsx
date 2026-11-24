import { memo } from 'react';
import { isVisible } from '../engine/rules.js';

/** Генеричен формуляр: рендерира въпросите от конфигурацията, без да знае за конкретния бизнес. */
function Field({ q, value, error, onChange }) {
  let input;
  switch (q.type) {
    case 'number': {
      const n = Number(value) || 0;
      input = (
        <div className="stepper">
          <button type="button" onClick={() => onChange(q.id, Math.max(q.min, n - 1))} aria-label="Намали">−</button>
          <input type="number" min={q.min} max={q.max} value={value} onChange={(e) => onChange(q.id, e.target.value === '' ? '' : Number(e.target.value))} />
          <button type="button" onClick={() => onChange(q.id, Math.min(q.max, n + 1))} aria-label="Увеличи">+</button>
        </div>
      );
      break;
    }
    case 'radio':
      input = (
        <div className="seg" role="radiogroup">
          {q.options.map((o) => (
            <button type="button" key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(q.id, o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      );
      break;
    case 'select':
      input = (
        <select value={value} onChange={(e) => onChange(q.id, e.target.value)}>
          {q.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'multi': {
      const list = Array.isArray(value) ? value : [];
      const toggle = (o) => {
        let next;
        if (o.exclusive) next = list.includes(o.value) ? [] : [o.value];
        else {
          const base = list.filter((v) => !q.options.find((x) => x.value === v)?.exclusive);
          next = base.includes(o.value) ? base.filter((v) => v !== o.value) : [...base, o.value];
        }
        onChange(q.id, next);
      };
      input = (
        <div className="chips">
          {q.options.map((o) => (
            <button type="button" key={o.value} aria-pressed={list.includes(o.value)} className={list.includes(o.value) ? 'chip on' : 'chip'} onClick={() => toggle(o)}>
              {list.includes(o.value) ? '✓ ' : ''}
              {o.label}
            </button>
          ))}
        </div>
      );
      break;
    }
    case 'textarea':
      input = <textarea rows={2} value={value} placeholder={q.placeholder} onChange={(e) => onChange(q.id, e.target.value)} />;
      break;
    default:
      input = <input value={value} placeholder={q.placeholder} onChange={(e) => onChange(q.id, e.target.value)} />;
  }
  return (
    <div className="field">
      <span>
        {q.label}
        {q.required && <em className="req"> *</em>}
      </span>
      {input}
      {q.help && <small className="muted">{q.help}</small>}
      {error && <span className="err">{error}</span>}
    </div>
  );
}

function QuestionForm({ cfg, answers, errors, onChange }) {
  return (
    <div className="qform">
      {cfg.mode === 'stay' && (
        <div className="notice">
          🕐 <b>Настаняване от {cfg.checkInTime} ч.</b> · <b>Напускане до {cfg.checkOutTime} ч.</b>
          <br />
          <span className="small">Датите на настаняване и напускане избирате от календара вдясно.</span>
        </div>
      )}
      {cfg.questions
        .filter((q) => isVisible(q, answers))
        .map((q) => (
          <Field key={q.id} q={q} value={answers[q.id]} error={errors[q.id]} onChange={onChange} />
        ))}
    </div>
  );
}

export default memo(QuestionForm);
