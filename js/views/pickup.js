import { esc, badge, BOOKING_RU, kzt, today, fmtDT, emptyHtml, act } from '../util.js';

export default async function (root, ctx) {
  let q = '';
  const draw = async () => {
    const all = await ctx.api.orgBookings();
    const day = all.filter((b) => String(b.pickup_date).slice(0, 10) === today());
    const rows = day.filter((b) => !q || String(b.pickup_code).includes(q) || (b.buyer || '').toLowerCase().includes(q.toLowerCase()) || (b.product || '').toLowerCase().includes(q.toLowerCase()));
    const done = day.filter((b) => b.status === 'collected');
    root.innerHTML = `<h1>Выдача заказов</h1><p class="muted">Брони на сегодня. Введите код выдачи покупателя.</p>
      <div class="card"><div class="row"><div><label>Код выдачи, имя или блюдо</label><input id="q" value="${esc(q)}" placeholder="например, 482915"></div>
      <div class="fix"><b>Выдано:</b> ${done.reduce((a, b) => a + b.portions, 0)} порц. на ${kzt(done.reduce((a, b) => a + b.portions * (b.price_discount_kzt || 0), 0))}<br><span class="small muted">Всего броней сегодня: ${day.length}</span></div></div></div>
      ${rows.length ? `<div class="card tbl"><table><thead><tr><th>Код</th><th>Покупатель</th><th>Блюдо</th><th>Порции</th><th>Сумма</th><th>Организация</th><th>Статус</th><th></th></tr></thead><tbody>
      ${rows.map((b) => `<tr><td><b>${esc(b.pickup_code)}</b></td><td>${esc(b.buyer)}</td><td>${esc(b.product)}</td><td>${b.portions}</td><td>${kzt(b.portions * b.price_discount_kzt)}</td><td>${esc(b.organization)}</td><td>${badge(b.status, BOOKING_RU)}<div class="small muted">${fmtDT(b.booked_at)}</div></td>
      <td class="nowrap">${b.status === 'booked' ? `<button class="btn sm" data-ok="${b.booking_id}">Выдано</button> <button class="btn red sm" data-no="${b.booking_id}">Не забрано</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : emptyHtml('Броней на сегодня нет или ничего не найдено.')}`;
    const inp = root.querySelector('#q'); inp.oninput = () => { q = inp.value; clearTimeout(draw.t); draw.t = setTimeout(async () => { await draw(); const i2 = root.querySelector('#q'); i2.focus(); i2.setSelectionRange(q.length, q.length); }, 250); };
    root.querySelectorAll('[data-ok]').forEach((b) => { b.onclick = async () => { await act(() => ctx.api.markBooking(b.dataset.ok, 'collected'), 'Заказ выдан'); draw(); }; });
    root.querySelectorAll('[data-no]').forEach((b) => { b.onclick = async () => { await act(() => ctx.api.markBooking(b.dataset.no, 'no_show'), 'Отмечено: не забрано'); draw(); }; });
  };
  await draw();
}
