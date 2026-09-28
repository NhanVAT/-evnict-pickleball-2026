# Pickleball EVNICT 2026 Live Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang web công khai `evnict-pickleball.web.app` hiển thị lịch, bảng xếp hạng, nhánh đấu của giải và cập nhật tỷ số trực tiếp do admin nhập.

**Architecture:** Trang tĩnh HTML/CSS/JS thuần trong `public/`. Dữ liệu cố định (`tournament.json`) sinh từ Excel; Firebase Realtime Database chỉ giữ tỷ số + ghi đè thứ hạng. Module thuần `engine.js` tính mọi thứ còn lại ở trình duyệt. Có chế độ thử (`?demo` hoặc chưa cấu hình Firebase) lưu trong localStorage để phát triển/kiểm thử không cần mạng.

**Tech Stack:** HTML/CSS/JS ES modules, Firebase JS SDK 10.12.2 qua CDN gstatic, Firebase Hosting + Realtime Database + Auth, Node 24 `node --test`, Python 3 + openpyxl (xuất dữ liệu), Excel COM qua PowerShell (đối chiếu công thức).

**Spec:** `docs/superpowers/specs/2026-09-28-pickleball-live-design.md`

## Global Constraints

- Không bước build; mọi file trong `public/` được phục vụ nguyên trạng.
- Firebase SDK phiên bản `10.12.2`, nạp từ `https://www.gstatic.com/firebasejs/10.12.2/`.
- Mã trận: `MD-G01`…`MD-G18`, `MD-QF1..4`, `MD-SF1..2`, `MD-F`; tương tự `XD-…`; `WD-G01..09`, `WD-SF1..2`, `WD-F`.
- Nội dung: `MD` = Đôi Nam, `XD` = Đôi Nam - Nữ, `WD` = Đôi Nữ.
- Firebase: `/scores/{matchId} = {s1, s2, status: "live"|"done", updatedAt}`; `/overrides/{event}/{group} = [codes]`.
- Xếp hạng: Điểm (thắng 3) → Hiệu số → Điểm ghi; chỉ trận `done` và `s1 ≠ s2` được tính.
- Trang có `noindex`. Repo không chứa file docx/xlsx gốc hay thư mục "Thanh toán".
- Commit message không kèm dòng attribution AI (chính sách công ty).
- Giao diện tiếng Việt, thiết kế điện thoại trước (360px), hỗ trợ sáng/tối.

## Review Focus

1. Mạng công ty/4G chặn hoặc chậm tải Firebase SDK → trang người xem vẫn phải hiện lịch, bảng từ `tournament.json` và báo "mất kết nối", không được trắng trang. (Task 4: app render trước, `createStore` trong try/catch; kiểm bằng cách chặn gstatic trong Playwright.)
2. Admin mất mạng giữa trận → badge chuyển "Mất kết nối", thao tác vẫn hiện tại chỗ và tự đồng bộ khi có mạng lại. (Task 6: kiểm offline bằng Playwright.)
3. Admin lỡ để tỷ số hòa rồi bấm Kết thúc → nút bị khóa; nếu dữ liệu hòa lọt vào, engine coi như chưa xong. (Task 2 test + Task 5 kiểm nút.)
4. Bảng hòa hoàn toàn chỉ số → nhánh loại trực tiếp phải chờ, admin thấy khu "Xử hòa" để chọn thứ tự. (Task 2 test + Task 5 kiểm giao diện.)
5. VĐV gõ tên không dấu ("dung", "do trung") → vẫn tìm ra "Đỗ Trung Dũng". (Task 2 test `normalize`.)

---

### Task 1: Khung dự án + xuất dữ liệu từ Excel

**Files:**
- Create: `package.json`, `.gitignore`, `tools/export_excel.py`, `public/data/tournament.json` (sinh ra), `tests/tournament.test.mjs`

**Interfaces:**
- Produces: `public/data/tournament.json` dạng
  `{title, subtitle, date, dateText, venue, hours, courts, endTime, rounds: {"1":"07:00",…}, events: [{id, name, groups: {A:["A1",…]}, teams: {A1: [vđv1, vđv2]}}], matches: [{id, event, stage:"G"|"QF"|"SF"|"F", label, round, court, group?, t1?, t2?, src1?, src2?}]}`
  với `src = {group, rank}` hoặc `{winner: matchId}`.

- [ ] **Step 1: Tạo `package.json` và `.gitignore`**

```json
{
  "name": "evnict-pickleball",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test \"tests/*.test.mjs\"",
    "export": "python tools/export_excel.py \"../Danh sách thi đấu chính thức Pickerball giải thể thao thường niên EVNICT 2026.xlsx\" public/data/tournament.json",
    "serve": "npx --yes http-server public -p 5173 -c-1 --silent",
    "predeploy": "node -e \"if(require('fs').readFileSync('database.rules.json','utf8').includes('__ADMIN_UID__'))throw new Error('Chưa điền ADMIN UID vào database.rules.json')\"",
    "deploy": "npx --yes firebase-tools deploy --only hosting,database"
  }
}
```

`.gitignore`:
```
node_modules/
.firebase/
*.log
```

- [ ] **Step 2: Viết test dữ liệu (sẽ fail vì chưa có JSON)** — `tests/tournament.test.mjs`

```js
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
```

- [ ] **Step 3: Chạy test, xác nhận fail**

Run: `npm test`
Expected: FAIL — `ENOENT ... tournament.json`

- [ ] **Step 4: Viết `tools/export_excel.py`**

```python
"""Sinh public/data/tournament.json từ file Excel danh sách thi đấu chính thức.

Cách chạy: python tools/export_excel.py <file.xlsx> <out.json>
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

ROUND_TIMES = {1: "07:00", 2: "07:18", 3: "07:36", 4: "07:54", 5: "08:12", 6: "08:30",
               7: "08:53", 8: "09:11", 9: "09:29",
               10: "09:52", 11: "10:17", 12: "10:42", 13: "11:07", 14: "11:32"}
EVENTS = [("MD", "Đôi Nam", "Đôi Nam"), ("XD", "Đôi Nam - Nữ", "Đôi Nam-Nữ"), ("WD", "Đôi Nữ", "Đôi Nữ")]


def g(group, rank):
    return {"group": group, "rank": rank}


def w(match_id):
    return {"winner": match_id}


def four_group_knockout(ev, qf_round, sf_round, f_round, f_court):
    return [
        (f"{ev}-QF1", "QF", "Tứ kết 1", qf_round, 1, g("A", 1), g("B", 2)),
        (f"{ev}-QF2", "QF", "Tứ kết 2", qf_round, 2, g("C", 1), g("D", 2)),
        (f"{ev}-QF3", "QF", "Tứ kết 3", qf_round, 3, g("B", 1), g("A", 2)),
        (f"{ev}-QF4", "QF", "Tứ kết 4", qf_round, 4, g("D", 1), g("C", 2)),
        (f"{ev}-SF1", "SF", "Bán kết 1", sf_round, 1, w(f"{ev}-QF1"), w(f"{ev}-QF2")),
        (f"{ev}-SF2", "SF", "Bán kết 2", sf_round, 2, w(f"{ev}-QF3"), w(f"{ev}-QF4")),
        (f"{ev}-F", "F", "Chung kết", f_round, f_court, w(f"{ev}-SF1"), w(f"{ev}-SF2")),
    ]


# Lượt và sân theo Điều lệ v7, Mục IV.3; cặp đấu theo công thức sheet Excel.
KNOCKOUT = {
    "MD": four_group_knockout("MD", 10, 11, 13, 3),
    "XD": four_group_knockout("XD", 12, 13, 14, 1),
    "WD": [
        ("WD-SF1", "SF", "Bán kết 1", 10, 5, g("A", 1), g("B", 2)),
        ("WD-SF2", "SF", "Bán kết 2", 10, 6, g("B", 1), g("A", 2)),
        ("WD-F", "F", "Chung kết", 11, 3, w("WD-SF1"), w("WD-SF2")),
    ],
}


def read_event(ws, ev_id, name):
    teams, groups, matches = {}, {}, []
    in_schedule = False
    for row in ws.iter_rows(values_only=True):
        a = row[0]
        if not in_schedule and isinstance(a, str) and re.fullmatch(r"[A-D][1-4]", a) and row[2] and row[3]:
            teams[a] = [row[2].strip(), row[3].strip()]
            groups.setdefault(row[1], []).append(a)
        elif a == "Lượt" and row[1] == "Sân":
            in_schedule = True
        elif in_schedule and isinstance(a, (int, float)):
            matches.append({
                "id": f"{ev_id}-G{len(matches) + 1:02d}", "event": ev_id, "stage": "G",
                "label": f"Bảng {row[2]}", "group": row[2], "round": int(a),
                "court": int(str(row[1]).replace("Sân", "").strip()), "t1": row[3], "t2": row[8],
            })
        elif in_schedule and matches and a is None:
            break  # hết khối lịch vòng bảng
    for mid, stage, label, rnd, court, s1, s2 in KNOCKOUT[ev_id]:
        matches.append({"id": mid, "event": ev_id, "stage": stage, "label": label,
                        "round": rnd, "court": court, "src1": s1, "src2": s2})
    return {"id": ev_id, "name": name, "groups": groups, "teams": teams}, matches


def main(src, out):
    wb = openpyxl.load_workbook(src)
    events, matches = [], []
    for ev_id, name, sheet in EVENTS:
        ev, ms = read_event(wb[sheet], ev_id, name)
        events.append(ev)
        matches += ms
    data = {
        "title": "Giải Pickleball EVNICT 2026", "subtitle": "Giải thể thao thường niên EVNICT 2026",
        "date": "2026-10-04", "dateText": "Chủ nhật, 04/10/2026", "venue": "Hà Nội",
        "hours": "7h00 – 12h00", "courts": 6, "endTime": "11:57",
        "rounds": {str(k): v for k, v in ROUND_TIMES.items()},
        "events": events, "matches": matches,
    }
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(matches)} trận, {sum(len(e['teams']) for e in events)} cặp -> {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
```

- [ ] **Step 5: Sinh JSON**

Run: `npm run export`
Expected: `62 trận, 35 cặp -> public/data/tournament.json`

- [ ] **Step 6: Chạy test, xác nhận pass**

Run: `npm test`
Expected: 5 test PASS

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore tools/export_excel.py public/data/tournament.json tests/tournament.test.mjs
git commit -m "Xuất dữ liệu giải từ Excel ra tournament.json kèm kiểm tra"
```

---

### Task 2: Engine tính xếp hạng, nhánh đấu + util

**Files:**
- Create: `public/js/engine.js`, `public/js/util.js`, `tests/engine.test.mjs`, `tests/util.test.mjs`

**Interfaces:**
- Consumes: `tournament.json` (Task 1).
- Produces:
  - `nameOf(t, eventId, code) → "VĐV1 - VĐV2"` (hoặc `code` nếu không có)
  - `computeGroup(t, eventId, group, scores, override?) → {group, rows:[{code, played, won, lost, pts, pf, pa, diff, rank}], done, remaining, total, pointsTie, needsTiebreak, overridden}`
  - `buildView(t, scores = {}, overrides = {}) → {standings: {MD: {A: group}}, matches: [resolved], byId: {id: resolved}, podium: {MD: {champion, runnerUp, thirds: []}}}`
  - resolved match = match gốc + `{team1, team2 (code|null), hint1, hint2 (chuỗi chờ), score ({s1,s2,status}|null), status: "pending"|"live"|"done", winner: 0|1|2, winnerCode, loserCode}`
  - util: `esc(s)`, `normalize(s)`, `load(key, def)`, `save(key, v)`, `byRoundCourt(a, b)`

- [ ] **Step 1: Viết test util** — `tests/util.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, esc } from '../public/js/util.js';

test('normalize bỏ dấu tiếng Việt, cả chữ đ', () => {
  assert.equal(normalize('Đỗ Trung Dũng'), 'do trung dung');
  assert.ok(normalize('Nguyễn Thị Hải Hà').includes('hai ha'));
});

test('esc chặn HTML', () => {
  assert.equal(esc('<b>"x"&</b>'), '&lt;b&gt;&quot;x&quot;&amp;&lt;/b&gt;');
});
```

- [ ] **Step 2: Viết test engine** — `tests/engine.test.mjs`

```js
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
```

- [ ] **Step 3: Chạy test, xác nhận fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../public/js/engine.js'`

- [ ] **Step 4: Viết `public/js/util.js`**

```js
const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ENT[c]);

export const normalize = s => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toLowerCase();

export function load(key, def) {
  try { return localStorage.getItem(key) ?? def; } catch { return def; }
}

export function save(key, value) {
  try { localStorage.setItem(key, value); } catch { /* chế độ ẩn danh: bỏ qua */ }
}

export const byRoundCourt = (a, b) => a.round - b.round || a.court - b.court;
```

- [ ] **Step 5: Viết `public/js/engine.js`**

```js
// Tính bảng xếp hạng, nhánh đấu và kết quả chung cuộc từ dữ liệu cố định + tỷ số.
// Module thuần: không đụng DOM, chạy được cả trong Node để test.

const RANK_WORD = { 1: 'Nhất', 2: 'Nhì' };

const eventOf = (t, id) => t.events.find(e => e.id === id);

export function nameOf(t, eventId, code) {
  const p = eventOf(t, eventId)?.teams[code];
  return p ? p.join(' - ') : code;
}

// 1 hoặc 2 nếu trận đã kết thúc với tỷ số hợp lệ, ngược lại 0
function winnerSide(score) {
  if (!score || score.status !== 'done' || score.s1 === score.s2) return 0;
  return score.s1 > score.s2 ? 1 : 2;
}

const compare = (x, y) => y.pts - x.pts || y.diff - x.diff || y.pf - x.pf;

export function computeGroup(t, eventId, group, scores, override) {
  const codes = eventOf(t, eventId).groups[group];
  const rows = codes.map(code => ({ code, played: 0, won: 0, lost: 0, pts: 0, pf: 0, pa: 0, diff: 0 }));
  const byCode = Object.fromEntries(rows.map(r => [r.code, r]));
  const matches = t.matches.filter(m => m.event === eventId && m.stage === 'G' && m.group === group);

  let remaining = 0;
  for (const m of matches) {
    const s = scores[m.id];
    const w = winnerSide(s);
    if (!w) { remaining++; continue; }
    const a = byCode[m.t1], b = byCode[m.t2];
    a.played++; b.played++;
    a.pf += s.s1; a.pa += s.s2;
    b.pf += s.s2; b.pa += s.s1;
    const [win, lose] = w === 1 ? [a, b] : [b, a];
    win.won++; win.pts += 3; lose.lost++;
  }
  for (const r of rows) r.diff = r.pf - r.pa;

  const done = remaining === 0;
  let sorted = [...rows].sort(compare); // sort ổn định: hòa thì giữ thứ tự mã vị trí
  // Chỉ ranh giới nhất/nhì và nhì/ba ảnh hưởng tới vé đi tiếp
  const boundaries = [1, 2].filter(i => i < sorted.length);
  const pointsTie = done && boundaries.some(i => sorted[i - 1].pts === sorted[i].pts);
  const fullTie = done && boundaries.some(i => compare(sorted[i - 1], sorted[i]) === 0);

  const overridden = Array.isArray(override) && override.length === codes.length
    && codes.every(c => override.includes(c));
  if (overridden) sorted = override.map(c => byCode[c]);
  sorted.forEach((r, i) => { r.rank = i + 1; });

  return {
    group, rows: sorted, done, remaining, total: matches.length,
    pointsTie, needsTiebreak: fullTie && !overridden, overridden,
  };
}

function resolveSide(src, fixed, eventStandings, resolved) {
  if (fixed) return { code: fixed, hint: '' };
  if (src.group) {
    const g = eventStandings[src.group];
    const hint = `${RANK_WORD[src.rank]} bảng ${src.group}`;
    if (!g.done || g.needsTiebreak) return { code: null, hint };
    return { code: g.rows[src.rank - 1].code, hint };
  }
  const prev = resolved[src.winner];
  return { code: prev.winnerCode, hint: `Thắng ${prev.label}` };
}

export function buildView(t, scores = {}, overrides = {}) {
  const standings = {};
  for (const ev of t.events) {
    standings[ev.id] = {};
    for (const g of Object.keys(ev.groups)) {
      standings[ev.id][g] = computeGroup(t, ev.id, g, scores, overrides?.[ev.id]?.[g]);
    }
  }

  const byId = {};
  const matches = t.matches.map(m => {
    const s1 = resolveSide(m.src1, m.t1, standings[m.event], byId);
    const s2 = resolveSide(m.src2, m.t2, standings[m.event], byId);
    const ready = Boolean(s1.code && s2.code);
    const score = ready ? scores[m.id] ?? null : null;
    const winner = ready ? winnerSide(score) : 0;
    const r = {
      ...m,
      team1: s1.code, team2: s2.code, hint1: s1.hint, hint2: s2.hint,
      score,
      status: score ? (score.status === 'done' ? 'done' : 'live') : 'pending',
      winner,
      winnerCode: winner === 1 ? s1.code : winner === 2 ? s2.code : null,
      loserCode: winner === 1 ? s2.code : winner === 2 ? s1.code : null,
    };
    byId[m.id] = r;
    return r;
  });

  const podium = {};
  for (const ev of t.events) {
    const final = matches.find(m => m.event === ev.id && m.stage === 'F');
    podium[ev.id] = {
      champion: final.winnerCode,
      runnerUp: final.loserCode,
      thirds: matches.filter(m => m.event === ev.id && m.stage === 'SF' && m.loserCode).map(m => m.loserCode),
    };
  }

  return { standings, matches, byId, podium };
}
```

- [ ] **Step 6: Chạy test, xác nhận pass**

Run: `npm test`
Expected: tất cả PASS (5 dữ liệu + 2 util + 9 engine)

- [ ] **Step 7: Commit**

```bash
git add public/js/engine.js public/js/util.js tests/engine.test.mjs tests/util.test.mjs
git commit -m "Thêm engine tính xếp hạng, nhánh đấu, kết quả chung cuộc"
```

---

### Task 3: Đối chiếu engine với công thức Excel

**Files:**
- Create: `tools/excel_crosscheck.ps1`, `tests/fixtures/scores-md.json`, `tests/fixtures/excel-md.json` (sinh ra), `tests/excel-crosscheck.test.mjs`

**Interfaces:**
- Consumes: `buildView`, `nameOf` (Task 2).
- Produces: fixture `excel-md.json` = `{standings: {A: [{code, pts, diff, pf, rank}]}, knockout: {"MD-QF1": {team1, team2, winner}}, final: {champion, runnerUp, thirds}}` (tên cặp dạng chuỗi như Excel hiển thị).

- [ ] **Step 1: Tạo bộ tỷ số giả** — `tests/fixtures/scores-md.json` (không có hòa chỉ số; nhì bảng B và C khác thứ tự mã để kiểm thật)

```json
{
 "MD-G01": [11, 5], "MD-G02": [11, 9], "MD-G03": [7, 11], "MD-G04": [11, 3], "MD-G05": [11, 6], "MD-G06": [11, 8],
 "MD-G07": [9, 11], "MD-G08": [11, 7], "MD-G09": [11, 4], "MD-G10": [11, 10], "MD-G11": [11, 2], "MD-G12": [6, 11],
 "MD-G13": [11, 8], "MD-G14": [5, 11], "MD-G15": [11, 9],
 "MD-G16": [11, 2], "MD-G17": [11, 4], "MD-G18": [3, 11],
 "MD-QF1": [15, 12], "MD-QF2": [10, 15], "MD-QF3": [15, 9], "MD-QF4": [15, 13],
 "MD-SF1": [15, 11], "MD-SF2": [12, 15], "MD-F": [15, 14]
}
```

- [ ] **Step 2: Viết `tools/excel_crosscheck.ps1`** — điền tỷ số vào bản sao Excel, tính lại, xuất kết quả

```powershell
# Điền tỷ số vào BẢN SAO file Excel chính thức (sheet Đôi Nam), cho Excel tính lại,
# rồi xuất bảng xếp hạng + nhánh đấu ra JSON để test so với engine.js.
param(
  [Parameter(Mandatory)][string]$Xlsx,
  [Parameter(Mandatory)][string]$ScoresJson,
  [Parameter(Mandatory)][string]$OutJson
)
$scores = Get-Content $ScoresJson -Raw -Encoding UTF8 | ConvertFrom-Json
$tmp = Join-Path $env:TEMP 'pb-crosscheck.xlsx'
Copy-Item -LiteralPath $Xlsx $tmp -Force
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false
try {
  $wb = $xl.Workbooks.Open($tmp)
  $ws = $wb.Worksheets.Item('Đôi Nam')
  for ($i = 0; $i -lt 18; $i++) {
    $s = $scores.('MD-G{0:D2}' -f ($i + 1)); $r = 24 + $i
    $ws.Cells.Item($r, 6).Value2 = $s[0]; $ws.Cells.Item($r, 7).Value2 = $s[1]
  }
  $ko = 'MD-QF1', 'MD-QF2', 'MD-QF3', 'MD-QF4', 'MD-SF1', 'MD-SF2', 'MD-F'
  for ($i = 0; $i -lt 7; $i++) {
    $s = $scores.($ko[$i]); $r = 75 + $i
    $ws.Cells.Item($r, 4).Value2 = $s[0]; $ws.Cells.Item($r, 5).Value2 = $s[1]
  }
  $xl.CalculateFull()
  $standings = [ordered]@{}
  foreach ($b in @(@('A', 47, 4), @('B', 54, 4), @('C', 61, 3), @('D', 67, 3))) {
    $rows = @()
    for ($k = 0; $k -lt $b[2]; $k++) {
      $r = $b[1] + $k
      $rows += [ordered]@{
        code = $ws.Cells.Item($r, 1).Text; pts = [int]$ws.Cells.Item($r, 6).Value2
        pf = [int]$ws.Cells.Item($r, 7).Value2; diff = [int]$ws.Cells.Item($r, 9).Value2
        rank = [int]$ws.Cells.Item($r, 11).Value2
      }
    }
    $standings[$b[0]] = $rows
  }
  $knockout = [ordered]@{}
  for ($i = 0; $i -lt 7; $i++) {
    $r = 75 + $i
    $knockout[$ko[$i]] = [ordered]@{ team1 = $ws.Cells.Item($r, 3).Text; team2 = $ws.Cells.Item($r, 6).Text; winner = $ws.Cells.Item($r, 7).Text }
  }
  $final = [ordered]@{ champion = $ws.Cells.Item(84, 3).Text; runnerUp = $ws.Cells.Item(85, 3).Text; thirds = $ws.Cells.Item(86, 3).Text }
  [ordered]@{ standings = $standings; knockout = $knockout; final = $final } | ConvertTo-Json -Depth 6 | Set-Content $OutJson -Encoding UTF8
  $wb.Close($false)
} finally {
  $xl.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
  Remove-Item $tmp -ErrorAction SilentlyContinue
}
```

- [ ] **Step 3: Chạy script sinh fixture Excel**

Run (PowerShell): `& ./tools/excel_crosscheck.ps1 -Xlsx "../Danh sách thi đấu chính thức Pickerball giải thể thao thường niên EVNICT 2026.xlsx" -ScoresJson tests/fixtures/scores-md.json -OutJson tests/fixtures/excel-md.json`
Expected: file `tests/fixtures/excel-md.json` có `final.champion` = `"Trần Công Hân - Lê Văn Ninh"`.

- [ ] **Step 4: Viết test đối chiếu** — `tests/excel-crosscheck.test.mjs`

```js
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
```

Lưu ý: Excel ghi cột G "Đội thắng" ở vòng loại trực tiếp là tên cặp (`C75`/`F75`), nên so bằng tên.

- [ ] **Step 5: Chạy test**

Run: `npm test`
Expected: tất cả PASS. Nếu FAIL, sửa `engine.js` (Excel là chuẩn), không sửa fixture.

- [ ] **Step 6: Commit**

```bash
git add tools/excel_crosscheck.ps1 tests/fixtures tests/excel-crosscheck.test.mjs
git commit -m "Đối chiếu engine với công thức Excel chính thức"
```

---

### Task 4: Lớp dữ liệu + trang người xem

**Files:**
- Create: `public/js/firebase-config.js`, `public/js/store.js`, `public/index.html`, `public/css/style.css`, `public/js/app.js`, `public/img/ball.svg`

**Interfaces:**
- Consumes: `buildView`, `nameOf` (Task 2), util (Task 2).
- Produces: `createStore() → Promise<store>`; store = `{demo, onData(cb({scores, overrides})), onConnection(cb(bool)), onAuth(cb(user|null)), signIn(email, pw), signOut(), setScore(id, {s1,s2,status}|null), setOverride(ev, g, codes|null)}`. `isDemo()`.
- CSS dùng chung cho admin (Task 5): các lớp `.match-meta`, `.code`, `.tbd`, `.pill`, `.chip`, `.empty`, `.sec`, `.hero`, `button.primary`, `button.ghost`.

- [ ] **Step 1: Gọi skill `frontend-design:frontend-design`** để rà hướng thẩm mỹ trước khi viết giao diện (hướng đã chọn: "sân đấu" — xanh sân đậm, vạch sân trắng mờ, điểm nhấn vàng chanh màu bóng, chữ Be Vietnam Pro, số tabular). Điều chỉnh CSS dưới đây nếu skill chỉ ra điểm yếu, giữ nguyên tên lớp.

- [ ] **Step 2: Viết `public/js/firebase-config.js`**

```js
// Cấu hình web Firebase: công khai theo thiết kế, bảo mật nằm ở database.rules.json.
// apiKey để trống thì trang tự chạy chế độ thử (dữ liệu chỉ lưu trong trình duyệt).
export const FIREBASE_SDK = '10.12.2';
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  databaseURL: '',
  projectId: '',
  appId: '',
};
```

- [ ] **Step 3: Viết `public/js/store.js`**

```js
import { firebaseConfig, FIREBASE_SDK } from './firebase-config.js';

export const isDemo = () => new URLSearchParams(location.search).has('demo') || !firebaseConfig.apiKey;

export function createStore() {
  return isDemo() ? Promise.resolve(createDemoStore()) : createFirebaseStore();
}

// Chế độ thử: localStorage, đồng bộ giữa các tab bằng sự kiện storage
function createDemoStore() {
  const KEY = 'pb-demo-db';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
  const snapshot = () => { const v = read(); return { scores: v.scores ?? {}, overrides: v.overrides ?? {} }; };
  const dataCbs = new Set(), authCbs = new Set();
  let user = null;
  const emit = () => { const d = snapshot(); dataCbs.forEach(cb => cb(d)); };
  const write = fn => {
    const v = read(); fn(v);
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* bỏ qua */ }
    emit();
    return Promise.resolve();
  };
  addEventListener('storage', e => { if (e.key === KEY) emit(); });
  const setUser = u => { user = u; authCbs.forEach(cb => cb(user)); return Promise.resolve(); };
  return {
    demo: true,
    onData(cb) { dataCbs.add(cb); cb(snapshot()); },
    onConnection(cb) { cb(true); },
    onAuth(cb) { authCbs.add(cb); cb(user); },
    signIn: email => setUser({ email: email || 'demo@local' }),
    signOut: () => setUser(null),
    setScore: (id, v) => write(db => {
      db.scores ??= {};
      if (v) db.scores[id] = { ...v, updatedAt: Date.now() }; else delete db.scores[id];
    }),
    setOverride: (ev, g, order) => write(db => {
      db.overrides ??= {}; db.overrides[ev] ??= {};
      if (order) db.overrides[ev][g] = order; else delete db.overrides[ev][g];
    }),
  };
}

async function createFirebaseStore() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK}`;
  const [{ initializeApp }, dbm] = await Promise.all([
    import(`${base}/firebase-app.js`), import(`${base}/firebase-database.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const db = dbm.getDatabase(app);
  // Chỉ trang admin mới cần Auth, nạp khi dùng tới
  let authP;
  const auth = () => (authP ??= import(`${base}/firebase-auth.js`).then(m => ({ m, a: m.getAuth(app) })));
  return {
    demo: false,
    onData(cb) {
      dbm.onValue(dbm.ref(db), s => {
        const v = s.val() ?? {};
        cb({ scores: v.scores ?? {}, overrides: v.overrides ?? {} });
      });
    },
    onConnection(cb) { dbm.onValue(dbm.ref(db, '.info/connected'), s => cb(s.val() === true)); },
    async onAuth(cb) { const { m, a } = await auth(); m.onAuthStateChanged(a, cb); },
    async signIn(email, pw) { const { m, a } = await auth(); await m.signInWithEmailAndPassword(a, email, pw); },
    async signOut() { const { m, a } = await auth(); await m.signOut(a); },
    setScore(id, v) {
      const r = dbm.ref(db, `scores/${id}`);
      return v ? dbm.set(r, { ...v, updatedAt: dbm.serverTimestamp() }) : dbm.remove(r);
    },
    setOverride(ev, g, order) {
      const r = dbm.ref(db, `overrides/${ev}/${g}`);
      return order ? dbm.set(r, order) : dbm.remove(r);
    },
  };
}
```

- [ ] **Step 4: Viết `public/img/ball.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#d4f13a"/><g fill="#0e4a38" opacity=".5"><circle cx="22" cy="19" r="4"/><circle cx="41" cy="17" r="4"/><circle cx="32" cy="32" r="4"/><circle cx="17" cy="38" r="4"/><circle cx="47" cy="36" r="4"/><circle cx="30" cy="49" r="4"/></g></svg>
```

- [ ] **Step 5: Viết `public/index.html`**

```html
<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#0e4a38">
<meta name="description" content="Lịch thi đấu, bảng xếp hạng và tỷ số trực tiếp Giải Pickleball EVNICT 2026">
<title>Pickleball EVNICT 2026</title>
<link rel="icon" href="img/ball.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<header class="hero">
  <div class="hero-inner">
    <img class="ball" src="img/ball.svg" alt="">
    <div class="kicker">Giải thể thao thường niên EVNICT 2026</div>
    <h1>Pickle<em>ball</em></h1>
    <div class="meta" id="hero-meta"></div>
    <div class="status"><i></i><span id="conn-text">Đang kết nối…</span></div>
    <span class="demo-badge" id="demo-badge" hidden>Chế độ thử</span>
  </div>
</header>
<nav class="tabs" aria-label="Mục">
  <a href="#home">Tổng quan</a>
  <a href="#schedule">Lịch đấu</a>
  <a href="#standings">Xếp hạng</a>
  <a href="#bracket">Nhánh đấu</a>
</nav>
<main>
  <section class="view" id="view-home"></section>
  <section class="view" id="view-schedule" hidden>
    <div class="controls"><input id="search" type="search" placeholder="Tìm trận của bạn: gõ tên VĐV (không dấu cũng được)" autocomplete="off"></div>
    <div class="chips" id="schedule-filter"></div>
    <div id="schedule-list"></div>
  </section>
  <section class="view" id="view-standings" hidden>
    <div class="chips" id="standings-filter"></div>
    <div id="standings-list"></div>
  </section>
  <section class="view" id="view-bracket" hidden>
    <div class="chips" id="bracket-filter"></div>
    <div id="bracket-list"></div>
  </section>
</main>
<footer>Ban tổ chức Giải Pickleball EVNICT 2026 · Tỷ số cập nhật trực tiếp</footer>
<script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 6: Viết `public/css/style.css`**

```css
:root {
  --bg: #f3f5ef; --surface: #fff; --surface-2: #f8faf5; --ink: #12201a; --muted: #5b6b62; --line: #dde4d8;
  --court: #0e4a38; --court-2: #16694f; --ball: #d4f13a; --live: #d93d37; --win: #0e6b4c; --chip: #e7ede2;
  --shadow: 0 1px 2px rgb(16 32 24 / .06), 0 4px 16px rgb(16 32 24 / .06);
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0b1310; --surface: #131e19; --surface-2: #18251f; --ink: #e6eee8; --muted: #94a59b; --line: #24332c;
    --win: #7fdcae; --chip: #1c2a23; --shadow: none; color-scheme: dark;
  }
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.45 "Be Vietnam Pro", system-ui, sans-serif; font-variant-numeric: tabular-nums;
}
button { font: inherit; color: inherit; }

/* Hero: mặt sân nhìn từ trên xuống */
.hero {
  position: relative; overflow: hidden; color: #f2f7ea; padding: 28px 16px 22px;
  background:
    linear-gradient(90deg, transparent calc(50% - 1px), rgb(255 255 255 / .16) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)),
    linear-gradient(0deg, transparent 32%, rgb(255 255 255 / .12) 32% calc(32% + 2px), transparent calc(32% + 2px)),
    linear-gradient(160deg, var(--court-2), var(--court));
}
.hero-inner { max-width: 1080px; margin: 0 auto; position: relative; }
.kicker { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; opacity: .85; font-weight: 600; }
.hero h1 { margin: 6px 0 10px; font-size: clamp(40px, 11vw, 72px); line-height: .95; font-weight: 800; letter-spacing: -.03em; }
.hero h1 em { font-style: normal; color: var(--ball); }
.hero .meta { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 14px; opacity: .92; }
.hero .ball { position: absolute; right: 0; top: 0; width: clamp(56px, 15vw, 110px); transform: rotate(-12deg); }
.status { display: inline-flex; align-items: center; gap: 6px; margin-top: 14px; font-size: 13px; background: rgb(0 0 0 / .22); padding: 4px 10px; border-radius: 99px; }
.status i { width: 8px; height: 8px; border-radius: 50%; background: #9aa; }
body[data-conn="on"] .status i { background: var(--ball); box-shadow: 0 0 0 3px rgb(212 241 58 / .25); }
body[data-conn="off"] .status i { background: var(--live); }
.demo-badge { margin-left: 8px; font-size: 12px; font-weight: 700; background: var(--ball); color: var(--court); padding: 3px 8px; border-radius: 6px; }

.tabs {
  position: sticky; top: 0; z-index: 5; display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none;
  padding: 8px max(16px, calc((100% - 1080px) / 2)); border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(10px);
}
.tabs a { flex: none; padding: 8px 14px; border-radius: 99px; text-decoration: none; color: var(--muted); font-weight: 600; font-size: 14px; }
.tabs a.on { background: var(--court); color: #fff; }
main { max-width: 1080px; margin: 0 auto; padding: 4px 16px 40px; }
footer { text-align: center; color: var(--muted); font-size: 12px; padding: 8px 16px 40px; }

.sec { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 22px 0 10px; display: flex; align-items: center; gap: 8px; font-weight: 700; }
.sec .time { color: var(--ink); }
.count { background: var(--live); color: #fff; border-radius: 99px; padding: 0 7px; font-size: 12px; letter-spacing: 0; }
.grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); }
.empty { color: var(--muted); background: var(--surface-2); border: 1px dashed var(--line); border-radius: 12px; padding: 16px; text-align: center; margin: 12px 0; }
.muted { color: var(--muted); }
.small { font-size: 12px; }

/* Thẻ trận */
.match { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; box-shadow: var(--shadow); }
.match.live { border-color: var(--live); box-shadow: 0 0 0 1px var(--live) inset, var(--shadow); }
.match.mine { outline: 2px solid var(--ball); outline-offset: 1px; }
.match-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.sp { flex: 1; }
.ev { font-weight: 700; color: var(--win); }
.side { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; padding: 5px 0; }
.side + .side { border-top: 1px dashed var(--line); }
.code { display: inline-block; min-width: 26px; text-align: center; font-size: 11px; font-weight: 700; background: var(--chip); border-radius: 6px; padding: 1px 5px; color: var(--muted); }
.code:empty { display: none; }
.name { font-weight: 500; }
.pts { font-size: 22px; font-weight: 800; min-width: 2ch; text-align: right; }
.side.win .name { font-weight: 700; }
.side.win .pts { color: var(--win); }
.match.done .side:not(.win) { color: var(--muted); }
.tbd { color: var(--muted); font-style: italic; font-weight: 400; }
.pill { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 99px; background: var(--chip); color: var(--muted); }
.pill.live { background: var(--live); color: #fff; animation: pulse 1.6s infinite; }
@keyframes pulse { 50% { opacity: .6; } }
@media (prefers-reduced-motion: reduce) { .pill.live { animation: none; } }

.chips { display: flex; gap: 6px; flex-wrap: wrap; margin: 14px 0 4px; }
.chip { border: 1px solid var(--line); background: var(--surface); padding: 6px 12px; border-radius: 99px; font-size: 14px; cursor: pointer; }
.chip.on { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.controls input[type="search"] { width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); font: inherit; color: inherit; margin-top: 14px; }

.progress { display: flex; align-items: center; gap: 10px; margin-top: 16px; font-size: 13px; color: var(--muted); }
.bar { flex: 1; height: 8px; background: var(--chip); border-radius: 99px; overflow: hidden; }
.bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--court-2), var(--ball)); }
.info { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; display: grid; gap: 6px; }
.info div { display: flex; justify-content: space-between; gap: 12px; }

/* Bảng xếp hạng */
.table-card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; margin-top: 12px; overflow: hidden; box-shadow: var(--shadow); }
.table-card header { display: flex; justify-content: space-between; align-items: baseline; padding: 10px 12px; }
.table-card h3 { margin: 0; font-size: 16px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 8px 6px; text-align: center; border-top: 1px solid var(--line); }
th { font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; }
.l { text-align: left; }
tr.q td { background: color-mix(in srgb, var(--ball) 12%, transparent); }
tr.q td:first-child { box-shadow: inset 3px 0 var(--ball); }
.note { margin: 0; padding: 8px 12px; font-size: 13px; background: color-mix(in srgb, var(--live) 10%, transparent); color: var(--live); }

/* Nhánh đấu */
.bracket { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(270px, 1fr); gap: 14px; overflow-x: auto; padding: 4px 2px 12px; scroll-snap-type: x mandatory; margin-top: 10px; }
.bracket .col { display: flex; flex-direction: column; scroll-snap-align: start; }
.bracket .col h3 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.bracket .slots { flex: 1; display: flex; flex-direction: column; justify-content: space-around; gap: 10px; }
.podium { background: linear-gradient(160deg, var(--court-2), var(--court)); color: #f2f7ea; border-radius: 16px; padding: 14px 16px; margin-top: 12px; }
.podium h3 { margin: 0 0 8px; }
.podium ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.podium b { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .1em; opacity: .75; }
.podium .g1 { font-size: 18px; font-weight: 700; color: var(--ball); }

/* Nút dùng chung */
button.primary { background: var(--court); color: #fff; border-color: var(--court); }
button.ghost { background: transparent; color: var(--live); border-color: transparent; }
button:disabled { cursor: not-allowed; opacity: .45; }

/* Admin */
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 14px 0; }
.toolbar select { padding: 8px 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: inherit; font: inherit; }
.conn { font-size: 12px; padding: 4px 10px; border-radius: 99px; font-weight: 600; }
.conn.on { background: color-mix(in srgb, var(--win) 15%, transparent); color: var(--win); }
.conn.off { background: var(--live); color: #fff; }
.a-match { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px; margin-bottom: 10px; }
.a-match.live { border-color: var(--live); }
.a-side { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
.a-side + .a-side { border-top: 1px dashed var(--line); }
.a-name { flex: 1; min-width: 0; }
.a-side.win .a-name { font-weight: 700; }
.stepper { display: flex; align-items: center; gap: 6px; }
.stepper button { width: 48px; height: 48px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface-2); font-size: 24px; font-weight: 700; cursor: pointer; touch-action: manipulation; }
.stepper output { min-width: 2.2ch; text-align: center; font-size: 28px; font-weight: 800; }
.a-side.win output { color: var(--win); }
.a-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.a-actions button, .btn { padding: 10px 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface-2); font-weight: 600; cursor: pointer; text-decoration: none; color: inherit; }
.login { max-width: 380px; margin: 32px auto; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 20px; }
.login h2 { margin-top: 0; }
.login label { display: block; font-size: 13px; color: var(--muted); margin: 12px 0 4px; }
.login input { width: 100%; padding: 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface-2); color: inherit; font: inherit; }
.login button { width: 100%; margin-top: 16px; padding: 12px; border-radius: 10px; font-weight: 700; cursor: pointer; }
.err { color: var(--live); font-size: 13px; min-height: 1.2em; margin: 8px 0 0; }
.tie { background: var(--surface); border: 2px solid var(--ball); border-radius: 14px; padding: 12px; margin-bottom: 10px; }
.tie h3 { margin: 0 0 6px; font-size: 15px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tie ol { list-style: none; margin: 0; padding: 0; }
.tie li { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid var(--line); }
.tie li small { color: var(--muted); }
.tie li button { width: 40px; height: 40px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface-2); cursor: pointer; }
#toast { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); background: var(--ink); color: var(--bg); padding: 10px 16px; border-radius: 12px; font-size: 14px; z-index: 10; max-width: calc(100% - 32px); }
```

- [ ] **Step 7: Viết `public/js/app.js`**

```js
import { buildView, nameOf } from './engine.js';
import { createStore, isDemo } from './store.js';
import { esc, normalize, load, save, byRoundCourt } from './util.js';

const $ = s => document.querySelector(s);
const t = await fetch('data/tournament.json', { cache: 'no-cache' }).then(r => r.json());
const EVENTS = Object.fromEntries(t.events.map(e => [e.id, e]));
const TABS = ['home', 'schedule', 'standings', 'bracket'];
const STAGE_TITLE = { QF: 'Tứ kết', SF: 'Bán kết', F: 'Chung kết' };

const state = {
  sched: load('pb-sched', 'ALL'), stand: load('pb-stand', 'MD'), bracket: load('pb-bracket', 'MD'), q: load('pb-q', ''),
};
let view = buildView(t);

// ---------- Mảnh giao diện
function statusPill(m) {
  if (m.status === 'live') return '<span class="pill live">● Trực tiếp</span>';
  if (m.status === 'done') return '<span class="pill">Kết thúc</span>';
  return '';
}

function side(m, n) {
  const code = m[`team${n}`];
  const name = code ? esc(nameOf(t, m.event, code)) : `<span class="tbd">${esc(m[`hint${n}`])}</span>`;
  const pts = m.status === 'pending' ? '' : m.score[`s${n}`];
  return `<div class="side${m.winner === n ? ' win' : ''}"><span class="code">${code ?? ''}</span><span class="name">${name}</span><span class="pts">${pts}</span></div>`;
}

function matchCard(m, mine = false) {
  return `<article class="match ${m.status}${mine ? ' mine' : ''}">
    <div class="match-meta"><span class="ev">${esc(EVENTS[m.event].name)}</span><span>${esc(m.label)}</span><span class="sp"></span><span>Sân ${m.court}</span><span>${t.rounds[m.round]}</span>${statusPill(m)}</div>
    ${side(m, 1)}${side(m, 2)}
  </article>`;
}

function podiumCard(e) {
  const p = view.podium[e.id];
  if (!p.champion) return '';
  const n = c => esc(nameOf(t, e.id, c));
  return `<article class="podium"><h3>${esc(e.name)}</h3><ol>
    <li class="g1"><b>Vô địch</b>${n(p.champion)}</li>
    <li><b>Hạng nhì</b>${n(p.runnerUp)}</li>
    ${p.thirds.map(c => `<li><b>Đồng hạng ba</b>${n(c)}</li>`).join('')}
  </ol></article>`;
}

function chips(el, value, withAll, onPick) {
  const items = [...(withAll ? [['ALL', 'Tất cả']] : []), ...t.events.map(e => [e.id, e.name])];
  el.innerHTML = items.map(([id, n]) => `<button class="chip${id === value ? ' on' : ''}" data-v="${id}">${esc(n)}</button>`).join('');
  el.onclick = ev => { const b = ev.target.closest('button'); if (b) onPick(b.dataset.v); };
}

// ---------- Các tab
function renderHome() {
  const live = view.matches.filter(m => m.status === 'live').sort(byRoundCourt);
  const pending = view.matches.filter(m => m.status === 'pending');
  const next = pending.length ? Math.min(...pending.map(m => m.round)) : null;
  const upcoming = pending.filter(m => m.round === next).sort(byRoundCourt);
  const doneCount = view.matches.filter(m => m.status === 'done').length;
  const podiums = t.events.map(podiumCard).join('');
  $('#view-home').innerHTML = `
    <div class="progress"><div class="bar"><i style="width:${(doneCount / t.matches.length) * 100}%"></i></div><span>${doneCount}/${t.matches.length} trận đã xong</span></div>
    ${podiums ? `<h2 class="sec">Kết quả chung cuộc</h2><div class="grid">${podiums}</div>` : ''}
    <h2 class="sec">Đang diễn ra ${live.length ? `<span class="count">${live.length}</span>` : ''}</h2>
    ${live.length ? `<div class="grid">${live.map(m => matchCard(m)).join('')}</div>` : '<p class="empty">Chưa có trận nào đang đấu.</p>'}
    ${next ? `<h2 class="sec">Sắp đấu · Lượt ${next} <span class="time">${t.rounds[next]}</span></h2><div class="grid">${upcoming.map(m => matchCard(m)).join('')}</div>` : ''}
    <h2 class="sec">Thông tin giải</h2>
    <div class="info">
      <div><span class="muted">Ngày thi đấu</span><b>${esc(t.dateText)}</b></div>
      <div><span class="muted">Giờ</span><b>${esc(t.hours)}</b></div>
      <div><span class="muted">Địa điểm</span><b>${esc(t.venue)} · ${t.courts} sân</b></div>
      <div><span class="muted">Nội dung</span><b>${t.events.map(e => esc(e.name)).join(' · ')}</b></div>
      <div><span class="muted">Thể thức</span><b>Vòng bảng chạm 11 · Loại trực tiếp chạm 15</b></div>
    </div>`;
}

function renderSchedule() {
  chips($('#schedule-filter'), state.sched, true, v => { state.sched = v; save('pb-sched', v); renderSchedule(); });
  const q = normalize(state.q.trim());
  let ms = view.matches.filter(m => state.sched === 'ALL' || m.event === state.sched);
  if (q) ms = ms.filter(m => [m.team1, m.team2].some(c => c && normalize(nameOf(t, m.event, c)).includes(q)));
  const rounds = [...new Set(ms.map(m => m.round))].sort((a, b) => a - b);
  $('#schedule-list').innerHTML = rounds.length
    ? rounds.map(r => `<h2 class="sec">Lượt ${r} <span class="time">${t.rounds[r]}</span></h2>
        <div class="grid">${ms.filter(m => m.round === r).sort(byRoundCourt).map(m => matchCard(m, Boolean(q))).join('')}</div>`).join('')
    : `<p class="empty">Không tìm thấy trận nào${q ? ` có “${esc(state.q)}”` : ''}.</p>`;
}

function renderStandings() {
  chips($('#standings-filter'), state.stand, false, v => { state.stand = v; save('pb-stand', v); renderStandings(); });
  const e = EVENTS[state.stand];
  $('#standings-list').innerHTML = Object.values(view.standings[e.id]).map(g => `
    <article class="table-card">
      <header><h3>Bảng ${g.group}</h3><span class="muted small">${g.done ? 'Đã xong' : `Còn ${g.remaining}/${g.total} trận`}</span></header>
      <table>
        <thead><tr><th>#</th><th class="l">Cặp</th><th title="Số trận">Tr</th><th title="Thắng">T</th><th title="Thua">B</th><th title="Hiệu số">HS</th><th title="Điểm">Đ</th></tr></thead>
        <tbody>${g.rows.map(r => `<tr class="${r.rank <= 2 ? 'q' : ''}">
          <td>${r.rank}</td><td class="l"><span class="code">${r.code}</span> ${esc(nameOf(t, e.id, r.code))}</td>
          <td>${r.played}</td><td>${r.won}</td><td>${r.lost}</td><td>${r.diff > 0 ? '+' : ''}${r.diff}</td><td><b>${r.pts}</b></td></tr>`).join('')}</tbody>
      </table>
      ${g.needsTiebreak ? '<p class="note">Có đội bằng chỉ số — chờ Ban tổ chức xác định thứ hạng.</p>' : ''}
    </article>`).join('')
    + '<p class="muted small">Xếp hạng: Điểm (thắng 3) → Hiệu số → Điểm ghi được. Nhất, nhì mỗi bảng (tô vàng) vào vòng loại trực tiếp.</p>';
}

function renderBracket() {
  chips($('#bracket-filter'), state.bracket, false, v => { state.bracket = v; save('pb-bracket', v); renderBracket(); });
  const e = EVENTS[state.bracket];
  const ko = view.matches.filter(m => m.event === e.id && m.stage !== 'G');
  const cols = ['QF', 'SF', 'F'].map(s => ko.filter(m => m.stage === s)).filter(c => c.length);
  $('#bracket-list').innerHTML = `<div class="bracket">${cols.map(c => `
      <div class="col"><h3>${STAGE_TITLE[c[0].stage]}</h3><div class="slots">${c.map(m => matchCard(m)).join('')}</div></div>`).join('')}
    </div>${podiumCard(e)}`;
}

function render() { renderHome(); renderSchedule(); renderStandings(); renderBracket(); }

function showTab() {
  const tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== `view-${tab}`; });
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === `#${tab}`));
}

// ---------- Khởi động: vẽ ngay từ dữ liệu cố định, rồi mới nối Firebase
$('#hero-meta').innerHTML = [t.dateText, t.hours, `${t.venue} · ${t.courts} sân`, `${t.matches.length} trận`]
  .map(s => `<span>${esc(s)}</span>`).join('');
const search = $('#search');
search.value = state.q;
search.addEventListener('input', () => { state.q = search.value; save('pb-q', state.q); renderSchedule(); });
addEventListener('hashchange', showTab);
showTab();
render();

const setConn = on => {
  document.body.dataset.conn = on ? 'on' : 'off';
  $('#conn-text').textContent = on ? 'Tỷ số trực tiếp' : 'Mất kết nối — đang thử lại…';
};
try {
  const store = await createStore();
  $('#demo-badge').hidden = !isDemo();
  store.onConnection(setConn);
  store.onData(d => { view = buildView(t, d.scores, d.overrides); render(); });
} catch (err) {
  console.error(err);
  setConn(false);
  $('#conn-text').textContent = 'Không tải được tỷ số trực tiếp — lịch vẫn xem được';
}
```

- [ ] **Step 8: Kiểm tra trên trình duyệt (chế độ thử)**

Run: `npm run serve` (chạy nền), mở `http://localhost:5173/?demo` bằng Playwright ở kích thước 360×780.
Expected:
- Tab Tổng quan: thanh tiến độ `0/62`, "Chưa có trận nào đang đấu", khối "Sắp đấu · Lượt 1 07:00" có 6 trận.
- Tab Lịch đấu: 14 lượt; gõ `dung` → chỉ còn trận có "Đỗ Trung Dũng"/"Nguyễn Dương Mạnh Dũng", thẻ có viền vàng.
- Tab Xếp hạng: Đôi Nam 4 bảng, mọi số 0; Tab Nhánh đấu: 3 cột, ô hiện "Nhất bảng A", "Thắng Tứ kết 1".
- Seed dữ liệu thử bằng `localStorage.setItem('pb-demo-db', JSON.stringify({scores:{'MD-G01':{s1:7,s2:4,status:'live'}}}))` rồi tải lại: trận MD-G01 hiện ở "Đang diễn ra" với pill Trực tiếp.
- Không lỗi console; không cuộn ngang ở 360px (trừ vùng nhánh đấu).
- Chụp màn hình sáng + tối (emulate `prefers-color-scheme: dark`), xem lại.

- [ ] **Step 9: Kiểm Review Focus #1** — mở `http://localhost:5173/` (không `?demo`) sau khi điền tạm `apiKey: 'x'` và chặn `**/gstatic.com/**` trong Playwright: trang vẫn hiện lịch, trạng thái "Không tải được tỷ số trực tiếp — lịch vẫn xem được". Trả `apiKey` về `''` sau khi kiểm.

- [ ] **Step 10: Commit**

```bash
git add public
git commit -m "Trang người xem: tổng quan, lịch đấu, xếp hạng, nhánh đấu; chế độ thử"
```

---

### Task 5: Trang admin nhập tỷ số

**Files:**
- Create: `public/admin.html`, `public/js/admin.js`

**Interfaces:**
- Consumes: `createStore`, store API (Task 4); `buildView`, `nameOf` (Task 2); util (Task 2); CSS lớp admin (Task 4).

- [ ] **Step 1: Viết `public/admin.html`**

```html
<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#0e4a38">
<title>Admin · Pickleball EVNICT 2026</title>
<link rel="icon" href="img/ball.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/style.css">
</head>
<body class="admin">
<header class="hero">
  <div class="hero-inner">
    <div class="kicker">Ban tổ chức</div>
    <h1>Nhập <em>tỷ số</em></h1>
    <div class="meta"><span id="who"></span><a class="btn" href="./" target="_blank" style="color:#fff;border-color:rgb(255 255 255/.3);background:transparent">Xem trang công khai ↗</a></div>
  </div>
</header>
<main>
  <p class="empty" id="demo-note" hidden>Chế độ thử: dữ liệu chỉ lưu trong trình duyệt này, đăng nhập bằng bất kỳ email nào.</p>
  <section id="login" hidden>
    <form class="login" id="login-form">
      <h2>Đăng nhập</h2>
      <label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required>
      <label for="password">Mật khẩu</label><input id="password" name="password" type="password" autocomplete="current-password">
      <button class="primary" type="submit">Đăng nhập</button>
      <p class="err" id="login-err"></p>
    </form>
  </section>
  <section id="panel" hidden>
    <div class="toolbar">
      <span class="conn" id="conn">…</span>
      <select id="f-ev" aria-label="Nội dung"></select>
      <select id="f-round" aria-label="Lượt"></select>
      <span class="sp"></span>
      <button class="btn" id="logout">Đăng xuất</button>
    </div>
    <section id="ties" hidden>
      <h2 class="sec">Xử hòa thứ hạng</h2>
      <div id="ties-list"></div>
    </section>
    <div id="list"></div>
  </section>
</main>
<div id="toast" hidden></div>
<script type="module" src="js/admin.js"></script>
</body>
</html>
```

- [ ] **Step 2: Viết `public/js/admin.js`**

```js
import { buildView, nameOf } from './engine.js';
import { createStore } from './store.js';
import { esc, load, save, byRoundCourt } from './util.js';

const $ = s => document.querySelector(s);
const t = await fetch('data/tournament.json', { cache: 'no-cache' }).then(r => r.json());
const EVENTS = Object.fromEntries(t.events.map(e => [e.id, e]));
const store = await createStore();

let data = { scores: {}, overrides: {} };
let view = buildView(t);
const state = { ev: load('pb-admin-ev', 'ALL'), round: load('pb-admin-round', 'auto') };
let armed = null; // id trận đang chờ bấm lần 2 để xóa tỷ số

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 4000);
}
const fail = err => toast(`Lỗi ghi dữ liệu: ${err.code ?? err.message}`);

function currentRound() {
  const open = view.matches.filter(m => m.status !== 'done').map(m => m.round);
  return open.length ? Math.min(...open) : Math.max(...t.matches.map(m => m.round));
}

// Select chỉ dựng một lần để không đóng picker trên điện thoại khi dữ liệu đổi
function buildFilters() {
  $('#f-ev').innerHTML = [['ALL', 'Tất cả nội dung'], ...t.events.map(e => [e.id, e.name])]
    .map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('');
  $('#f-round').innerHTML = '<option value="auto" id="opt-auto"></option><option value="all">Tất cả lượt</option>'
    + Object.entries(t.rounds).map(([r, time]) => `<option value="${r}">Lượt ${r} · ${time}</option>`).join('');
  $('#f-ev').value = state.ev;
  $('#f-round').value = state.round;
  $('#f-ev').onchange = e => { state.ev = e.target.value; save('pb-admin-ev', state.ev); render(); };
  $('#f-round').onchange = e => { state.round = e.target.value; save('pb-admin-round', state.round); render(); };
}

function card(m) {
  const ready = Boolean(m.team1 && m.team2);
  const s = m.score ?? { s1: 0, s2: 0 };
  const locked = !ready || m.status === 'done';
  const side = n => {
    const code = m[`team${n}`];
    const name = code ? `<span class="code">${code}</span> ${esc(nameOf(t, m.event, code))}` : `<span class="tbd">${esc(m[`hint${n}`])}</span>`;
    return `<div class="a-side${m.winner === n ? ' win' : ''}"><div class="a-name">${name}</div>
      <div class="stepper"><button data-act="dec" data-side="${n}" ${locked ? 'disabled' : ''} aria-label="Trừ 1 điểm">−</button>
      <output>${s[`s${n}`]}</output>
      <button data-act="inc" data-side="${n}" ${locked ? 'disabled' : ''} aria-label="Cộng 1 điểm">+</button></div></div>`;
  };
  const clear = `<button data-act="clear" class="ghost">${armed === m.id ? 'Bấm lần nữa để xóa' : 'Xóa tỷ số'}</button>`;
  const actions = m.status === 'pending'
    ? `<button data-act="start" class="primary" ${ready ? '' : 'disabled'}>Bắt đầu trận</button>`
    : m.status === 'live'
      ? `<button data-act="finish" class="primary" ${s.s1 === s.s2 ? 'disabled title="Tỷ số đang hòa"' : ''}>Kết thúc trận</button>${clear}`
      : `<button data-act="reopen">Sửa lại</button>${clear}`;
  const pill = m.status === 'live' ? '<span class="pill live">● Đang đấu</span>' : m.status === 'done' ? '<span class="pill">Đã xong</span>' : '';
  return `<article class="a-match ${m.status}" data-id="${m.id}">
    <div class="match-meta"><b>Lượt ${m.round} · ${t.rounds[m.round]}</b><span>Sân ${m.court}</span><span class="ev">${esc(EVENTS[m.event].name)}</span><span>${esc(m.label)}</span><span class="sp"></span>${pill}</div>
    ${side(1)}${side(2)}
    <div class="a-actions">${actions}</div>
  </article>`;
}

function renderTies() {
  const items = [];
  for (const e of t.events) {
    for (const g of Object.values(view.standings[e.id])) if (g.pointsTie || g.overridden) items.push([e, g]);
  }
  $('#ties').hidden = !items.length;
  $('#ties-list').innerHTML = items.map(([e, g]) => {
    const badge = g.overridden ? '<span class="pill">BTC đã chốt</span>'
      : g.needsTiebreak ? '<span class="pill live">Hòa chỉ số — nhánh đấu đang chờ</span>'
        : '<span class="pill">Bằng điểm — kiểm lại theo Điều lệ III.3 nếu cần</span>';
    return `<article class="tie" data-ev="${e.id}" data-g="${g.group}">
      <h3>${esc(e.name)} · Bảng ${g.group} ${badge}</h3>
      <ol>${g.rows.map(r => `<li data-code="${r.code}"><span class="code">${r.code}</span>
        <span class="a-name">${esc(nameOf(t, e.id, r.code))} <small>${r.pts}đ · HS ${r.diff} · ghi ${r.pf}</small></span>
        <button data-act="up" aria-label="Lên">↑</button><button data-act="down" aria-label="Xuống">↓</button></li>`).join('')}</ol>
      <div class="a-actions"><button data-act="save" class="primary">Chốt thứ tự này</button>${g.overridden ? '<button data-act="reset" class="ghost">Bỏ chốt tay</button>' : ''}</div>
    </article>`;
  }).join('');
}

function render() {
  const cur = currentRound();
  $('#opt-auto').textContent = `Lượt hiện tại (${cur})`;
  const round = state.round === 'auto' ? cur : Number(state.round);
  const ms = view.matches
    .filter(m => (state.ev === 'ALL' || m.event === state.ev) && (state.round === 'all' || m.round === round))
    .sort(byRoundCourt);
  $('#list').innerHTML = ms.map(card).join('') || '<p class="empty">Không có trận nào.</p>';
  renderTies();
}

$('#list').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const id = b.closest('[data-id]').dataset.id;
  const cur = data.scores[id] ?? { s1: 0, s2: 0, status: 'live' };
  const put = v => store.setScore(id, v).catch(fail);
  const act = b.dataset.act;
  if (act !== 'clear') armed = null;
  if (act === 'inc' || act === 'dec') {
    const k = `s${b.dataset.side}`;
    const next = { s1: cur.s1, s2: cur.s2, status: 'live' };
    next[k] = Math.max(0, Math.min(99, cur[k] + (act === 'inc' ? 1 : -1)));
    put(next);
  } else if (act === 'start') put({ s1: 0, s2: 0, status: 'live' });
  else if (act === 'finish') put({ s1: cur.s1, s2: cur.s2, status: 'done' });
  else if (act === 'reopen') put({ s1: cur.s1, s2: cur.s2, status: 'live' });
  else if (act === 'clear') {
    if (armed === id) { armed = null; put(null); } else { armed = id; render(); }
  }
});

$('#ties-list').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const box = b.closest('.tie'), ol = box.querySelector('ol'), li = b.closest('li');
  const act = b.dataset.act;
  if (act === 'up' && li.previousElementSibling) ol.insertBefore(li, li.previousElementSibling);
  if (act === 'down' && li.nextElementSibling) ol.insertBefore(li.nextElementSibling, li);
  if (act === 'save') store.setOverride(box.dataset.ev, box.dataset.g, [...ol.children].map(x => x.dataset.code)).then(() => toast('Đã chốt thứ tự')).catch(fail);
  if (act === 'reset') store.setOverride(box.dataset.ev, box.dataset.g, null).catch(fail);
});

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  $('#login-err').textContent = '';
  try { await store.signIn(f.get('email'), f.get('password')); }
  catch (err) { $('#login-err').textContent = `Đăng nhập không được (${err.code ?? err.message})`; }
});
$('#logout').onclick = () => store.signOut();

$('#demo-note').hidden = !store.demo;
buildFilters();
store.onAuth(user => {
  $('#login').hidden = Boolean(user);
  $('#panel').hidden = !user;
  $('#who').textContent = user?.email ?? '';
});
store.onConnection(on => {
  const el = $('#conn');
  el.textContent = on ? 'Đã kết nối' : 'Mất kết nối — tỷ số sẽ gửi khi có mạng';
  el.className = `conn ${on ? 'on' : 'off'}`;
});
store.onData(d => { data = d; view = buildView(t, d.scores, d.overrides); render(); });
```

- [ ] **Step 3: Kiểm tra đầu-cuối trong chế độ thử (Playwright, 2 tab)**

Mở `http://localhost:5173/admin?demo` (tab A) và `http://localhost:5173/?demo` (tab B). Trong tab A: đăng nhập `btc@test`.
Expected:
- Danh sách mặc định "Lượt hiện tại (1)": 6 trận lượt 1.
- MD-G01: bấm "Bắt đầu trận" → + đội 1 năm lần → output 5; tab B (cùng context Playwright nên nhận sự kiện storage, không cần tải lại) thấy trận ở "Đang diễn ra" 5–0.
- Nút "Kết thúc trận" bị khóa khi tỷ số 5–5 (Review Focus #3); đưa về 11–5 → Kết thúc → pill "Đã xong", tab B bảng A: A1 có 3 điểm.
- "Xóa tỷ số" bấm 1 lần đổi chữ "Bấm lần nữa để xóa", bấm lần 2 xóa.
- Nhập 3 trận bảng C Đôi Nam hòa vòng tròn (G13 11–5, G14 5–11, G15 11–5): khu "Xử hòa" hiện "Hòa chỉ số — nhánh đấu đang chờ"; đổi thứ tự, "Chốt thứ tự này" → badge "BTC đã chốt", tab B xếp hạng bảng C theo thứ tự đã chốt (Review Focus #4).
- Kích thước 360px: nút +/− ≥ 48px, không cuộn ngang.
- Dọn: `localStorage.removeItem('pb-demo-db')`.

- [ ] **Step 4: Commit**

```bash
git add public/admin.html public/js/admin.js
git commit -m "Trang admin: nhập tỷ số, kết thúc trận, xử hòa thứ hạng"
```

---

### Task 6: Firebase — cấu hình, luật bảo mật, deploy

**Files:**
- Create: `firebase.json`, `.firebaserc`, `database.rules.json`, `README.md`
- Modify: `public/js/firebase-config.js` (điền cấu hình thật)

**Interfaces:**
- Consumes: toàn bộ `public/` (Task 4, 5).

- [ ] **Step 1: Viết `firebase.json`, `.firebaserc`, `database.rules.json`**

`firebase.json`:
```json
{
  "hosting": {
    "public": "public",
    "ignore": ["**/.*"],
    "cleanUrls": true,
    "headers": [
      { "source": "**/*.@(js|css|json|html)", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
      { "source": "**", "headers": [{ "key": "X-Robots-Tag", "value": "noindex, nofollow" }] }
    ]
  },
  "database": { "rules": "database.rules.json" }
}
```

`.firebaserc` (thay nếu project ID khác):
```json
{ "projects": { "default": "evnict-pickleball" } }
```

`database.rules.json` (`__ADMIN_UID__` được thay ở Step 4; `predeploy` chặn deploy nếu chưa thay):
```json
{
  "rules": {
    ".read": true,
    "scores": {
      "$match": {
        ".write": "auth != null && auth.uid === '__ADMIN_UID__'",
        ".validate": "newData.hasChildren(['s1', 's2', 'status']) && newData.child('s1').isNumber() && newData.child('s1').val() >= 0 && newData.child('s1').val() <= 99 && newData.child('s2').isNumber() && newData.child('s2').val() >= 0 && newData.child('s2').val() <= 99 && (newData.child('status').val() === 'live' || newData.child('status').val() === 'done')"
      }
    },
    "overrides": {
      ".write": "auth != null && auth.uid === '__ADMIN_UID__'"
    }
  }
}
```

- [ ] **Step 2: Viết `README.md`** — mô tả dự án, chạy thử (`npm test`, `npm run serve` + `?demo`), cập nhật dữ liệu (`npm run export`), các bước người dùng tạo Firebase (Step 3), deploy (`npm run deploy`), dọn dữ liệu trước ngày thi đấu, cách dùng trang admin.

- [ ] **Step 3: Người dùng tạo Firebase (cần tài khoản Google của họ)** — hướng dẫn từng bước trong chat:
  1. https://console.firebase.google.com → Add project → tên `evnict-pickleball` (không bật Google Analytics). Ghi lại Project ID thật.
  2. Build → Realtime Database → Create database → vị trí **Singapore (asia-southeast1)** → Start in **locked mode**.
  3. Build → Authentication → Get started → Sign-in method → bật **Email/Password**.
  4. Authentication → Users → Add user: email + mật khẩu BTC → copy **User UID**.
  5. Project settings → General → Your apps → Web (`</>`) → đăng ký app "web" (không tick Hosting) → copy khối `firebaseConfig`.
  6. Trong terminal: `! npx --yes firebase-tools login` (mở trình duyệt đăng nhập Google).
  Người dùng gửi lại: Project ID, UID admin, khối `firebaseConfig`. **Không gửi mật khẩu.**

- [ ] **Step 4: Điền cấu hình** — dán `firebaseConfig` vào `public/js/firebase-config.js`, thay `__ADMIN_UID__` trong `database.rules.json` bằng UID, sửa `.firebaserc` nếu Project ID khác.

- [ ] **Step 5: Deploy**

Run: `npm run deploy`
Expected: `Deploy complete!` kèm `Hosting URL: https://<project>.web.app`

- [ ] **Step 6: Kiểm luật bảo mật từ ngoài**

Run: `curl -s -X PUT -d '{"s1":1,"s2":0,"status":"live"}' "<databaseURL>/scores/TEST.json"`
Expected: `{"error" : "Permission denied"}`
Run: `curl -s "<databaseURL>/scores.json"` → Expected: `null` (đọc công khai được)

- [ ] **Step 7: Kiểm đầu-cuối trên bản thật (Playwright)** — người dùng đăng nhập admin trên trình duyệt của họ (mật khẩu không đi qua Claude) hoặc Claude mở `https://<project>.web.app/admin` để người dùng tự gõ. Nhập MD-G01 7–4 live; một tab khác mở `https://<project>.web.app/` thấy tỷ số cập nhật ≤ 3 giây không cần tải lại. Kiểm Review Focus #2: Playwright `context.setOffline(true)` ở tab admin → badge "Mất kết nối…"; bấm + → số tăng tại chỗ; `setOffline(false)` → tab người xem nhận số mới. Sau đó "Xóa tỷ số" MD-G01.

- [ ] **Step 8: Commit**

```bash
git add firebase.json .firebaserc database.rules.json README.md public/js/firebase-config.js
git commit -m "Cấu hình Firebase Hosting, luật bảo mật Realtime Database, hướng dẫn"
```

---

### Task 7: Đưa mã nguồn lên GitHub

**Files:** không tạo mới.

- [ ] **Step 1: Người dùng tạo repo trống** trên github.com (Public, không tạo README/.gitignore), ví dụ `evnict-pickleball-2026`, gửi URL.
- [ ] **Step 2: Kiểm tra repo không lẫn tài liệu nội bộ**

Run: `git ls-files`
Expected: chỉ `docs/`, `public/`, `tests/`, `tools/`, `package.json`, `.gitignore`, `firebase.json`, `.firebaserc`, `database.rules.json`, `README.md` — không có `.docx`, `.xlsx`, "Thanh toán".

- [ ] **Step 3: Push**

```bash
git branch -M main
git remote add origin <URL>
git push -u origin main
```
Expected: Git Credential Manager mở trình duyệt xác thực GitHub lần đầu; push thành công. Xác minh bằng `git ls-remote origin main` trùng `git rev-parse HEAD`.

- [ ] **Step 4: Bàn giao** — gửi người dùng: link trang công khai, link admin, checklist ngày thi đấu (tổng duyệt; trước 7h00 ngày 04/10 xóa dữ liệu thử bằng Firebase console → Realtime Database → xóa node `scores` và `overrides`; một người phụ trách nhập tỷ số mỗi sân hoặc một người cho cả giải).
