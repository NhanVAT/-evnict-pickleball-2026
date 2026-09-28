import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildView, nameOf } from '../public/js/engine.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8').replace(/^﻿/, ''));
const t = read('../public/data/tournament.json');
const raw = read('./fixtures/scores-md.json');
const excel = read('./fixtures/excel-md.json');
const scores = Object.fromEntries(Object.entries(raw).map(([id, [s1, s2]]) => [id, { s1, s2, status: 'done' }]));
const v = buildView(t, scores);
const name = code => (code ? nameOf(t, 'MD', code) : '');

test('bảng xếp hạng Đôi Nam khớp Excel', () => {
  for (const [g, rows] of Object.entries(excel.standings)) {
    const mine = Object.fromEntries(v.standings.MD[g].rows.map(r => [r.code, r]));
    for (const x of rows) {
      const r = mine[x.code];
      assert.deepEqual([r.pts, r.diff, r.pf, r.rank], [x.pts, x.diff, x.pf, x.rank], `${g} ${x.code}`);
    }
  }
});

test('nhánh loại trực tiếp Đôi Nam khớp Excel', () => {
  for (const [id, x] of Object.entries(excel.knockout)) {
    const m = v.byId[id];
    assert.deepEqual([name(m.team1), name(m.team2), name(m.winnerCode)], [x.team1, x.team2, x.winner], id);
  }
});

test('kết quả chung cuộc khớp Excel', () => {
  assert.equal(name(v.podium.MD.champion), excel.final.champion);
  assert.equal(name(v.podium.MD.runnerUp), excel.final.runnerUp);
  assert.deepEqual(v.podium.MD.thirds.map(name), excel.final.thirds.split('  |  '));
});
