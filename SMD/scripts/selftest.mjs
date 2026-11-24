// Бърз тест на алгоритмите без браузър:  npm run test:engine
import assert from 'node:assert/strict';
import { BUSINESSES } from '../src/config/businesses.js';
import { getEngine } from '../src/engine/registry.js';
import { defaultAnswers, validateAnswers, computePrice } from '../src/engine/rules.js';
import { SegmentTree } from '../src/engine/segmentTree.js';

const t = (name, fn) => {
  try {
    fn();
    console.log('  ✔', name);
  } catch (e) {
    console.error('  ✘', name, '\n   ', e.message);
    process.exitCode = 1;
  }
};

console.log('Сегментно дърво');
t('range add / range max срещу наивен масив', () => {
  const n = 365;
  const st = new SegmentTree(n);
  const arr = new Array(n).fill(0);
  for (let k = 0; k < 2000; k++) {
    const a = (Math.random() * n) | 0;
    const b = Math.min(n - 1, a + ((Math.random() * 10) | 0));
    const v = (Math.random() * 3) | 0 || 1;
    st.add(a, b, v);
    for (let i = a; i <= b; i++) arr[i] += v;
    const l = (Math.random() * n) | 0;
    const r = Math.min(n - 1, l + ((Math.random() * 40) | 0));
    assert.equal(st.max(l, r), Math.max(...arr.slice(l, r + 1)));
  }
});

for (const cfg of BUSINESSES) {
  console.log(`${cfg.icon} ${cfg.name}`);
  const t0 = performance.now();
  const e = getEngine(cfg);
  const build = performance.now() - t0;
  const a = defaultAnswers(cfg);
  if (cfg.id === 'autoservice') a.car = 'Škoda Octavia';
  if (cfg.id === 'vet') a.petName = 'Рекс';
  t('валидни отговори по подразбиране', () => assert.deepEqual(validateAnswers(cfg, a), {}));
  const p = e.prepare(a);
  const t1 = performance.now();
  const sum = e.yearSummary(p);
  const cold = performance.now() - t1;
  const t2 = performance.now();
  e.yearSummary(p);
  const warm = performance.now() - t2;
  const freeDays = sum.filter((x) => x > 0).length;
  t(`има свободни дни (${freeDays}/365)`, () => assert.ok(freeDays > 30));

  if (e.mode === 'slot') {
    const first = e.firstAvailable(p, 1);
    const before = e.daySlots(p, first.day).length;
    const b = e.book(p, first.day, first.start, { id: 'test-1' });
    t('резервация заема ресурс', () => assert.ok(b && b.resourceIds.length === p.qty));
    t('кешът се инвалидира само за засегнатия ден', () => {
      const after = e.daySlots(p, first.day);
      assert.ok(after.length <= before);
      // няма двойно записване на същия ресурс
      for (const rid of b.resourceIds) assert.equal(e.isFree(e.rIndex.get(rid), first.day, first.start, p.len), false);
    });
    e.remove('test-1');
    t('отмяната освобождава слота', () => assert.equal(e.daySlots(p, first.day).length, before));
  } else {
    const first = e.firstAvailable(p, 1);
    const out = e.maxCheckout(p, first.day);
    t('има поне 1 нощ', () => assert.ok(out > first.day));
    const free = e.freeRooms(p.type, first.day, first.day + 1);
    e.book(p, first.day, first.day + 1, { id: 'test-h' });
    t('свободните стаи намаляват', () => assert.equal(e.freeRooms(p.type, first.day, first.day + 1), free - p.rooms));
    e.remove('test-h');
    t('цена за 3 нощувки', () => assert.ok(computePrice(cfg, a, 3) > 0));
  }
  console.log(`    ⏱ генериране ${build.toFixed(1)} ms · ${e.stats().bookings} резервации · година (студено) ${cold.toFixed(2)} ms · (кеш) ${warm.toFixed(3)} ms`);
}
