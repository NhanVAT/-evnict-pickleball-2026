import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const t = JSON.parse(readFileSync(new URL('../public/data/tournament.json', import.meta.url), 'utf8'));
const players = (ev, code) => t.events.find(e => e.id === ev).teams[code];

test('đủ 62 trận, 35 cặp, 3 nội dung', () => {
  assert.equal(t.matches.length, 62);
  assert.equal(t.events.reduce((n, e) => n + Object.keys(e.teams).length, 0), 35);
  assert.deepEqual(t.events.map(e => e.id), ['MD', 'XD', 'WD']);
  assert.equal(new Set(t.matches.map(m => m.id)).size, 62);
});

test('mỗi bảng đấu vòng tròn đủ một lượt', () => {
  for (const ev of t.events) {
    for (const [g, codes] of Object.entries(ev.groups)) {
      const got = t.matches
        .filter(m => m.event === ev.id && m.stage === 'G' && m.group === g)
        .map(m => [m.t1, m.t2].sort().join('-')).sort();
      const want = [];
      for (let i = 0; i < codes.length; i++)
        for (let j = i + 1; j < codes.length; j++) want.push([codes[i], codes[j]].sort().join('-'));
      assert.deepEqual(got, want.sort(), `${ev.id} bảng ${g}`);
    }
  }
});

test('không trùng sân trong cùng lượt', () => {
  const seen = new Set();
  for (const m of t.matches) {
    const k = `${m.round}-${m.court}`;
    assert.ok(!seen.has(k), `trùng lượt-sân ${k} (${m.id})`);
    seen.add(k);
  }
});

test('không VĐV nào đánh 2 trận vòng bảng trong cùng lượt', () => {
  const byRound = new Map();
  for (const m of t.matches.filter(m => m.stage === 'G')) {
    const set = byRound.get(m.round) ?? new Set();
    for (const n of [...players(m.event, m.t1), ...players(m.event, m.t2)]) {
      assert.ok(!set.has(n), `${n} trùng lượt ${m.round}`);
      set.add(n);
    }
    byRound.set(m.round, set);
  }
});

test('mọi lượt đều có giờ; nguồn loại trực tiếp trỏ đúng', () => {
  const ids = new Set(t.matches.map(m => m.id));
  for (const m of t.matches) {
    assert.ok(t.rounds[String(m.round)], m.id);
    for (const s of [m.src1, m.src2].filter(Boolean)) if (s.winner) assert.ok(ids.has(s.winner), m.id);
  }
});

test('6 sân có tên thật theo phiếu đặt sân', () => {
  assert.deepEqual(t.courtNames, { 1: 'Sân thi đấu', 2: 'Sân 4', 3: 'Sân 5', 4: 'Sân 6', 5: 'Sân 7', 6: 'Sân 8' });
  for (const m of t.matches) assert.ok(t.courtNames[m.court], m.id);
});

// Lịch cân đối 30/09: Nam-Nữ trùng người với cả Đôi Nam lẫn Đôi Nữ nên không bao giờ chung lượt
test('lượt có Nam-Nữ thì không có Đôi Nam hay Đôi Nữ', () => {
  const byRound = new Map();
  for (const m of t.matches) byRound.set(m.round, (byRound.get(m.round) ?? new Set()).add(m.event));
  for (const [r, evs] of byRound) assert.ok(!evs.has('XD') || evs.size === 1, `lượt ${r}: ${[...evs]}`);
});

test('trận loại trực tiếp đánh sau các trận nó phụ thuộc', () => {
  const byId = Object.fromEntries(t.matches.map(m => [m.id, m]));
  for (const m of t.matches.filter(x => x.stage !== 'G')) {
    for (const s of [m.src1, m.src2]) {
      const deps = s.winner ? [byId[s.winner]] : t.matches.filter(x => x.event === m.event && x.stage === 'G' && x.group === s.group);
      for (const d of deps) assert.ok(d.round < m.round, `${m.id} (lượt ${m.round}) phải sau ${d.id} (lượt ${d.round})`);
    }
  }
});

test('lịch loại trực tiếp mới: 3 chung kết ở Sân thi đấu, CK Nam rồi CK Nam-Nữ là 2 lượt cuối', () => {
  const at = id => { const m = t.matches.find(x => x.id === id); return [m.round, m.court]; };
  assert.deepEqual(['MD-QF1', 'MD-QF4', 'WD-SF1', 'WD-SF2'].map(at), [[7, 1], [7, 4], [7, 5], [7, 6]]);
  assert.deepEqual(['XD-QF1', 'XD-QF4'].map(at), [[11, 1], [11, 4]]);
  assert.deepEqual(['WD-F', 'MD-SF1', 'MD-SF2'].map(at), [[12, 1], [12, 2], [12, 3]]);
  assert.deepEqual(['XD-SF1', 'XD-SF2'].map(at), [[13, 2], [13, 3]]);
  assert.deepEqual(['MD-F', 'XD-F'].map(at), [[14, 1], [15, 1]]);
  assert.deepEqual([...new Set(t.matches.filter(m => m.event === 'XD' && m.stage === 'G').map(m => m.round))].sort((a, b) => a - b), [8, 9, 10]);
  assert.equal(Object.keys(t.rounds).length, 15);
});
