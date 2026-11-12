import { esc, toast, ROLE_RU, HOME } from '../util.js';
import { phoneCard, bindPhoneCards } from '../phoneqr.js';

export default async function (root, ctx) {
  const draw = () => render(root, ctx, draw);
  await draw();
}

async function render(root, ctx, redraw) {
  const users = await fetch('data/users.json').then((r) => r.json()).catch(() => []);
  const groups = {};
  for (const u of users) (groups[u.role] ||= []).push(u);
  const order = ['buyer', 'responsible', 'reviewer', 'management', 'admin'];
  const pending = sessionStorage.getItem('pending') || '';
  const toForm = /^#\/(f|form)(\/|$)/.test(pending);
  root.innerHTML = `<div class="grid2"><div class="card"><h1>Вход</h1>
    ${toForm ? '<div class="okbox small">Войдите, и откроется форма учёта остатков (категоризация блюд).</div>' : ''}
    <p class="muted">Демо-платформа: все учётки тестовые, общий пароль <b>${esc(ctx.config.DEMO_PASSWORD)}</b>.</p>
    <label>Логин</label><input id="login" autocomplete="username" placeholder="например, student_1">
    <label>Пароль</label><input id="pass" type="password" autocomplete="current-password" value="${esc(ctx.config.DEMO_PASSWORD)}">
    <p><button class="btn" id="go">Войти</button></p></div>
    <div class="card"><h2>Войти как…</h2>${order.filter((r) => groups[r]).map((r) => `<h3>${esc(ROLE_RU[r])}</h3><div class="tabs">${
      (r === 'buyer' ? groups[r].slice(0, 4) : groups[r]).map((u) => `<button class="btn sec sm" data-login="${esc(u.login)}" title="${esc(u.full_name)}">${esc(r === 'responsible' ? (u.org_id + ') ' + (u.login)) : u.login)}</button>`).join('')}</div>`).join('')}
      <p class="small muted">Ответственные лица привязаны к организациям (resp_1 — столовая главного корпуса, resp_4 — лаборатория и т.д.).</p></div></div>
    ${phoneCard({ title: 'Войти с телефона', hash: '#/login', hint: 'Сканируйте QR камерой телефона, откроется эта страница входа.', mock: ctx.config.MODE === 'mock' })}`;
  bindPhoneCards(root, redraw);
  const submit = async (login, pass) => {
    try {
      const u = await ctx.api.login(login, pass);
      const pend = sessionStorage.getItem('pending'); sessionStorage.removeItem('pending');
      toast('Добро пожаловать, ' + u.full_name);
      location.hash = pend || HOME[u.role] || '#/showcase';
    } catch (e) { toast(e.message, 'err'); }
  };
  root.querySelector('#go').onclick = () => submit(root.querySelector('#login').value, root.querySelector('#pass').value);
  root.querySelector('#pass').onkeydown = (e) => { if (e.key === 'Enter') root.querySelector('#go').click(); };
  root.querySelectorAll('[data-login]').forEach((b) => { b.onclick = () => submit(b.dataset.login, root.querySelector('#pass').value); });
}
