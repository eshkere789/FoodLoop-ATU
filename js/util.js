export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const kzt = (n) => (n == null || n === '' ? '—' : new Intl.NumberFormat('ru-RU').format(Math.round(Number(n))) + ' ₸');
export const num = (n, d = 1) => (n == null || n === '' ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: d }).format(Number(n)));
export const fmtDate = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('.') : '—');
export const fmtDT = (s) => (s ? fmtDate(s) + ' ' + String(s).slice(11, 16) : '—');

export const STATUS_RU = { draft: 'Черновик', submitted: 'Отправлена', under_review: 'На проверке', accepted: 'Принята', returned: 'Возвращена' };
export const BOOKING_RU = { booked: 'Забронировано', collected: 'Выдано', no_show: 'Не забрано', cancelled: 'Отменено' };
export const ROLE_RU = { responsible: 'Ответственное лицо', reviewer: 'Проверяющий', admin: 'Администратор', management: 'Руководство', buyer: 'Покупатель' };
export const REASONS = ['Остаток после обеда', 'Срок годности истекает сегодня', 'Срок годности истекает завтра', 'Излишки поставки', 'Нестандартный вид'];
export const LAB_REASON = 'Лабораторная партия после дегустации';
export const EDU_REASON = 'Отходы учебного занятия (очистки)';
export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export const badge = (status, map = STATUS_RU) => `<span class="badge st-${esc(status)}">${esc(map[status] || status)}</span>`;

export function toast(msg, type = 'ok') {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), type === 'err' ? 6000 : 3200);
}
export const loadingHtml = '<div class="loading"><span class="spin"></span> Загрузка…</div>';
export const emptyHtml = (t) => `<div class="empty">${esc(t)}</div>`;
export const errorHtml = (e) => `<div class="card err-box"><b>Ошибка.</b> ${esc(e && e.message ? e.message : e)}</div>`;

// Выполнить действие с обработкой ошибки и тостом
export async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { toast(e.message || String(e), 'err'); return undefined; }
}
export function downloadXlsx(sheets, filename) {
  if (!window.XLSX) { toast('Библиотека Excel не загружена', 'err'); return; }
  const wb = window.XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = window.XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Нет данных': '' }]);
    if (rows.length) ws['!cols'] = Object.keys(rows[0]).map((k) => ({ wch: Math.min(40, Math.max(10, k.length + 2)) }));
    window.XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  window.XLSX.writeFile(wb, filename);
}

export const HOME = { buyer: '#/showcase', responsible: '#/form', reviewer: '#/review', management: '#/dashboard', admin: '#/dashboard' };
