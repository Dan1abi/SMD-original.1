/**
 * Сегментно дърво с „range add / range max“ и мързеливи добавки без push-down.
 * Използва се за хотели: стойността в лист d = колко стаи от даден тип са заети в нощта d.
 *   - резервация [checkIn, checkOut) -> add(checkIn, checkOut-1, rooms)   O(log n)
 *   - свободни стаи за престой       -> total - max(checkIn, checkOut-1)  O(log n)
 * Инвариант: mx[node] = lz[node] + max(mx[ляво], mx[дясно]).
 */
export class SegmentTree {
  constructor(n) {
    let size = 1;
    while (size < n) size <<= 1;
    this.n = n;
    this.size = size;
    this.mx = new Int32Array(2 * size);
    this.lz = new Int32Array(2 * size);
  }

  add(l, r, v) {
    if (l > r) return;
    this._add(1, 0, this.size - 1, l, r, v);
  }

  _add(node, nl, nr, l, r, v) {
    if (r < nl || nr < l) return;
    if (l <= nl && nr <= r) {
      this.mx[node] += v;
      this.lz[node] += v;
      return;
    }
    const mid = (nl + nr) >> 1;
    this._add(node * 2, nl, mid, l, r, v);
    this._add(node * 2 + 1, mid + 1, nr, l, r, v);
    this.mx[node] = this.lz[node] + Math.max(this.mx[node * 2], this.mx[node * 2 + 1]);
  }

  max(l, r) {
    if (l > r) return 0;
    return this._max(1, 0, this.size - 1, l, r);
  }

  _max(node, nl, nr, l, r) {
    if (r < nl || nr < l) return -Infinity;
    if (l <= nl && nr <= r) return this.mx[node];
    const mid = (nl + nr) >> 1;
    return this.lz[node] + Math.max(this._max(node * 2, nl, mid, l, r), this._max(node * 2 + 1, mid + 1, nr, l, r));
  }

  point(i) {
    return this.max(i, i);
  }
}
