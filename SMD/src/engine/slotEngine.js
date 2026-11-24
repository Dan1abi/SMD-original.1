import { SLOT_MIN, SLOTS_PER_DAY, HORIZON_DAYS, parseHours, addDays, toISO } from './time.js';
import { computeDuration, computeQuantity, matchResource } from './rules.js';

const EMPTY = Object.freeze([]);

/**
 * Двигател за бизнеси с часови слотове (ресторант, салон, сервиз, ...).
 *
 * Структури от данни (всички плоски типизирани масиви — без GC натиск, кеш-приятелски):
 *   occ[(r*days + d)*S + s]  — 1 ако слот s от ден d на ресурс r е зает           O(1) достъп
 *   freeCnt[r*days + d]      — брой свободни работни слотове на ресурс r в ден d (бърз pruning)
 *   resOpen[r*days + d]      — работи ли ресурсът този ден (сезонност, напр. градина)
 *   dayVersion[d]            — увеличава се при всяка промяна в ден d (точкова инвалидация на кеша)
 *   byDay[d]                 — Set от id на резервациите в ден d (за отказ/изместване)
 */
export class SlotEngine {
  constructor(cfg, start, days = HORIZON_DAYS) {
    this.mode = 'slot';
    this.cfg = cfg;
    this.start = start;
    this.days = days;
    const S = (this.S = SLOTS_PER_DAY);
    this.resources = cfg.resources;
    const R = (this.R = cfg.resources.length);
    this.rIndex = new Map(cfg.resources.map((r, i) => [r.id, i]));
    this.hours = parseHours(cfg.hours);
    this.step = Math.max(1, (cfg.stepMinutes || 30) / SLOT_MIN);
    this.lead = cfg.leadMinutes ?? 60;

    this.weekday = new Uint8Array(days);
    this.month = new Uint8Array(days);
    this.iso = new Array(days);
    const closed = new Set(cfg.closedDates || []);
    this.closedDay = new Uint8Array(days);
    for (let d = 0; d < days; d++) {
      const date = addDays(start, d);
      this.weekday[d] = date.getDay();
      this.month[d] = date.getMonth() + 1;
      this.iso[d] = toISO(date);
      if (closed.has(this.iso[d].slice(5))) this.closedDay[d] = 1; // формат 'MM-DD'
    }

    this.occ = new Uint8Array(R * days * S);
    this.freeCnt = new Uint16Array(R * days);
    this.resOpen = new Uint8Array(R * days);
    for (let r = 0; r < R; r++) {
      const months = this.resources[r].months;
      for (let d = 0; d < days; d++) {
        const h = this.hours[this.weekday[d]];
        const open = h && !this.closedDay[d] && (!months || months.includes(this.month[d]));
        if (open) {
          this.resOpen[r * days + d] = 1;
          this.freeCnt[r * days + d] = h.open;
        }
      }
    }

    this.dayVersion = new Uint32Array(days);
    this.byDay = Array.from({ length: days }, () => new Set());
    this.bookings = new Map();
    this.cache = new Map();
    this.version = 0;
    this.listeners = new Set();
    // буфери за многократна употреба — алгоритъмът за ден не заделя памет
    this._run = new Uint16Array(S + 1);
    this._counts = new Uint16Array(S);
  }

  // ---------- външен store (useSyncExternalStore) ----------
  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  emit() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  // ---------- изисквания ----------
  /** Превръща отговорите от формуляра в компактно изискване + ключ за кеша. */
  prepare(answers) {
    const duration = computeDuration(this.cfg, answers);
    const len = Math.ceil(duration / SLOT_MIN);
    const qty = computeQuantity(this.cfg, answers);
    const cand = [];
    for (let r = 0; r < this.R; r++) if (matchResource(this.cfg, answers, this.resources[r])) cand.push(r);
    // Ключът зависи само от ефекта на отговорите (дължина, брой, кандидати), не от самите отговори —
    // различни отговори със същия ефект споделят кеша.
    return { key: `${len}|${qty}|${cand.join(',')}`, len, qty, duration, cand: Int32Array.from(cand) };
  }

  // ---------- заявки ----------
  isFree(r, d, s, len) {
    if (!this.resOpen[r * this.days + d]) return false;
    const h = this.hours[this.weekday[d]];
    if (!h || s < 0 || s + len > this.S) return false;
    const base = (r * this.days + d) * this.S;
    for (let i = s; i < s + len; i++) if (this.occ[base + i] || !h.mask[i]) return false;
    return true;
  }

  _minStart(d) {
    if (d !== 0) return 0;
    const now = new Date();
    return Math.ceil((now.getHours() * 60 + now.getMinutes() + this.lead) / SLOT_MIN);
  }

  /**
   * Всички свободни начални слотове за ден d. Сложност O(|кандидати| · S), S = 96.
   * За всеки ресурс се изчислява „дължина на свободния интервал напред“ run[i] с едно обхождане отзад напред;
   * началото s е валидно, ако run[s] ≥ len. Резултатът се кешира до следваща промяна в същия ден.
   */
  daySlots(p, d) {
    if (d < 0 || d >= this.days) return EMPTY;
    const ck = p.key + '|' + d;
    if (d !== 0) {
      const hit = this.cache.get(ck);
      if (hit && hit.v === this.dayVersion[d]) return hit.slots;
    }
    const h = this.hours[this.weekday[d]];
    let slots = EMPTY;
    if (h && !this.closedDay[d] && p.cand.length >= p.qty) {
      const { S, days, occ, step } = this;
      const mask = h.mask;
      const run = this._run;
      const counts = this._counts;
      counts.fill(0);
      const len = p.len;
      const need = this._validStarts(h, len);
      let satisfied = 0;
      let any = false;
      for (let k = 0; k < p.cand.length && satisfied < need; k++) {
        const r = p.cand[k];
        const rd = r * days + d;
        if (!this.resOpen[rd] || this.freeCnt[rd] < len) continue; // pruning без обхождане
        const base = rd * S;
        run[S] = 0;
        for (let i = S - 1; i >= 0; i--) run[i] = mask[i] && !occ[base + i] ? run[i + 1] + 1 : 0;
        for (let s = 0; s <= S - len; s += step) {
          if (run[s] >= len) {
            // ранно прекъсване: щом всеки възможен начален час е покрит от qty ресурса, спираме
            if (++counts[s] === p.qty) satisfied++;
            any = true;
          }
        }
      }
      if (any) {
        const out = [];
        const min = this._minStart(d);
        for (let s = 0; s < S; s += step) if (s >= min && counts[s] >= p.qty) out.push(s);
        slots = out;
      }
    }
    if (d !== 0) {
      if (this.cache.size > 50000) this.cache.clear(); // грубо ограничение на паметта
      this.cache.set(ck, { v: this.dayVersion[d], slots });
    }
    return slots;
  }

  /** Колко начални часа изобщо са възможни в работното време за дължина len (кешира се по ден от седмицата). */
  _validStarts(h, len) {
    h.valid ||= new Map();
    let v = h.valid.get(len);
    if (v === undefined) {
      v = 0;
      for (let s = 0; s <= this.S - len; s += this.step) {
        let ok = true;
        for (let i = s; i < s + len && ok; i++) ok = h.mask[i] === 1;
        if (ok) v++;
      }
      h.valid.set(len, v);
    }
    return v;
  }

  /** Брой свободни начални часове за всеки ден от годината. Повторно извикване ≈ O(365) благодарение на кеша. */
  yearSummary(p) {
    // ниво 1: цялата година е непроменена от последното извикване → O(1)
    const yc = this._yearCache?.get(p.key);
    if (yc && yc.v === this.version && yc.minute === Math.floor(Date.now() / 60000)) return yc.data;
    const out = new Uint16Array(this.days);
    // ниво 2: кеш по ден — преизчисляват се само дните с променена версия
    for (let d = 0; d < this.days; d++) out[d] = this.daySlots(p, d).length;
    (this._yearCache ||= new Map()).set(p.key, { v: this.version, minute: Math.floor(Date.now() / 60000), data: out });
    return out;
  }

  firstAvailable(p, fromDay = 0) {
    for (let d = Math.max(0, fromDay); d < this.days; d++) {
      const s = this.daySlots(p, d);
      if (s.length) return { day: d, start: s[0] };
    }
    return null;
  }

  // ---------- запис ----------
  /** Избира конкретни ресурси за [s, s+len). Стратегия от конфигурацията. */
  allocate(p, d, s) {
    const free = [];
    for (const r of p.cand) if (this.isFree(r, d, s, p.len)) free.push(r);
    if (free.length < p.qty) return null;
    const days = this.days;
    if (this.cfg.allocation === 'bestFit') {
      // най-малката подходяща маса/ресурс → големите остават за големи групи
      free.sort((a, b) => (this.resources[a].capacity || 0) - (this.resources[b].capacity || 0) || this.freeCnt[a * days + d] - this.freeCnt[b * days + d]);
    } else {
      // балансиране: най-слабо натовареният специалист за деня
      free.sort((a, b) => this.freeCnt[b * days + d] - this.freeCnt[a * days + d]);
    }
    return free.slice(0, p.qty);
  }

  _mark(r, d, s, len, val) {
    const rd = r * this.days + d;
    const base = rd * this.S;
    const mask = this.hours[this.weekday[d]]?.mask;
    for (let i = s; i < s + len; i++) {
      this.occ[base + i] = val;
      if (mask && mask[i]) this.freeCnt[rd] += val ? -1 : 1;
    }
  }

  /** Добавя резервация. force=true изтласква конфликтни симулирани резервации (потребителските имат приоритет). */
  add(b, { silent = false, force = false } = {}) {
    const rs = b.resourceIds.map((id) => this.rIndex.get(id));
    if (rs.some((r) => r === undefined)) return false;
    for (const r of rs) {
      if (!this.isFree(r, b.day, b.start, b.len)) {
        if (!force) return false;
        this._evict(r, b.day, b.start, b.len);
      }
    }
    for (const r of rs) this._mark(r, b.day, b.start, b.len, 1);
    this.bookings.set(b.id, b);
    this.byDay[b.day].add(b.id);
    this.dayVersion[b.day]++;
    if (!silent) this.emit();
    return true;
  }

  _evict(r, d, s, len) {
    const rid = this.resources[r].id;
    for (const id of [...this.byDay[d]]) {
      const o = this.bookings.get(id);
      if (o.sim && o.resourceIds.includes(rid) && o.start < s + len && s < o.start + o.len) this.remove(id, { silent: true });
    }
  }

  remove(id, { silent = false } = {}) {
    const b = this.bookings.get(id);
    if (!b) return false;
    for (const rid of b.resourceIds) this._mark(this.rIndex.get(rid), b.day, b.start, b.len, 0);
    this.bookings.delete(id);
    this.byDay[b.day].delete(id);
    this.dayVersion[b.day]++;
    if (!silent) this.emit();
    return true;
  }

  book(p, d, s, meta = {}) {
    const rs = this.allocate(p, d, s);
    if (!rs) return null;
    const b = { id: meta.id || `u-${Date.now().toString(36)}`, day: d, start: s, len: p.len, resourceIds: rs.map((r) => this.resources[r].id), ...meta };
    return this.add(b) ? b : null;
  }

  stats() {
    let sim = 0;
    for (const b of this.bookings.values()) if (b.sim) sim++;
    return { bookings: this.bookings.size, simulated: sim, resources: this.R, cells: this.occ.length };
  }
}
