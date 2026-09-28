import { buildView, nameOf } from './engine.js';
import { createStore } from './store.js';
import { esc, load, save } from './util.js';

const $ = s => document.querySelector(s);
const t = await fetch('data/tournament.json', { cache: 'no-cache' }).then(r => r.json());
const EVENTS = Object.fromEntries(t.events.map(e => [e.id, e]));
const fatal = msg => { $('#fatal').textContent = msg; $('#fatal').hidden = !msg; };
const slow = setTimeout(() => fatal('Chưa tải được Firebase. Kiểm tra mạng hoặc chuyển sang 4G rồi tải lại trang.'), 10000);
let store;
try {
  store = await createStore();
} catch (err) {
  fatal('Không tải được Firebase. Kiểm tra mạng hoặc chuyển sang 4G rồi tải lại trang.');
  throw err;
} finally {
  clearTimeout(slow);
}
fatal('');

let data = { scores: {}, overrides: {} };
let view = buildView(t);
const KO = 'KO'; // mục "Loại trực tiếp" trong bộ lọc bảng
const groupsOf = ev => [...Object.keys(EVENTS[ev].groups), KO];
const state = { ev: load('pb-admin-ev', 'MD'), grp: load('pb-admin-grp', 'A') };
if (!EVENTS[state.ev]) state.ev = 'MD';
if (!groupsOf(state.ev).includes(state.grp)) state.grp = 'A';
let armed = null; // id trận đang chờ bấm lần 2 để xóa tỷ số
const drafts = new Map(); // "ev/g" → thứ tự đang sắp dở ở khu bằng điểm, giữ qua các lần vẽ lại
let online = false, everConnected = false, pending = 0;

// SDK web chỉ giữ thao tác chưa gửi trong bộ nhớ tab: mất mạng thì phải giữ trang mở
function renderConn() {
  const el = $('#conn');
  const wait = pending ? `, ${pending} thao tác chờ gửi` : '';
  el.className = `conn ${online || !everConnected ? 'on' : 'off'}`;
  el.textContent = !everConnected ? 'Đang kết nối…'
    : online ? (pending ? `Đang gửi ${pending} thao tác…` : 'Đã kết nối')
      : `Mất kết nối${wait}. Đừng đóng hay tải lại trang`;
}
const track = p => { pending++; renderConn(); return p.finally(() => { pending--; renderConn(); }); };

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 4000);
}
const fail = err => toast(`Không lưu được: ${err.code ?? err.message}`);

// Select chỉ dựng một lần để không đóng picker trên điện thoại khi dữ liệu đổi
function buildGroupOptions() {
  $('#f-grp').innerHTML = groupsOf(state.ev)
    .map(g => `<option value="${g}">${g === KO ? 'Loại trực tiếp' : `Bảng ${g}`}</option>`).join('');
  $('#f-grp').value = state.grp;
}

function buildFilters() {
  $('#f-ev').innerHTML = t.events.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
  $('#f-ev').value = state.ev;
  buildGroupOptions();
  $('#f-ev').onchange = e => {
    state.ev = e.target.value; save('pb-admin-ev', state.ev);
    if (!groupsOf(state.ev).includes(state.grp)) { state.grp = 'A'; save('pb-admin-grp', state.grp); }
    buildGroupOptions(); render();
  };
  $('#f-grp').onchange = e => { state.grp = e.target.value; save('pb-admin-grp', state.grp); render(); };
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
    <div class="match-meta"><span class="court-no">Sân ${m.court}</span><span class="ev">${esc(EVENTS[m.event].name)}</span><span>${esc(m.label)}</span><span class="sp"></span>${pill}</div>
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
    const draft = drafts.get(`${e.id}/${g.group}`);
    const rows = draft ? draft.map(c => g.rows.find(r => r.code === c)) : g.rows;
    return `<article class="tie" data-ev="${e.id}" data-g="${g.group}">
      <h3>${esc(e.name)}, bảng ${g.group} ${badge}${draft ? '<span class="pill live">Chưa lưu</span>' : ''}</h3>
      <ol>${rows.map(r => `<li data-code="${r.code}"><span class="code">${r.code}</span>
        <span class="a-name">${esc(nameOf(t, e.id, r.code))}<small>${r.pts} điểm, hiệu số ${r.diff > 0 ? '+' : ''}${r.diff}, ghi ${r.pf}</small></span>
        <button data-act="up" aria-label="Đưa lên">↑</button><button data-act="down" aria-label="Đưa xuống">↓</button></li>`).join('')}</ol>
      <div class="a-actions"><button data-act="save" class="primary">Chốt thứ tự này</button>${g.overridden ? '<button data-act="reset" class="ghost">Bỏ chốt, tính tự động</button>' : ''}</div>
    </article>`;
  }).join('');
}

function render() {
  const ms = view.matches.filter(m => m.event === state.ev
    && (state.grp === KO ? m.stage !== 'G' : m.stage === 'G' && m.group === state.grp));
  $('#list').innerHTML = ms.map(card).join('') || '<p class="empty">Không có trận nào.</p>';
  renderTies();
}

$('#list').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const id = b.closest('[data-id]').dataset.id;
  const cur = data.scores[id] ?? { s1: 0, s2: 0, status: 'live' };
  const put = v => track(store.setScore(id, v)).catch(fail);
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
  const box = b.closest('.tie'), { ev, g } = box.dataset, key = `${ev}/${g}`;
  const order = [...box.querySelectorAll('li')].map(x => x.dataset.code);
  const act = b.dataset.act;
  if (act === 'up' || act === 'down') {
    const i = order.indexOf(b.closest('li').dataset.code), j = act === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    drafts.set(key, order);
    renderTies();
  }
  if (act === 'save') track(store.setOverride(ev, g, order)).then(() => { drafts.delete(key); renderTies(); toast('Đã chốt thứ tự'); }).catch(fail);
  if (act === 'reset') { drafts.delete(key); track(store.setOverride(ev, g, null)).then(() => toast('Đã bỏ chốt')).catch(fail); }
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
  // .info/connected luôn báo false trước: chỉ báo mất kết nối sau khi đã từng kết nối
  if (on) everConnected = true;
  online = on;
  renderConn();
});
store.onData(d => { data = d; view = buildView(t, d.scores, d.overrides); render(); });
