import { esc, kzt, badge, BOOKING_RU, fmtDT, fmtDate, emptyHtml, act } from '../util.js';

const CATS = ['вкус', 'свежесть', 'цена', 'выдача', 'состав', 'сервис'];
export default async function (root, ctx) {
  const draw = async () => {
    const rows = await ctx.api.myBookings();
    root.innerHTML = `<h1>Мои брони</h1>${rows.length ? '' : emptyHtml('Броней пока нет. Загляните на витрину.')}
      ${rows.map((b) => `<div class="card"><div class="row"><div><b>${esc(b.product)}</b> × ${b.portions} ${badge(b.status, BOOKING_RU)}<div class="small muted">${esc(b.organization)} · ${esc(b.building || '')} · ${fmtDate(b.pickup_date)} ${esc(b.pickup_from || '')}–${esc(b.pickup_to || '')}</div>
        <div class="small muted">Забронировано ${fmtDT(b.booked_at)} · ${kzt(b.portions * b.price_discount_kzt)}</div></div>
        <div class="fix">${b.status === 'booked' ? `<div class="code" style="font-size:26px;padding:4px 12px">${esc(b.pickup_code)}</div><div style="margin-top:6px"><button class="btn red sm" data-cancel="${b.booking_id}">Отменить</button></div>` : ''}
        ${b.status === 'collected' && !Number(b.has_feedback) ? `<button class="btn amber sm" data-fb="${b.booking_id}">Оставить отзыв</button>` : ''}
        ${b.status === 'collected' && Number(b.has_feedback) ? '<span class="small muted">Отзыв оставлен</span>' : ''}</div></div>
        <div id="fb${b.booking_id}"></div></div>`).join('')}`;
    root.querySelectorAll('[data-cancel]').forEach((btn) => { btn.onclick = async () => { if (!confirm('Отменить бронь?')) return; await act(() => ctx.api.cancelBooking(btn.dataset.cancel), 'Бронь отменена'); draw(); }; });
    root.querySelectorAll('[data-fb]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.fb, box = root.querySelector('#fb' + id);
        box.innerHTML = `<div class="row" style="margin-top:10px"><div><label>Оценка</label><select class="r">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${'★'.repeat(n)} (${n})</option>`).join('')}</select></div>
          <div><label>Категория</label><select class="c">${CATS.map((c) => `<option>${c}</option>`).join('')}</select></div></div>
          <label>Комментарий</label><textarea class="m" rows="2" placeholder="Что понравилось или не понравилось"></textarea>
          <p><button class="btn sm send">Отправить</button></p>`;
        box.querySelector('.send').onclick = async () => {
          await act(() => ctx.api.addFeedback(id, box.querySelector('.r').value, box.querySelector('.c').value, box.querySelector('.m').value), 'Спасибо за отзыв!'); draw();
        };
      };
    });
  };
  await draw();
}
