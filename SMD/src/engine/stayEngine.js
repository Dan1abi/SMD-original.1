import { HORIZON_DAYS } from './time.js';
import { SegmentTree } from './segmentTree.js';

/**
 * Двигател за престои по нощувки (хотел). Модел „инвентар по тип стая“:
 * вместо да следим всяка физическа стая, следим колко стаи от тип T са заети всяка нощ.
 * Така всяка резервация е една range-add операция в сегментно дърво — O(log n).
 */
export class StayEngine {
  constructor(cfg, start, days = HORIZON_DAYS) {
    this.mode = 'stay';
    this.cfg = cfg;
    this.start = start;
    this.days = days;
    this.roomTypes = cfg.roomTypes;
    this.types = new Map(cfg.roomTypes.map((t) => [t.id, t]));
    this.trees = new Map(cfg.roomTypes.map((t) => [t.id, new SegmentTree(days)]));
    this.bookings = new Map();
    this.cache = new Map();
    this.version = 0;
    this.listeners = new Set();
    this.maxNights = cfg.maxNights || 30;
  }

  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  emit() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  prepare(answers) {
    const s = this.cfg.rules.stay;
    const type = answers[s.typeAnswer];
    const rooms = Math.max(1, Number(answers[s.roomsAnswer]) || 1);
    return { key: `${type}|${rooms}`, type, rooms, valid: this.types.has(type) };
  }

  /** Свободни стаи от тип за престой [a, b) — O(log n). */
  freeRooms(type, a, b) {
    const t = this.types.get(type);
    if (!t || a < 0 || b > this.days || b <= a) return 0;
    return t.count - this.trees.get(type).max(a, b - 1);
  }

  /** За всяка дата: колко стаи от избрания тип са свободни за поне 1 нощ (0 ако < нужните). */
  yearSummary(p) {
    const ck = p.key;
    const hit = this.cache.get(ck);
    if (hit && hit.v === this.version) return hit.data;
    const out = new Uint16Array(this.days);
    if (p.valid) {
      for (let d = 0; d < this.days - 1; d++) {
        const f = this.freeRooms(p.type, d, d + 1);
        out[d] = f >= p.rooms ? f : 0;
      }
    }
    this.cache.set(ck, { v: this.version, data: out });
    return out;
  }

  /** Най-късната възможна дата на напускане при настаняване в ден a (инкрементален running max). */
  maxCheckout(p, a) {
    if (!p.valid) return a;
    const t = this.types.get(p.type);
    const tree = this.trees.get(p.type);
    let worst = 0;
    let b = a;
    while (b < this.days - 0 && b - a < this.maxNights) {
      worst = Math.max(worst, tree.point(b));
      if (t.count - worst < p.rooms) break;
      b++;
    }
    return b; // нощите са [a, b) → напускане в ден b
  }

  firstAvailable(p, fromDay = 0) {
    const s = this.yearSummary(p);
    for (let d = Math.max(0, fromDay); d < this.days; d++) if (s[d]) return { day: d };
    return null;
  }

  add(b, { silent = false, force = false } = {}) {
    if (!this.types.has(b.type)) return false;
    if (!force && this.freeRooms(b.type, b.day, b.endDay) < b.rooms) return false;
    this.trees.get(b.type).add(b.day, b.endDay - 1, b.rooms);
    this.bookings.set(b.id, b);
    if (!silent) this.emit();
    else this.version++;
    return true;
  }

  remove(id, { silent = false } = {}) {
    const b = this.bookings.get(id);
    if (!b) return false;
    this.trees.get(b.type).add(b.day, b.endDay - 1, -b.rooms);
    this.bookings.delete(id);
    if (!silent) this.emit();
    else this.version++;
    return true;
  }

  book(p, a, b, meta = {}) {
    const bk = { id: meta.id || `u-${Date.now().toString(36)}`, day: a, endDay: b, type: p.type, rooms: p.rooms, ...meta };
    return this.add(bk) ? bk : null;
  }

  stats() {
    let sim = 0;
    for (const b of this.bookings.values()) if (b.sim) sim++;
    const rooms = this.roomTypes.reduce((s, t) => s + t.count, 0);
    return { bookings: this.bookings.size, simulated: sim, resources: rooms, cells: this.days * this.roomTypes.length };
  }
}
