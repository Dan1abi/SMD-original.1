// Време и календар. Всичко е дискретизирано на слотове от 15 минути.
export const SLOT_MIN = 15;
export const SLOTS_PER_DAY = 1440 / SLOT_MIN; // 96
export const HORIZON_DAYS = 365;

export const WEEKDAYS = ['Неделя', 'Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота'];
export const WEEKDAYS_SHORT = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
export const MONTHS = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни', 'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'];
export const MONTHS_LOWER = MONTHS.map((m) => m.toLowerCase());

const pad = (n) => String(n).padStart(2, '0');

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
/** Брой календарни дни между a и b (устойчиво на лятно/зимно часово време). */
export function dayDiff(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}
export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function fromISO(s) {
  const [y, m, dd] = s.split('-').map(Number);
  return new Date(y, m - 1, dd);
}
export function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
export function fmtMin(min) {
  return `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
}
export const fmtSlot = (s) => fmtMin(s * SLOT_MIN);

export function fmtDate(d) {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_LOWER[d.getMonth()]} ${d.getFullYear()} г.`;
}
export function fmtDateShort(d) {
  return `${d.getDate()} ${MONTHS_LOWER[d.getMonth()]}`;
}

/**
 * Работно време: масив от 7 низа (индекс 0 = неделя), напр. '09:00-13:00,14:00-19:00' или null (почивен ден).
 * Връща за всеки ден от седмицата битова маска на отворените слотове (Uint8Array) или null.
 */
export function parseHours(hours) {
  return hours.map((spec) => {
    if (!spec) return null;
    const mask = new Uint8Array(SLOTS_PER_DAY);
    const intervals = spec.split(',').map((part) => part.trim().split('-').map(toMin));
    let open = 0;
    for (const [a, b] of intervals) {
      for (let s = a / SLOT_MIN; s < b / SLOT_MIN; s++) {
        if (!mask[s]) open++;
        mask[s] = 1;
      }
    }
    return { mask, intervals, open };
  });
}

/** Началото на хоризонта (днес) — фиксира се при зареждане на приложението. */
const HORIZON_START = startOfDay();
export const horizonStart = () => HORIZON_START;
export const dayToDate = (day) => addDays(HORIZON_START, day);
export const dateToDay = (date) => dayDiff(HORIZON_START, date);
