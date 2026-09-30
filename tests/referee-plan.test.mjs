import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planAssign } from '../tools/referee-plan.mjs';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const t = read('../public/data/tournament.json');
const refs = read('../public/data/referees.json');
const plan = planAssign(t, refs);
const byUid = Object.fromEntries(refs.map(r => [r.uid, r.id]));

test('phân công đủ 62 trận', () => {
  assert.equal(Object.keys(plan).length, 62);
  for (const m of t.matches) assert.ok(byUid[plan[m.id]], m.id);
});

test('không trọng tài nào bắt 2 trận cùng lượt', () => {
  const seen = new Set();
  for (const m of t.matches) {
    const k = `${m.round}-${plan[m.id]}`;
    assert.ok(!seen.has(k), `TT${byUid[plan[m.id]]} trùng lượt ${m.round}`);
    seen.add(k);
  }
});

test('số trận mỗi trọng tài như đã chốt 30/09', () => {
  const count = {};
  for (const uid of Object.values(plan)) count[byUid[uid]] = (count[byUid[uid]] ?? 0) + 1;
  assert.deepEqual(count, { 1: 11, 2: 11, 3: 10, 4: 9, 5: 11, 6: 10 });
});

test('trọng tài bảng bắt trọn bảng; các trận chung kết đúng người', () => {
  const who = id => byUid[plan[id]];
  for (const m of t.matches.filter(x => x.event === 'MD' && x.group === 'A')) assert.equal(who(m.id), 1);
  for (const m of t.matches.filter(x => x.event === 'WD' && x.group === 'A')) assert.equal(who(m.id), 5);
  assert.deepEqual(['WD-F', 'MD-F', 'XD-F'].map(who), [4, 3, 6]);
});
