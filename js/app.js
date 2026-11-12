import { CONFIG } from './config.js';
import { api } from './api.js';
import { esc, $, toast, ROLE_RU, errorHtml, loadingHtml, HOME } from './util.js';

const ALL = ['buyer', 'responsible', 'reviewer', 'management', 'admin'];
const STAFF_FORM = ['responsible', 'admin'];
const ROUTES = [
  { re: /^#\/login$/, mod: 'login', public: true },
  { re: /^#\/showcase$/, mod: 'showcase', public: true },
  { re: /^#\/lot\/(\d+)$/, mod: 'lot', public: true, params: ['id'] },
  { re: /^#\/my-bookings$/, mod: 'mybookings', roles: ['buyer', 'admin'] },
  { re: /^#\/form$/, mod: 'form', roles: STAFF_FORM },
  { re: /^#\/form\/(\d+)$/, mod: 'form', roles: STAFF_FORM, params: ['id'] },
  { re: /^#\/f\/([\w-]+)$/, mod: 'form', roles: STAFF_FORM, params: ['slug'] },
  { re: /^#\/reports$/, mod: 'reports', roles: STAFF_FORM },
  { re: /^#\/report\/(\d+)$/, mod: 'report', roles: ['responsible', 'reviewer', 'admin', 'management'], params: ['id'] },
  { re: /^#\/review$/, mod: 'review', roles: ['reviewer', 'admin'] },
  { re: /^#\/registry$/, mod: 'registry', roles: ['reviewer', 'admin', 'management'] },
  { re: /^#\/pickup$/, mod: 'pickup', roles: STAFF_FORM },
  { re: /^#\/dashboard$/, mod: 'dashboard', roles: ['responsible', 'reviewer', 'admin', 'management'] },
  { re: /^#\/feedback$/, mod: 'feedback', roles: ALL },
  { re: /^#\/qr$/, mod: 'qr', roles: STAFF_FORM },
  { re: /^#\/notifications$/, mod: 'notifications', roles: ALL },
];
const MENU = {
  guest: [['#/showcase', 'Витрина']],
  buyer: [['#/showcase', 'Витрина'], ['#/my-bookings', 'Мои брони'], ['#/feedback', 'Отзывы'], ['#/notifications', 'Уведомления']],
  responsible: [['#/form', 'Форма учёта'], ['#/reports', 'Мои отчёты'], ['#/pickup', 'Выдача'], ['#/feedback', 'Отзывы'], ['#/dashboard', 'Дашборд'], ['#/qr', 'QR-коды'], ['#/showcase', 'Витрина'], ['#/notifications', 'Уведомления']],
  reviewer: [['#/review', 'Проверка'], ['#/registry', 'Реестр'], ['#/dashboard', 'Дашборд'], ['#/feedback', 'Отзывы'], ['#/showcase', 'Витрина'], ['#/notifications', 'Уведомления']],
  management: [['#/dashboard', 'Дашборд'], ['#/registry', 'Реестр'], ['#/feedback', 'Отзывы'], ['#/showcase', 'Витрина']],
  admin: [['#/showcase', 'Витрина'], ['#/my-bookings', 'Брони'], ['#/form', 'Форма учёта'], ['#/reports', 'Отчёты'], ['#/review', 'Проверка'], ['#/registry', 'Реестр'], ['#/pickup', 'Выдача'], ['#/dashboard', 'Дашборд'], ['#/feedback', 'Отзывы'], ['#/qr', 'QR'], ['#/notifications', 'Уведомления']],
};

const root = $('#app');
let user = null, leaveFns = [], token = 0;

const ctxBase = () => ({
  api, user, config: CONFIG,
  nav: (h) => { location.hash = h; },
  onLeave: (fn) => leaveFns.push(fn),
  refreshHeader: () => drawHeader(),
});

function drawHeader() {
  const role = user ? user.role : 'guest';
  const cur = location.hash || '#/showcase';
  $('#hdr').innerHTML = `<div class="hdr-in"><a class="brand" href="#/showcase">Food<span>Loop</span> АТУ</a>
    <nav>${(MENU[role] || []).map(([h, t]) => `<a href="${h}" class="${cur === h || (h !== '#/showcase' && cur.startsWith(h)) ? 'on' : ''}">${esc(t)}</a>`).join('')}</nav>
    <div class="userbox">${user ? `<span>${esc(user.full_name)}${user.full_name === ROLE_RU[user.role] ? '' : ' · ' + esc(ROLE_RU[user.role])}</span><button class="btn sec sm" id="logout">Выйти</button>` : '<a class="btn amber sm" href="#/login">Войти</a>'}</div></div>`;
  const lo = $('#logout'); if (lo) lo.onclick = async () => { await api.logout(); user = null; drawHeader(); location.hash = '#/showcase'; route(); };
}
function drawFooter() {
  $('#ftr').innerHTML = CONFIG.MODE === 'mock'
    ? `Демо-режим: данные синтетические и хранятся только в вашем браузере. <a href="#" id="resetDemo">Сбросить демо-данные</a>`
    : 'Подключена база данных Supabase. Данные синтетические.';
  const r = $('#resetDemo'); if (r) r.onclick = async (e) => { e.preventDefault(); if (confirm('Сбросить все изменения и вернуть исходные демо-данные?')) { await api.resetDemo(); user = null; toast('Демо-данные сброшены'); location.hash = '#/showcase'; route(); } };
}

async function route() {
  const my = ++token;
  leaveFns.forEach((f) => { try { f(); } catch { /* ignore */ } }); leaveFns = [];
  let hash = location.hash || '#/showcase';
  const def = ROUTES.map((r) => ({ r, m: hash.match(r.re) })).find((x) => x.m);
  if (!def) { location.hash = '#/showcase'; return; }
  try { user = await api.me(); } catch { user = null; }
  const { r, m } = def;
  if (!r.public && !user) { sessionStorage.setItem('pending', hash); location.hash = '#/login'; return; }
  if (r.roles && user && !r.roles.includes(user.role)) { root.innerHTML = `<div class="card err-box"><b>Нет доступа.</b> Этот раздел недоступен для роли «${esc(ROLE_RU[user.role])}».</div>`; drawHeader(); return; }
  drawHeader(); root.innerHTML = loadingHtml;
  const params = {}; (r.params || []).forEach((k, i) => { params[k] = m[i + 1]; });
  try {
    const mod = await import(`./views/${r.mod}.js`);
    if (my !== token) return;
    await mod.default(root, { ...ctxBase(), params });
  } catch (e) { console.error(e); if (my === token) root.innerHTML = errorHtml(e); }
}

window.addEventListener('hashchange', route);
(async () => {
  try { await api.init(); } catch (e) { root.innerHTML = errorHtml(e); return; }
  drawFooter();
  if (!location.hash) location.hash = '#/showcase'; else route();
})();
