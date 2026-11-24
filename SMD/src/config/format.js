import { WEEKDAYS, dayToDate, fmtDate, fmtSlot, fmtMin, SLOT_MIN } from '../engine/time.js';
import { formatAnswer, isVisible } from '../engine/rules.js';

export function hoursRows(cfg) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((i) => ({ day: WEEKDAYS[i], text: cfg.hours[i] ? cfg.hours[i].replaceAll('-', '–').replaceAll(',', ', ') : 'почивен ден' }));
}

export const money = (v) => (v === null || v === undefined ? '—' : `${v.toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);

export function answerLines(cfg, answers) {
  return cfg.questions.filter((q) => isVisible(q, answers)).map((q) => ({ label: q.label, value: formatAnswer(q, answers[q.id]) }));
}

export function whenText(cfg, sel, len) {
  if (cfg.mode === 'stay') {
    return {
      checkIn: `${fmtDate(dayToDate(sel.day))} от ${cfg.checkInTime} ч.`,
      checkOut: `${fmtDate(dayToDate(sel.end))} до ${cfg.checkOutTime} ч.`,
    };
  }
  return { date: fmtDate(dayToDate(sel.day)), time: `${fmtSlot(sel.start)} – ${fmtMin((sel.start + len) * SLOT_MIN)}` };
}

export function bookingCode(prefix) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[(Math.random() * alphabet.length) | 0];
  return `${prefix}-${s}`;
}

export function pluralNights(n) {
  return n === 1 ? '1 нощувка' : `${n} нощувки`;
}
