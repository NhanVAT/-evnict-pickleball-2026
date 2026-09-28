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
const fail = err => toast(`Không lưu được: ${err.code ?? err.message}`);

function currentRound() {
  const open = view.matches.filter(m => m.status !== 'done').map(m => m.round);
  return open.length ? Math.min(...open) : Math.max(...t.matches.map(m => m.round));
}

// Select chỉ dựng một lần để không đóng picker trên điện thoại khi dữ liệu đổi
function buildFilters() {
  $('#f-ev').innerHTML = [['ALL', 'Tất cả nội dung'], ...t.events.map(e => [e.id, e.name])]
    .map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('');
  $('#f-round').innerHTML = '<option value="auto" id="opt-auto"></option><option value="all">Tất cả lượt</option>'
    + Object.entries(t.rounds).map(([r, time]) => `<option value="${r}">Lượt ${r}, ${time}</option>`).join('');
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
  const pill = m.status === 'live' ? '<span class="pill live">Đang đấu</span>' : m.status === 'done' ? '<span class="pill">Đã xong</span>' : '';
  return `<article class="a-match ${m.status}" data-id="${m.id}">
    <div class="match-meta"><span class="court-no">Sân ${m.court}</span><b>Lượt ${m.round}, ${t.rounds[m.round]}</b><span class="ev">${esc(EVENTS[m.event].name)}</span><span>${esc(m.label)}</span><span class="sp"></span>${pill}</div>
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
      : g.needsTiebreak ? '<span class="pill live">Bằng mọi chỉ số, nhánh đấu đang chờ BTC chốt</span>'
        : '<span class="pill">Bằng điểm, kiểm lại theo Điều lệ III.3 nếu cần</span>';
    return `<article class="tie" data-ev="${e.id}" data-g="${g.group}">
      <h3>${esc(e.name)}, bảng ${g.group} ${badge}</h3>
      <ol>${g.rows.map(r => `<li data-code="${r.code}"><span class="code">${r.code}</span>
        <span class="a-name">${esc(nameOf(t, e.id, r.code))}<small>${r.pts} điểm, hiệu số ${r.diff > 0 ? '+' : ''}${r.diff}, ghi ${r.pf}</small></span>
        <button data-act="up" aria-label="Đưa lên">↑</button><button data-act="down" aria-label="Đưa xuống">↓</button></li>`).join('')}</ol>
      <div class="a-actions"><button data-act="save" class="primary">Chốt thứ tự này</button>${g.overridden ? '<button data-act="reset" class="ghost">Bỏ chốt, tính tự động</button>' : ''}</div>
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
  $('#list').innerHTML = ms.map(card).join('') || '<p class="empty">Lượt này không có trận của nội dung đã chọn.</p>';
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
  if (act === 'reset') store.setOverride(box.dataset.ev, box.dataset.g, null).then(() => toast('Đã bỏ chốt')).catch(fail);
});

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  $('#login-err').textContent = '';
  try { await store.signIn(f.get('email'), f.get('password')); }
  catch (err) { $('#login-err').textContent = `Sai email hoặc mật khẩu (${err.code ?? err.message})`; }
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
  el.textContent = on ? 'Đã kết nối' : 'Mất kết nối, tỷ số sẽ gửi khi có mạng';
  el.className = `conn ${on ? 'on' : 'off'}`;
});
store.onData(d => { data = d; view = buildView(t, d.scores, d.overrides); render(); });
