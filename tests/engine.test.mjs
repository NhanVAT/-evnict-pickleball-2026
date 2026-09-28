import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildView, computeGroup, nameOf } from '../public/js/engine.js';

const t = JSON.parse(readFileSync(new URL('../public/data/tournament.json', import.meta.url), 'utf8'));
const done = (s1, s2) => ({ s1, s2, status: 'done' });
const groupIds = (ev, g) => t.matches.filter(m => m.event === ev && m.stage === 'G' && m.group === g).map(m => m.id);
// Đội 1 luôn thắng 11-0 → thứ hạng đúng bằng thứ tự mã vị trí
const t1WinsAll = ev => Object.fromEntries(t.matches.filter(m => m.event === ev && m.stage === 'G').map(m => [m.id, done(11, 0)]));

test('nameOf ghép tên cặp', () => {
  assert.equal(nameOf(t, 'MD', 'A1'), 'Trần Công Hân - Lê Văn Ninh');
});

test('chưa có tỷ số: bảng chưa xong, mọi chỉ số bằng 0', () => {
  const g = computeGroup(t, 'MD', 'A', {});
  assert.equal(g.done, false);
  assert.equal(g.remaining, 6);
  assert.equal(g.total, 6);
  assert.deepEqual(g.rows.map(r => r.pts), [0, 0, 0, 0]);
});

test('xếp hạng theo điểm rồi hiệu số', () => {
  const ids = groupIds('MD', 'A'); // A1-A2, A3-A4, A1-A3, A2-A4, A1-A4, A2-A3
  const sc = [[11, 5], [11, 9], [7, 11], [11, 3], [11, 6], [11, 8]];
  const scores = Object.fromEntries(ids.map((id, i) => [id, done(...sc[i])]));
  const g = computeGroup(t, 'MD', 'A', scores);
  assert.equal(g.done, true);
  assert.deepEqual(g.rows.map(r => r.code), ['A1', 'A2', 'A3', 'A4']);
  assert.deepEqual(g.rows[0], { code: 'A1', played: 3, won: 2, lost: 1, pts: 6, pf: 29, pa: 22, diff: 7, rank: 1 });
  assert.equal(g.rows[2].diff, 3);
  assert.equal(g.pointsTie, true);      // A1, A2, A3 cùng 6 điểm
  assert.equal(g.needsTiebreak, false); // nhưng hiệu số khác nhau
});

test('trận đang đấu hoặc tỷ số hòa chưa được tính', () => {
  const [a, b] = groupIds('MD', 'A');
  const g = computeGroup(t, 'MD', 'A', { [a]: { s1: 11, s2: 5, status: 'live' }, [b]: done(9, 9) });
  assert.equal(g.remaining, 6);
  assert.equal(g.rows.find(r => r.code === 'A1').played, 0);
});

test('hòa vòng tròn 3 đội: cần BTC xử; ghi đè hợp lệ thì áp dụng', () => {
  const [c12, c13, c23] = groupIds('MD', 'C');
  const scores = { [c12]: done(11, 5), [c13]: done(5, 11), [c23]: done(11, 5) };
  const g = computeGroup(t, 'MD', 'C', scores);
  assert.equal(g.needsTiebreak, true);
  assert.deepEqual(g.rows.map(r => r.code), ['C1', 'C2', 'C3']);
  const o = computeGroup(t, 'MD', 'C', scores, ['C3', 'C1', 'C2']);
  assert.equal(o.needsTiebreak, false);
  assert.equal(o.overridden, true);
  assert.deepEqual(o.rows.map(r => [r.code, r.rank]), [['C3', 1], ['C1', 2], ['C2', 3]]);
  const bad = computeGroup(t, 'MD', 'C', scores, ['C1', 'C9', 'C2']);
  assert.equal(bad.overridden, false);
});

test('bảng hòa hoàn toàn thì tứ kết chờ, không tự điền', () => {
  const scores = t1WinsAll('MD');
  const [c12, c13, c23] = groupIds('MD', 'C');
  Object.assign(scores, { [c12]: done(11, 5), [c13]: done(5, 11), [c23]: done(11, 5) });
  const v = buildView(t, scores);
  assert.equal(v.byId['MD-QF2'].team1, null);
  assert.equal(v.byId['MD-QF2'].hint1, 'Nhất bảng C');
});

test('nhánh đấu tự điền và ra kết quả chung cuộc', () => {
  let v = buildView(t, {});
  assert.equal(v.byId['MD-QF1'].team1, null);
  assert.equal(v.byId['MD-QF1'].hint2, 'Nhì bảng B');
  assert.equal(v.byId['MD-SF1'].hint1, 'Thắng Tứ kết 1');

  const scores = t1WinsAll('MD');
  v = buildView(t, scores);
  assert.deepEqual(['MD-QF1', 'MD-QF2', 'MD-QF3', 'MD-QF4'].map(id => [v.byId[id].team1, v.byId[id].team2]),
    [['A1', 'B2'], ['C1', 'D2'], ['B1', 'A2'], ['D1', 'C2']]);

  Object.assign(scores, {
    'MD-QF1': done(15, 10), 'MD-QF2': done(8, 15), 'MD-QF3': done(15, 3), 'MD-QF4': done(15, 3),
    'MD-SF1': done(15, 12), 'MD-SF2': done(10, 15), 'MD-F': done(15, 13),
  });
  v = buildView(t, scores);
  assert.deepEqual([v.byId['MD-SF1'].team1, v.byId['MD-SF1'].team2], ['A1', 'D2']);
  assert.deepEqual([v.byId['MD-F'].team1, v.byId['MD-F'].team2], ['A1', 'D1']);
  assert.deepEqual(v.podium.MD, { champion: 'A1', runnerUp: 'D1', thirds: ['D2', 'B1'] });
  assert.deepEqual(v.podium.WD, { champion: null, runnerUp: null, thirds: [] });
});

test('tỷ số của trận loại trực tiếp chưa đủ đội thì bỏ qua', () => {
  const v = buildView(t, { 'MD-SF1': done(15, 3) });
  assert.equal(v.byId['MD-SF1'].winner, 0);
  assert.equal(v.byId['MD-SF1'].winnerCode, null);
});

test('Đôi Nữ: nhất A gặp nhì B ở bán kết 1', () => {
  const v = buildView(t, t1WinsAll('WD'));
  assert.deepEqual([v.byId['WD-SF1'].team1, v.byId['WD-SF1'].team2], ['A1', 'B2']);
  assert.deepEqual([v.byId['WD-SF2'].team1, v.byId['WD-SF2'].team2], ['B1', 'A2']);
});

test('thứ tự BTC chốt chỉ phân định trong nhóm bằng điểm, không đè lên điểm', () => {
  // A1 thắng cả 3 trận (9 điểm); thứ tự chốt cũ đặt A1 cuối bảng
  const ids = groupIds('WD', 'A'); // A1-A2, A3-A4, A1-A3, A2-A4, A1-A4, A2-A3
  const sc = [[11, 5], [11, 9], [11, 7], [3, 11], [11, 6], [11, 5]]; // A2>A3>A4>A2, mỗi đội 3 điểm
  const scores = Object.fromEntries(ids.map((id, i) => [id, done(...sc[i])]));
  const g = computeGroup(t, 'WD', 'A', scores, ['A4', 'A3', 'A2', 'A1']);
  assert.equal(g.rows[0].code, 'A1');
  // A2, A3, A4 cùng 3 điểm: thứ tự chốt (A4, A3, A2) được dùng để phân định
  assert.deepEqual(g.rows.map(r => r.code), ['A1', 'A4', 'A3', 'A2']);
  assert.equal(g.overridden, true);
});

import { forfeitScore } from '../public/js/engine.js';

test('xử thua vắng mặt: 0-11 vòng bảng, 0-15 loại trực tiếp (Điều lệ III.4)', () => {
  const g = t.matches.find(m => m.id === 'MD-G01'), qf = t.matches.find(m => m.id === 'MD-QF1');
  assert.deepEqual(forfeitScore(g, null, 2, 'absent'), { s1: 11, s2: 0, status: 'done', forfeit: { loser: 2, reason: 'absent' } });
  assert.deepEqual(forfeitScore(qf, { s1: 3, s2: 4 }, 1, 'absent'), { s1: 0, s2: 15, status: 'done', forfeit: { loser: 1, reason: 'absent' } });
});

test('bỏ cuộc giữa chừng: đội bỏ cuộc giữ điểm, đội kia đủ điểm thắng (vẫn hơn 2 điểm)', () => {
  const g = t.matches.find(m => m.id === 'MD-G01');
  assert.deepEqual(forfeitScore(g, { s1: 7, s2: 9 }, 2, 'retired'), { s1: 11, s2: 9, status: 'done', forfeit: { loser: 2, reason: 'retired' } });
  assert.equal(forfeitScore(g, { s1: 10, s2: 12 }, 2, 'retired').s1, 14);
});

test('trận xử thua tính điểm và hiệu số như trận thường', () => {
  const g = computeGroup(t, 'MD', 'A', { 'MD-G01': forfeitScore(t.matches[0], null, 2, 'absent') });
  const a1 = g.rows.find(r => r.code === 'A1'), a2 = g.rows.find(r => r.code === 'A2');
  assert.deepEqual([a1.pts, a1.diff, a2.diff], [3, 11, -11]);
});
