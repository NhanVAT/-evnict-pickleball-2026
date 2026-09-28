import { buildView, nameOf } from './engine.js';
import { createStore, isDemo } from './store.js';
import { esc, normalize, load, save, byRoundCourt } from './util.js';

const $ = s => document.querySelector(s);
const t = await fetch('data/tournament.json', { cache: 'no-cache' }).then(r => r.json());
const EVENTS = Object.fromEntries(t.events.map(e => [e.id, e]));
const TABS = ['home', 'groups', 'bracket'];
const OLD_TABS = { schedule: 'groups', standings: 'groups' }; // link cũ vẫn mở đúng tab
const STAGE_TITLE = { QF: 'Tứ kết', SF: 'Bán kết', F: 'Chung kết' };

const state = {
  grp: load('pb-grp', 'MD'), bracket: load('pb-bracket', 'MD'), q: load('pb-q', ''),
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
    <div class="match-meta"><span class="court-no">Sân ${m.court}</span><span class="ev">${esc(EVENTS[m.event].name)}</span><span>${esc(m.label)}</span><span class="sp"></span>${statusPill(m)}</div>
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
  const doneCount = view.matches.filter(m => m.status === 'done').length;
  const podiums = t.events.map(podiumCard).join('');
  $('#view-home').innerHTML = `
    <div class="progress"><div class="bar"><i style="width:${(doneCount / t.matches.length) * 100}%"></i></div><span>${doneCount}/${t.matches.length} trận đã xong</span></div>
    ${podiums ? `<h2 class="sec">Kết quả chung cuộc</h2><div class="grid">${podiums}</div>` : ''}
    <h2 class="sec">Đang diễn ra ${live.length ? `<span class="count">${live.length}</span>` : ''}</h2>
    ${live.length ? `<div class="grid">${live.map(m => matchCard(m)).join('')}</div>` : '<p class="empty">Chưa có trận nào đang đấu.</p>'}
    <h2 class="sec">Thông tin giải</h2>
    <dl class="info">
      <div><dt>Ngày thi đấu</dt><dd>${esc(t.dateText)}</dd></div>
      <div><dt>Giờ</dt><dd>${esc(t.hours)}</dd></div>
      <div><dt>Địa điểm</dt><dd>${esc(t.venue)}, ${t.courts} sân</dd></div>
      <div><dt>Nội dung</dt><dd>${t.events.map(e => esc(e.name)).join(', ')}</dd></div>
      <div><dt>Thể thức</dt><dd>Vòng bảng chạm 11, loại trực tiếp chạm 15</dd></div>
    </dl>`;
}

function renderGroups() {
  chips($('#groups-filter'), state.grp, false, v => { state.grp = v; save('pb-grp', v); renderGroups(); });
  const e = EVENTS[state.grp];
  const q = normalize(state.q.trim());
  const isMe = code => Boolean(q) && normalize(nameOf(t, e.id, code)).includes(q);
  $('#groups-list').innerHTML = Object.values(view.standings[e.id]).map(g => {
    const started = g.remaining < g.total;
    const ms = view.matches.filter(m => m.event === e.id && m.stage === 'G' && m.group === g.group);
    return `<section class="group-block">
    <article class="table-card">
      <header><h3>Bảng ${g.group}</h3><span class="muted small">${g.done ? 'Đã đấu xong' : `Còn ${g.remaining}/${g.total} trận`}</span></header>
      <table>
        <thead><tr><th>#</th><th class="l">Cặp</th><th title="Số trận">Trận</th><th title="Thắng">T</th><th title="Thua">B</th><th title="Hiệu số">HS</th><th title="Điểm">Điểm</th></tr></thead>
        <tbody>${g.rows.map(r => `<tr class="${r.rank <= 2 && started ? 'q' : ''}${isMe(r.code) ? ' me' : ''}">
          <td>${r.rank}</td><td class="l"><span class="code">${r.code}</span> ${esc(nameOf(t, e.id, r.code))}</td>
          <td>${r.played}</td><td>${r.won}</td><td>${r.lost}</td><td>${r.diff > 0 ? '+' : ''}${r.diff}</td><td><b>${r.pts}</b></td></tr>`).join('')}</tbody>
      </table>
      ${g.needsTiebreak ? '<p class="note">Có đội bằng nhau mọi chỉ số, Ban tổ chức đang xác định thứ hạng.</p>' : ''}
    </article>
    <div class="grid group-matches">${ms.map(m => matchCard(m, isMe(m.t1) || isMe(m.t2))).join('')}</div>
  </section>`;
  }).join('')
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

function render() { renderHome(); renderGroups(); renderBracket(); }

function showTab() {
  const h = location.hash.slice(1);
  const tab = TABS.includes(h) ? h : OLD_TABS[h] ?? 'home';
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
search.addEventListener('input', () => { state.q = search.value; save('pb-q', state.q); renderGroups(); });
addEventListener('hashchange', showTab);
showTab();
render();

const setConn = on => {
  document.body.dataset.conn = on ? 'on' : 'off';
  $('#conn-text').textContent = on ? 'Tỷ số cập nhật trực tiếp' : 'Mất kết nối, đang thử lại…';
};
const unavailable = () => {
  document.body.dataset.conn = 'off';
  $('#conn-text').textContent = 'Chưa tải được tỷ số trực tiếp. Lịch đấu vẫn xem được';
};
// Mạng chặn hoặc treo không báo lỗi: sau 10 giây chưa kết nối thì nói rõ, không để "Đang kết nối…" mãi
let everConnected = false;
const slow = setTimeout(() => { if (!everConnected) unavailable(); }, 10000);
try {
  const store = await createStore();
  $('#demo-badge').hidden = !isDemo();
  // .info/connected luôn báo false trước: chỉ báo mất kết nối sau khi đã từng kết nối
  store.onConnection(on => {
    if (on) { everConnected = true; clearTimeout(slow); }
    if (everConnected) setConn(on);
  });
  store.onData(d => { view = buildView(t, d.scores, d.overrides); render(); });
} catch (err) {
  console.error(err);
  clearTimeout(slow);
  unavailable();
}
