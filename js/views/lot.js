import { esc, kzt, toast, act } from '../util.js';

export default async function (root, ctx) {
  const l = await ctx.api.getLot(ctx.params.id);
  const alg = (l.allergens || '').toLowerCase();
  root.innerHTML = `<p><a href="#/showcase">← К витрине</a></p><div class="grid2"><div class="card">
    <div>${l.is_lab ? '<span class="pill lab">Лаборатория</span> ' : ''}<span class="pill disc">−${l.discount_pct}%</span></div>
    <h1>${esc(l.product)}</h1><p class="muted">${esc(l.organization)} · ${esc(l.building || '')}</p>
    <p><span class="price">${kzt(l.price_discount_kzt)}</span><span class="old">${kzt(l.price_full_kzt)}</span> за порцию</p>
    <h3>Состав</h3><p>${esc(l.composition || 'не указан')}</p>
    <h3>Аллергены</h3><p>${alg && alg !== 'нет' ? `<span class="pill disc">${esc(l.allergens)}</span>` : '<span class="pill lab">нет</span>'}</p>
    <p class="small muted">Причина уценки: ${esc(l.discount_reason)} · срок годности: ${l.shelf_days_left} дн. · масса порции ≈ ${Math.round(l.portion_kg * 1000)} г</p></div>
    <div class="card" id="side"><h2>Бронирование</h2><p>Осталось порций: <b id="rem">${l.remaining}</b><br>Выдача сегодня: <b>${esc(l.pickup_from)}–${esc(l.pickup_to)}</b>, ${esc(l.building || '')}</p>
    <label>Количество порций</label><select id="qty">${Array.from({ length: Math.min(l.remaining, 10) }, (_, i) => `<option>${i + 1}</option>`).join('')}</select>
    <p><button class="btn" id="book">Забронировать</button></p>
    ${ctx.user ? '' : '<p class="small muted">Для брони нужно войти как покупатель.</p>'}</div></div>`;
  root.querySelector('#book').onclick = async () => {
    if (!ctx.user) { sessionStorage.setItem('pending', '#/lot/' + l.item_id); location.hash = '#/login'; return; }
    const qty = Number(root.querySelector('#qty').value);
    const b = await act(() => ctx.api.createBooking(l.item_id, qty));
    if (!b) return;
    root.querySelector('#side').innerHTML = `<h2>Бронь подтверждена</h2><p>${esc(l.product)} × ${b.portions} порц. — ${kzt(b.portions * l.price_discount_kzt)}</p>
      <p class="muted">Покажите код при получении:</p><div class="code">${esc(b.pickup_code)}</div>
      <p>Выдача сегодня ${esc(l.pickup_from)}–${esc(l.pickup_to)}, ${esc(l.organization)}, ${esc(l.building || '')}.</p>
      <p><a class="btn" href="#/my-bookings">Мои брони</a> <a class="btn sec" href="#/showcase">К витрине</a></p>`;
    toast('Забронировано');
  };
}
