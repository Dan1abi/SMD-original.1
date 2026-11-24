import { SlotEngine } from './slotEngine.js';
import { StayEngine } from './stayEngine.js';
import { simulate } from './simulate.js';
import { horizonStart, dateToDay, fromISO, SLOT_MIN } from './time.js';

/**
 * Регистър на двигателите. Всеки бизнес получава собствен двигател,
 * създаден МЪРЗЕЛИВО — при първото отваряне на бизнеса (а не при стартиране на приложението).
 * Двигателите живеят извън React state → промяна в тях не преизчертава цялото дърво,
 * а само компонентите, абонирани чрез useSyncExternalStore.
 */
const engines = new Map();

export function peekEngine(id) {
  return engines.get(id) || null;
}

export function getEngine(cfg, userBookings = []) {
  let e = engines.get(cfg.id);
  if (e) return e;
  const t0 = performance.now();
  e = cfg.mode === 'stay' ? new StayEngine(cfg, horizonStart()) : new SlotEngine(cfg, horizonStart());
  const simulated = simulate(e);
  const t1 = performance.now();
  for (const b of userBookings) if (b.bizId === cfg.id && b.status === 'confirmed') applyUserBooking(e, b);
  e.buildMs = t1 - t0;
  e.simulated = simulated;
  engines.set(cfg.id, e);
  return e;
}

/** Превръща запазена (абсолютни дати) потребителска резервация в запис на двигателя. */
export function applyUserBooking(e, b) {
  if (e.mode === 'stay') {
    const a = dateToDay(fromISO(b.checkIn));
    const z = dateToDay(fromISO(b.checkOut));
    if (z <= 0 || a >= e.days) return false;
    return e.add({ id: b.id, day: Math.max(0, a), endDay: Math.min(e.days, z), type: b.roomType, rooms: b.rooms }, { silent: true, force: true });
  }
  const d = dateToDay(fromISO(b.date));
  if (d < 0 || d >= e.days) return false;
  return e.add(
    { id: b.id, day: d, start: b.startMin / SLOT_MIN, len: (b.endMin - b.startMin) / SLOT_MIN, resourceIds: b.resourceIds },
    { silent: true, force: true }
  );
}
