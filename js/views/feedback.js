import { esc, fmtDT, emptyHtml, act } from '../util.js';
import { avgRating } from '../analytics.js';

export default async function (root, ctx) {
  const staff = ['responsible', 'admin'].includes(ctx.user.role);
  let list = await ctx.api.listFeedback(); let org = '', rating = '';
  const draw = () => {
    const orgs = [...new Set(list.map((f) => f.organization))].sort();
    const rows = list.filter((f) => (!org || f.organization === org) && (!rating || f.rating === Number(rating)));
    const avg = avgRating(rows);
    root.innerHTML = `<h1>Отзывы</h1><div class="card"><div class="row">${ctx.user.role !== 'buyer' && ctx.user.role !== 'responsible' ? `<div><label>Организация</label><select id="org"><option value="">Все</option>${orgs.map((o) => `<option ${o === org ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>` : ''}
      <div><label>Оценка</label><select id="rt"><option value="">Любая</option>${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${String(n) === rating ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="fix"><b>Средняя оценка:</b> ${avg ?? '—'} <span class="stars">★</span><br><span class="small muted">Отзывов: ${rows.length}</span></div></div></div>
      ${rows.length ? rows.map((f) => `<div class="card"><div class="stars">${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}</div><b>${esc(f.product)}</b> · ${esc(f.organization)} <span class="badge">${esc(f.category || '')}</span>
        <p>${esc(f.comment || '')}</p><div class="small muted">${fmtDT(f.created_at)}</div>
        ${f.reply ? `<div class="okbox small"><b>Ответ организации:</b> ${esc(f.reply)}</div>` : staff ? `<div class="row" style="margin-top:8px"><div><input placeholder="Ответ на отзыв" id="rp${f.feedback_id}"></div><div class="fix"><button class="btn sm" data-reply="${f.feedback_id}">Ответить</button></div></div>` : ''}</div>`).join('') : emptyHtml('Отзывов пока нет.')}`;
    const o = root.querySelector('#org'); if (o) o.onchange = () => { org = o.value; draw(); };
    root.querySelector('#rt').onchange = (e) => { rating = e.target.value; draw(); };
    root.querySelectorAll('[data-reply]').forEach((b) => { b.onclick = async () => {
      const t = root.querySelector('#rp' + b.dataset.reply).value.trim(); if (!t) return;
      await act(() => ctx.api.replyFeedback(b.dataset.reply, t), 'Ответ отправлен'); list = await ctx.api.listFeedback(); draw();
    }; });
  };
  draw();
}
