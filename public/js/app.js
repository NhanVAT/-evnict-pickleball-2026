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
  if (m.status === 'live') return '<span class="pill live">Đang đấu</span>';
  if (m.status === 'done') return '<span class="pill">Kết thúc</span>';
  return '';
}

function side(m, n) {
  const code = m[`team${n}`];
  const name = code ? esc(nameOf(t, m.event, code)) : `<span class="tbd">${esc(m[`hint${n}`])}</span>`;
  const pts = m.status === 'pending' ? '–' : m.score[`s${n}`];
  return `<div class="side${m.winner === n ? ' win' : ''}"><span class="code">${code ?? ''}</span><span class="name">${name}</span><span class="pts">${pts}</span></div>`;
}

function matchCard(m, mine = false) {
  return `<article class="match ${m.status}${mine ? ' mine' : ''}">
    <div class="match-meta"><span class="court-no">Sân ${m.court}</span><span>${t.rounds[m.round]}</span><span class="ev">${esc(EVENTS[m.event].name)}</span><span>${esc(m.label)}</span><span class="sp"></span>${statusPill(m)}</div>
    ${side(m, 1)}${side(m, 2)}
  </article>`;
}

function podiumCard(e) {
  const p = view.podium[e.id];
  if (!p.champion) return '';
  const n = c => esc(nameOf(t, e.id, c));
  return `<article class="podium"><h3>${esc(e.name)}</h3><ol>
    <li class="g1"><span>Vô địch</span>${n(p.champion)}</li>
    <li><span>Hạng nhì</span>${n(p.runnerUp)}</li>
    ${p.thirds.map(c => `<li><span>Đồng hạng ba</span>${n(c)}</li>`).join('')}
  </ol></article>`;
}

function chips(el, value, withAll, onPick) {
  const items = [...(withAll ? [['ALL', 'Tất cả']] : []), ...t.events.map(e => [e.id, e.name])];
  el.innerHTML = items.map(([id, n]) => `<button class="chip${id === value ? ' on' : ''}" data-v="${id}" aria-pressed="${id === value}">${esc(n)}</button>`).join('');
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
    ${next ? `<h2 class="sec">Sắp đấu: lượt ${next} <span class="time">${t.rounds[next]}</span></h2><div class="grid">${upcoming.map(m => matchCard(m)).join('')}</div>` : ''}
    <h2 class="sec">Thông tin giải</h2>
    <dl class="info">
      <div><dt>Ngày thi đấu</dt><dd>${esc(t.dateText)}</dd></div>
      <div><dt>Giờ</dt><dd>${esc(t.hours)}</dd></div>
      <div><dt>Địa điểm</dt><dd>${esc(t.venue)}, ${t.courts} sân</dd></div>
      <div><dt>Nội dung</dt><dd>${t.events.map(e => esc(e.name)).join(', ')}</dd></div>
      <div><dt>Thể thức</dt><dd>Vòng bảng chạm 11, loại trực tiếp chạm 15</dd></div>
    </dl>`;
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
    : `<p class="empty">Không có trận nào${q ? ` của “${esc(state.q)}”. Thử gõ tên ngắn hơn, ví dụ chỉ tên riêng` : ''}.</p>`;
}

function renderStandings() {
  chips($('#standings-filter'), state.stand, false, v => { state.stand = v; save('pb-stand', v); renderStandings(); });
  const e = EVENTS[state.stand];
  $('#standings-list').innerHTML = Object.values(view.standings[e.id]).map(g => `
    <article class="table-card">
      <header><h3>Bảng ${g.group}</h3><span class="muted small">${g.done ? 'Đã đấu xong' : `Còn ${g.remaining}/${g.total} trận`}</span></header>
      <table>
        <thead><tr><th>#</th><th class="l">Cặp</th><th title="Số trận">Trận</th><th title="Thắng">T</th><th title="Thua">B</th><th title="Hiệu số">HS</th><th title="Điểm">Điểm</th></tr></thead>
        <tbody>${g.rows.map(r => `<tr class="${r.rank <= 2 && g.remaining < g.total ? 'q' : ''}">
          <td>${r.rank}</td><td class="l"><span class="code">${r.code}</span> ${esc(nameOf(t, e.id, r.code))}</td>
          <td>${r.played}</td><td>${r.won}</td><td>${r.lost}</td><td>${r.diff > 0 ? '+' : ''}${r.diff}</td><td><b>${r.pts}</b></td></tr>`).join('')}</tbody>
      </table>
      ${g.needsTiebreak ? '<p class="note">Có đội bằng nhau mọi chỉ số, Ban tổ chức đang xác định thứ hạng.</p>' : ''}
    </article>`).join('')
    + '<p class="muted small">Thắng được 3 điểm. Bằng điểm thì xét hiệu số, rồi tổng điểm ghi được. Nhất và nhì mỗi bảng (dòng tô màu) vào vòng loại trực tiếp.</p>';
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
  document.querySelectorAll('.tabs a').forEach(a => {
    const on = a.getAttribute('href') === `#${tab}`;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

// ---------- Khởi động: vẽ ngay từ dữ liệu cố định, rồi mới nối Firebase
$('#hero-meta').innerHTML = [t.dateText, t.hours, `${t.venue}, ${t.courts} sân`]
  .map(s => `<span>${esc(s)}</span>`).join('');
const search = $('#search');
search.value = state.q;
search.addEventListener('input', () => { state.q = search.value; save('pb-q', state.q); renderSchedule(); });
addEventListener('hashchange', showTab);
showTab();
render();

const setConn = on => {
  document.body.dataset.conn = on ? 'on' : 'off';
  $('#conn-text').textContent = on ? 'Tỷ số cập nhật trực tiếp' : 'Mất kết nối, đang thử lại…';
};
try {
  const store = await createStore();
  $('#demo-badge').hidden = !isDemo();
  store.onConnection(setConn);
  store.onData(d => { view = buildView(t, d.scores, d.overrides); render(); });
} catch (err) {
  console.error(err);
  setConn(false);
  $('#conn-text').textContent = 'Chưa tải được tỷ số trực tiếp. Lịch đấu vẫn xem được';
}
