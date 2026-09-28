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

export const courtName = (t, n) => t.courtNames?.[n] ?? `Sân ${n}`;
