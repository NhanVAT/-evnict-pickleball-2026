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

test('số trận mỗi trọng tài cân bằng (10-11)', () => {
  const count = {};
  for (const uid of Object.values(plan)) count[byUid[uid]] = (count[byUid[uid]] ?? 0) + 1;
  assert.deepEqual(count, { 1: 11, 2: 10, 3: 10, 4: 11, 5: 10, 6: 10 });
});

// TT1-3 là nữ, TT4-6 là nam: nữ bắt Đôi Nữ, nam ưu tiên Đôi Nam (chỉ 3 trọng tài nam cho 4 bảng Đôi Nam)
test('trọng tài nữ bắt toàn bộ Đôi Nữ', () => {
  for (const m of t.matches.filter(x => x.event === 'WD')) assert.ok(byUid[plan[m.id]] <= 3, m.id);
});

test('trọng tài nam bắt Đôi Nam bảng A, B, C, bán kết và chung kết', () => {
  const male = id => byUid[plan[id]] >= 4;
  for (const m of t.matches.filter(x => x.event === 'MD' && ['A', 'B', 'C'].includes(x.group))) assert.ok(male(m.id), m.id);
  for (const id of ['MD-QF1', 'MD-QF2', 'MD-QF3', 'MD-SF1', 'MD-SF2', 'MD-F']) assert.ok(male(id), id);
});

test('trọng tài bảng bắt trọn bảng; các trận chung kết đúng người', () => {
  const who = id => byUid[plan[id]];
  for (const [ev, g, n] of [['MD', 'A', 4], ['MD', 'B', 5], ['MD', 'C', 6], ['MD', 'D', 3], ['WD', 'A', 1], ['WD', 'B', 2]]) {
    for (const m of t.matches.filter(x => x.event === ev && x.group === g)) assert.equal(who(m.id), n, m.id);
  }
  assert.deepEqual(['WD-F', 'MD-F', 'XD-F'].map(who), [3, 6, 2]);
});
