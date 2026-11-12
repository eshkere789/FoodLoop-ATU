import { esc, kzt, loadingHtml, emptyHtml } from '../util.js';

const ALLERGENS = ['глютен', 'молоко', 'яйцо'];

export default async function (root, ctx) {
  let lots = await ctx.api.listLots();
  root.innerHTML = `<h1>Витрина лотов</h1><p class="muted">Остатки со скидкой на сегодня. Состав и аллергены указаны в карточке.</p>
    <div class="card"><div class="row"><div><label>Поиск</label><input id="q" placeholder="Название блюда"></div>
    <div><label>Организация</label><select id="org"></select></div>
    <div><label>Цена до, ₸</label><input id="max" type="number" min="0" placeholder="любая"></div>
    <div><label>Сортировка</label><select id="sort"><option value="disc">Сначала большая скидка</option><option value="price">Сначала дешевле</option><option value="time">По времени выдачи</option></select></div></div>
    <div class="row" style="margin-top:6px"><div class="fix"><label><input type="checkbox" id="lab"> Только лаборатории</label></div>
    <div class="fix"><label>Без аллергенов:</label></div>${ALLERGENS.map((a) => `<div class="fix"><label><input type="checkbox" class="alg" value="${a}"> ${a}</label></div>`).join('')}</div></div>
    <div id="grid" class="grid">${loadingHtml}</div>`;
  const $q = (s) => root.querySelector(s);
  const draw = () => {
    const sel = $q('#org').value;
    const orgs = [...new Set(lots.map((l) => l.organization))].sort();
    $q('#org').innerHTML = '<option value="">Все</option>' + orgs.map((o) => `<option ${o === sel ? 'selected' : ''}>${esc(o)}</option>`).join('');
    const q = $q('#q').value.trim().toLowerCase(), max = Number($q('#max').value) || Infinity, lab = $q('#lab').checked;
    const algs = [...root.querySelectorAll('.alg:checked')].map((c) => c.value);
    let rows = lots.filter((l) => (!sel || l.organization === sel) && (!q || l.product.toLowerCase().includes(q)) && l.price_discount_kzt <= max && (!lab || l.is_lab) && !algs.some((a) => (l.allergens || '').toLowerCase().includes(a)));
    const s = $q('#sort').value;
    rows.sort((a, b) => s === 'price' ? a.price_discount_kzt - b.price_discount_kzt : s === 'time' ? String(a.pickup_from).localeCompare(String(b.pickup_from)) : b.discount_pct - a.discount_pct);
    $q('#grid').innerHTML = rows.length ? rows.map((l) => `<a class="lot" href="#/lot/${l.item_id}">
      <div>${l.is_lab ? '<span class="pill lab">Лаборатория</span> ' : ''}<span class="pill disc">−${l.discount_pct}%</span></div>
      <div class="t">${esc(l.product)}</div><div class="muted small">${esc(l.organization)} · ${esc(l.building || '')}</div>
      <div style="margin:6px 0"><span class="price">${kzt(l.price_discount_kzt)}</span><span class="old">${kzt(l.price_full_kzt)}</span></div>
      <div class="small">Осталось: <b>${l.remaining}</b> порц. · срок: ${l.shelf_days_left} дн.</div>
      <div class="small muted">Выдача ${esc(l.pickup_from)}–${esc(l.pickup_to)}</div></a>`).join('') : emptyHtml('Подходящих лотов нет. Измените фильтры или зайдите позже.');
  };
  root.querySelectorAll('input,select').forEach((el) => el.addEventListener('input', draw));
  draw();
  const t = setInterval(async () => { try { lots = await ctx.api.listLots(); draw(); } catch { /* ignore */ } }, 20000);
  ctx.onLeave(() => clearInterval(t));
}
