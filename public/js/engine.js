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
  // Thứ tự BTC chốt chỉ phân định các đội bằng điểm (Điều lệ III.3), không vượt qua điểm:
  // nếu sau đó sửa tỷ số làm điểm thay đổi thì điểm vẫn quyết định trước.
  if (overridden) sorted = [...rows].sort((x, y) => y.pts - x.pts || override.indexOf(x.code) - override.indexOf(y.code));
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
