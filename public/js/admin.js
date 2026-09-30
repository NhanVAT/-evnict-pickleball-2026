import { buildView, nameOf, forfeitScore } from './engine.js';
import { createStore } from './store.js';
import { ADMIN_UID } from './firebase-config.js';
import { esc, load, save, courtName, byRoundCourt } from './util.js';

const $ = s => document.querySelector(s);
const [t, referees] = await Promise.all(['data/tournament.json', 'data/referees.json']
  .map(u => fetch(u, { cache: 'no-cache' }).then(r => r.json())));
const REF_NAME = Object.fromEntries(referees.map(r => [r.uid, r.name]));
const EVENTS = Object.fromEntries(t.events.map(e => [e.id, e]));
const TABS = { admin: ['rounds', 'groups', 'bracket'], ref: ['mine', 'groups', 'bracket'] };
const STAGE_TITLE = { QF: 'Tứ kết', SF: 'Bán kết', F: 'Chung kết' };
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

let data = { scores: {}, overrides: {}, assign: {} };
let view = buildView(t);
const state = { ev: load('pb-admin-ev', 'MD'), bk: load('pb-admin-bk', 'MD') };
if (!EVENTS[state.ev]) state.ev = 'MD';
if (!EVENTS[state.bk]) state.bk = 'MD';
let armed = null; // id trận đang chờ bấm lần 2 để xóa tỷ số
let forfeitOpen = null; // id trận đang mở bảng chọn xử thua
const drafts = new Map(); // "ev/g" → thứ tự đang sắp dở ở khu bằng điểm, giữ qua các lần vẽ lại
let online = false, everConnected = false, pending = 0;
let me = null; // { uid, admin, name } của người đang đăng nhập

// Chế độ thử không có Firebase Auth: email trongtaiN@… đóng vai trọng tài N, email khác là BTC
const demoUid = email => {
  const m = /^trongtai(\d+)@/.exec(email ?? '');
  return m ? referees[m[1] - 1]?.uid ?? null : ADMIN_UID;
};
function whoIs(user) {
  if (!user) return null;
  const uid = store.demo ? demoUid(user.email) : user.uid;
  if (uid === ADMIN_UID) return { uid, admin: true, name: 'Ban tổ chức' };
  return { uid, admin: false, name: REF_NAME[uid] ?? null };
}
const canEdit = m => Boolean(me?.admin || (me?.uid && data.assign[m.id] === me.uid));
const refList = (selected, first) => first
  + referees.map(r => `<option value="${r.uid}"${r.uid === selected ? ' selected' : ''}>${r.id}. ${esc(r.name)}</option>`).join('');

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

function chips(el, value, onPick, events = t.events) {
  el.innerHTML = events.map(e => `<button class="chip${e.id === value ? ' on' : ''}" data-v="${e.id}" aria-pressed="${e.id === value}">${esc(e.name)}</button>`).join('');
  el.onclick = ev => { const b = ev.target.closest('button'); if (b) onPick(b.dataset.v); };
}

// ---------- Thẻ trận: nhập được (trận của mình / BTC) hoặc chỉ xem
function refLine(m) {
  if (me?.admin) {
    return `<label class="a-assign">Trọng tài <select data-act="assign">${refList(data.assign[m.id], '<option value="">Chưa giao</option>')}</select></label>`;
  }
  if (m.stage === 'G') return ''; // vòng bảng: trọng tài ghi ở đầu bảng
  const n = REF_NAME[data.assign[m.id]];
  return n ? `<div class="ref">Trọng tài: ${esc(n)}</div>` : '';
}

const stageLabel = m => (m.stage === 'G' ? `<span>${esc(m.label)}</span>` : `<span class="stage-tag st-${m.stage}">${esc(m.label)}</span>`);

function meta(m, pill) {
  return `<div class="match-meta"><span class="court-no">${esc(courtName(t, m.court))}</span><span class="ev">${esc(EVENTS[m.event].name)}</span>${stageLabel(m)}<span class="sp"></span>${pill}</div>
    <div class="when">Lượt ${m.round}, dự kiến ${t.rounds[m.round]}</div>`;
}

const REASON = { absent: 'vắng mặt / đến muộn', retired: 'bỏ cuộc giữa chừng' };

function statusPill(m) {
  if (m.status === 'live') return '<span class="pill live">Đang đấu</span>';
  if (m.status !== 'done') return '';
  return m.score.confirmed ? '<span class="pill ok">Đã xác nhận</span>' : '<span class="pill">Chờ BTC xác nhận</span>';
}

function forfeitLine(m) {
  const f = m.score?.forfeit;
  const code = f && m[`team${f.loser}`];
  return code ? `<p class="lock-note">${code} bị xử thua: ${REASON[f.reason]}</p>` : '';
}

// Điều lệ III.4: chọn đội bị xử thua và lý do; bỏ cuộc chỉ có khi trận đang đấu
function forfeitPanel(m) {
  const btn = (n, reason, text) => `<button data-act="ff" data-loser="${n}" data-reason="${reason}">${m[`team${n}`]} ${text}</button>`;
  return `<div class="ff"><p>Đội nào bị xử thua?</p>
    ${[1, 2].map(n => btn(n, 'absent', 'vắng mặt') + (m.status === 'live' ? btn(n, 'retired', 'bỏ cuộc') : '')).join('')}
    <button data-act="ff-cancel" class="ghost">Hủy</button></div>`;
}

function editCard(m) {
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
  const admin = Boolean(me?.admin);
  const confirmed = m.score?.confirmed === true;
  const clear = `<button data-act="clear" class="ghost">${armed === m.id ? 'Bấm lần nữa để xóa' : 'Xóa tỷ số'}</button>`;
  const ffBtn = ready ? '<button data-act="ff-open">Xử thua…</button>' : '';
  let actions;
  if (forfeitOpen === m.id) actions = forfeitPanel(m);
  else if (m.status === 'pending') actions = `<button data-act="start" class="primary" ${ready ? '' : 'disabled'}>Bắt đầu trận</button>${ffBtn}`;
  else if (m.status === 'live') actions = `<button data-act="finish" class="primary" ${s.s1 === s.s2 ? 'disabled title="Tỷ số đang hòa"' : ''}>Kết thúc trận</button>${ffBtn}${clear}`;
  // Trận đã kết thúc: chỉ BTC sửa/xóa/xác nhận; trọng tài chỉ xem (luật Firebase cũng chặn)
  else if (!admin) actions = `<p class="lock-note">${confirmed ? 'BTC đã xác nhận kết quả.' : 'Đã gửi kết quả, chờ BTC xác nhận.'} Cần sửa thì báo Ban tổ chức.</p>`;
  else if (confirmed) actions = '<button data-act="unconfirm">Bỏ xác nhận để sửa</button>';
  else actions = `<button data-act="confirm" class="primary">Xác nhận kết quả</button><button data-act="reopen">Sửa lại</button>${clear}`;
  const pill = statusPill(m);
  return `<article class="a-match ${m.status} stage-${m.stage}" data-id="${m.id}">
    ${meta(m, pill)}
    ${side(1)}${side(2)}
    ${forfeitLine(m)}
    <div class="a-actions">${actions}</div>
    ${refLine(m)}
  </article>`;
}

function viewCard(m) {
  const side = n => {
    const code = m[`team${n}`];
    const name = code ? esc(nameOf(t, m.event, code)) : `<span class="tbd">${esc(m[`hint${n}`])}</span>`;
    const pts = m.status === 'pending' ? '–' : m.score[`s${n}`];
    return `<div class="side${m.winner === n ? ' win' : ''}"><span class="code">${code ?? ''}</span><span class="name">${name}</span><span class="pts">${pts}</span></div>`;
  };
  return `<article class="match ${m.status} stage-${m.stage}" data-id="${m.id}">${meta(m, statusPill(m))}${refLine(m)}${side(1)}${side(2)}${forfeitLine(m)}</article>`;
}

const card = m => (canEdit(m) ? editCard(m) : viewCard(m));

// ---------- Tab Bảng đấu: xếp hạng ở trên, trận của bảng ở dưới
function groupHead(e, g, ms) {
  const refs = [...new Set(ms.map(m => data.assign[m.id] ?? ''))];
  if (me?.admin) {
    const cur = refs.length === 1 ? refs[0] : null;
    const first = (cur === null ? '<option value="__mixed" selected disabled>Nhiều trọng tài</option>' : '')
      + `<option value=""${cur === '' ? ' selected' : ''}>Chưa giao</option>`;
    return `<label class="a-assign">Trọng tài bảng <select data-act="assign-group" data-ev="${e.id}" data-g="${g.group}">${refList(cur, first)}</select></label>`;
  }
  const names = refs.map(u => REF_NAME[u]).filter(Boolean);
  return names.length ? `<div class="ref">Trọng tài: ${names.map(esc).join(', ')}</div>` : '';
}

// Trọng tài chỉ thấy bảng mình bắt (điện thoại màn nhỏ, tránh nhập nhầm); BTC thấy tất cả
const myGroup = (ev, g) => me?.admin
  || view.matches.some(m => m.event === ev && m.stage === 'G' && m.group === g && data.assign[m.id] === me?.uid);

function renderGroups() {
  const events = t.events.filter(e => Object.keys(e.groups).some(g => myGroup(e.id, g)));
  if (!events.length) {
    $('#groups-filter').innerHTML = '';
    $('#groups-list').innerHTML = '<p class="empty">Bạn chưa được giao bảng nào. Trận loại trực tiếp được giao (nếu có) nằm ở tab Nhánh đấu.</p>';
    $('#ties').hidden = true;
    return;
  }
  if (!events.some(e => e.id === state.ev)) state.ev = events[0].id;
  chips($('#groups-filter'), state.ev, v => { state.ev = v; save('pb-admin-ev', v); renderGroups(); }, events);
  $('#groups-filter').hidden = events.length < 2 && !me?.admin;
  const e = EVENTS[state.ev];
  $('#groups-list').innerHTML = Object.values(view.standings[e.id]).filter(g => myGroup(e.id, g.group)).map(g => {
    const ms = view.matches.filter(m => m.event === e.id && m.stage === 'G' && m.group === g.group);
    const mine = !me?.admin && ms.some(m => data.assign[m.id] === me?.uid);
    const started = g.remaining < g.total;
    return `<section class="group-block${mine ? ' mine-group' : ''}">
    <article class="table-card">
      <header><h3>Bảng ${g.group}${mine ? ' <span class="pill live">Bảng bạn bắt</span>' : ''}</h3><span class="muted small">${g.done ? 'Đã đấu xong' : `Còn ${g.remaining}/${g.total} trận`}</span></header>
      <div class="group-ref">${groupHead(e, g, ms)}</div>
      <table>
        <thead><tr><th>#</th><th class="l">Cặp</th><th title="Số trận">Trận</th><th title="Thắng">T</th><th title="Thua">B</th><th title="Hiệu số">HS</th><th title="Điểm">Điểm</th></tr></thead>
        <tbody>${g.rows.map(r => `<tr class="${r.rank <= 2 && started ? 'q' : ''}">
          <td>${r.rank}</td><td class="l"><span class="code">${r.code}</span> ${esc(nameOf(t, e.id, r.code))}</td>
          <td>${r.played}</td><td>${r.won}</td><td>${r.lost}</td><td>${r.diff > 0 ? '+' : ''}${r.diff}</td><td><b>${r.pts}</b></td></tr>`).join('')}</tbody>
      </table>
      ${g.needsTiebreak ? '<p class="note">Bằng mọi chỉ số, nhánh đấu đang chờ BTC chốt thứ tự.</p>' : ''}
    </article>
    <div class="grid group-matches">${ms.map(card).join('')}</div>
  </section>`;
  }).join('');
  if (me?.admin) renderTies(); else $('#ties').hidden = true;
}

// ---------- Tab Nhánh đấu
function renderBracket() {
  chips($('#bracket-filter'), state.bk, v => { state.bk = v; save('pb-admin-bk', v); renderBracket(); });
  const ko = view.matches.filter(m => m.event === state.bk && m.stage !== 'G');
  const cols = ['QF', 'SF', 'F'].map(s => ko.filter(m => m.stage === s)).filter(c => c.length);
  $('#bracket-list').innerHTML = `<div class="bracket">${cols.map(c => `
      <div class="col"><h3>${STAGE_TITLE[c[0].stage]}</h3><div class="slots">${c.map(card).join('')}</div></div>`).join('')}</div>`;
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

// ---------- Tab Theo lượt (BTC): lượt hiện tại = lượt nhỏ nhất còn trận chưa xong
const currentRound = () => {
  const open = view.matches.filter(m => m.status !== 'done').map(m => m.round);
  return open.length ? Math.min(...open) : null;
};

function renderRounds() {
  const cur = currentRound();
  const rounds = Object.keys(t.rounds).map(Number);
  const done = view.matches.filter(m => m.status === 'done').length;
  $('#rounds-summary').textContent = cur ? `Đang ở lượt ${cur}. ${done}/${t.matches.length} trận đã xong.` : 'Tất cả các trận đã xong.';
  $('#rounds-list').innerHTML = rounds.map(r => {
    const ms = view.matches.filter(m => m.round === r).sort(byRoundCourt);
    const fin = ms.filter(m => m.status === 'done').length, live = ms.filter(m => m.status === 'live').length;
    const state = fin === ms.length ? 'past' : r === cur ? 'now' : 'next';
    const tag = state === 'past' ? '<span class="pill ok">Xong</span>' : state === 'now' ? '<span class="pill live">Lượt hiện tại</span>' : '';
    return `<section class="round-block ${state}" id="round-${r}">
      <h2 class="sec">Lượt ${r} <span class="time">${t.rounds[r]}</span> ${tag}<span class="sp"></span><span class="muted small">${fin}/${ms.length} xong${live ? `, ${live} đang đấu` : ''}</span></h2>
      <div class="grid">${ms.map(card).join('')}</div>
    </section>`;
  }).join('');
}

// ---------- Tab Của tôi (trọng tài): đang bắt, sắp tới, đã xong
function renderMine() {
  const mine = view.matches.filter(m => data.assign[m.id] === me?.uid).sort(byRoundCourt);
  const part = (title, ms, empty) => `<h2 class="sec">${title} <span class="count-plain">${ms.length}</span></h2>
    ${ms.length ? `<div class="grid">${ms.map(card).join('')}</div>` : `<p class="empty">${empty}</p>`}`;
  const live = mine.filter(m => m.status === 'live');
  const next = mine.filter(m => m.status === 'pending');
  const done = mine.filter(m => m.status === 'done');
  $('#mine-list').innerHTML = !mine.length
    ? '<p class="empty">Chưa có trận nào được giao cho bạn. Báo Ban tổ chức nhé.</p>'
    : part('Đang bắt', live, next.length ? `Chưa bắt trận nào. Trận tiếp theo của bạn: lượt ${next[0].round}, ${esc(courtName(t, next[0].court))}.` : 'Không có trận nào đang bắt.')
      + part('Sắp tới', next, 'Bạn đã bắt hết các trận được giao.')
      + part('Đã xong', done, 'Chưa có trận nào xong.');
}

function render() {
  const known = Boolean(me?.admin || me?.name);
  $('#no-role').hidden = !me || known;
  document.querySelectorAll('.a-tabs, .view').forEach(el => el.classList.toggle('off', !known));
  if (!known) return;
  const mineCount = me.admin ? 0 : view.matches.filter(m => data.assign[m.id] === me.uid).length;
  $('#mine-note').hidden = me.admin;
  $('#mine-note').textContent = mineCount
    ? `Bạn được giao ${mineCount} trận, có nút nhập điểm. Các trận khác chỉ xem.`
    : 'Chưa có trận nào được giao cho bạn. Báo Ban tổ chức nhé.';
  document.querySelectorAll('[data-role]').forEach(a => { a.hidden = a.dataset.role !== (me.admin ? 'admin' : 'ref'); });
  if (me.admin) renderRounds(); else renderMine();
  renderGroups();
  renderBracket();
  showTab();
}

function showTab() {
  const h = location.hash.slice(1);
  const tabs = TABS[me?.admin ? 'admin' : 'ref'];
  const tab = tabs.includes(h) ? h : tabs[0];
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== `view-${tab}`; });
  document.querySelectorAll('.a-tabs a').forEach(a => {
    const on = a.getAttribute('href') === `#${tab}`;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

// ---------- Thao tác
$('#panel').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]');
  const host = b?.closest('[data-id]');
  if (!host) return;
  const id = host.dataset.id;
  const cur = data.scores[id] ?? { s1: 0, s2: 0, status: 'live' };
  const put = v => track(store.setScore(id, v)).catch(fail);
  const act = b.dataset.act;
  if (act !== 'clear') armed = null;
  if (act !== 'ff-open') forfeitOpen = null;
  if (act === 'inc' || act === 'dec') {
    const k = `s${b.dataset.side}`;
    const next = { s1: cur.s1, s2: cur.s2, status: 'live' };
    next[k] = Math.max(0, Math.min(99, cur[k] + (act === 'inc' ? 1 : -1)));
    put(next);
  } else if (act === 'start') put({ s1: 0, s2: 0, status: 'live' });
  else if (act === 'finish') put({ s1: cur.s1, s2: cur.s2, status: 'done' });
  else if (act === 'reopen') put({ s1: cur.s1, s2: cur.s2, status: 'live' });
  else if (act === 'confirm') put({ s1: cur.s1, s2: cur.s2, status: 'done', ...(cur.forfeit ? { forfeit: cur.forfeit } : {}), confirmed: true });
  else if (act === 'unconfirm') put({ s1: cur.s1, s2: cur.s2, status: 'done', ...(cur.forfeit ? { forfeit: cur.forfeit } : {}) });
  else if (act === 'ff-open') { forfeitOpen = id; render(); }
  else if (act === 'ff-cancel') render();
  else if (act === 'ff') put(forfeitScore(view.byId[id], data.scores[id], Number(b.dataset.loser), b.dataset.reason));
  else if (act === 'clear') {
    if (armed === id) { armed = null; put(null); } else { armed = id; render(); }
  }
});

$('#panel').addEventListener('change', e => {
  const sel = e.target.closest('select[data-act]');
  if (!sel) return;
  if (sel.dataset.act === 'assign') {
    const id = sel.closest('[data-id]').dataset.id;
    track(store.setAssign({ [id]: sel.value || null })).catch(fail);
  }
  if (sel.dataset.act === 'assign-group') {
    const { ev, g } = sel.dataset;
    const ids = t.matches.filter(m => m.event === ev && m.stage === 'G' && m.group === g).map(m => m.id);
    const uid = sel.value || null;
    track(store.setAssign(Object.fromEntries(ids.map(id => [id, uid]))))
      .then(() => toast(uid ? `Đã giao bảng ${g} (${ids.length} trận) cho ${REF_NAME[uid]}` : `Đã bỏ giao bảng ${g}`)).catch(fail);
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

// Trọng tài mở trang: nhảy tới nội dung có trận của mình (một lần mỗi lần đăng nhập)
let focused = false;
function focusMine() {
  if (focused || !me || me.admin) return;
  const m = view.matches.find(x => data.assign[x.id] === me.uid);
  if (!m) return;
  state.ev = m.event; state.bk = m.event;
  focused = true;
}

$('#goto-current').onclick = () => {
  const r = currentRound();
  if (r) document.getElementById(`round-${r}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

$('#demo-note').hidden = !store.demo;
addEventListener('hashchange', showTab);
showTab();
store.onAuth(user => {
  me = whoIs(user);
  focused = false;
  $('#login').hidden = Boolean(user);
  $('#panel').hidden = !user;
  $('#who').textContent = me ? (me.name ?? user.email) : '';
  focusMine();
  render();
});
store.onConnection(on => {
  // .info/connected luôn báo false trước: chỉ báo mất kết nối sau khi đã từng kết nối
  if (on) everConnected = true;
  online = on;
  renderConn();
});
store.onData(d => {
  data = d;
  view = buildView(t, d.scores, d.overrides);
  focusMine();
  render();
});
