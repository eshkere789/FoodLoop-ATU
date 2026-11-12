import { esc, fmtDT, emptyHtml, act } from '../util.js';

export default async function (root, ctx) {
  const msgs = await ctx.api.notifications();
  const demo = ctx.config.MODE === 'mock';
  root.innerHTML = `<h1>Уведомления</h1>
    <div class="card"><h2>Telegram-бот</h2><p>Бот присылает: новые лоты, подтверждение брони с кодом выдачи, возврат отчёта. ${demo ? 'В демо-режиме бот не подключён, поэтому сообщения показаны здесь: так они выглядели бы в Telegram.' : ''}</p>
    <p><button class="btn amber" id="tg">Получить код для привязки</button></p><div id="tgout"></div></div>
    ${demo ? `<h2>Очередь сообщений бота</h2>${msgs.length ? msgs.map((m) => `<div class="card"><div class="small muted">${fmtDT(m.created_at)}${m.user_id === null ? ' · рассылка подписчикам' : ''}</div>${esc(m.text)}</div>`).join('') : emptyHtml('Пока нет сообщений. Забронируйте лот или примите отчёт.')}` : ''}`;
  root.querySelector('#tg').onclick = async () => {
    const code = await act(() => ctx.api.createTgCode());
    if (code) root.querySelector('#tgout').innerHTML = `<div class="code">${esc(code)}</div><p class="small muted">Откройте бота ${esc(ctx.config.TG_BOT_USERNAME)} и отправьте: <b>/start ${esc(code)}</b></p>`;
  };
}
