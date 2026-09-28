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
