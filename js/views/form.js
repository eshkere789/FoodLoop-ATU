import { phoneCard, bindPhoneCards } from '../phoneqr.js';
import { esc, today, toast, act, REASONS, LAB_REASON, EDU_REASON, errorHtml } from '../util.js';

export default async function (root, ctx) {
  const [orgs, products] = await Promise.all([ctx.api.listOrgs(), ctx.api.listProducts()]);
  const user = ctx.user;
  let orgId = user.role === 'responsible' ? user.org_id : null, existing = null;
  if (ctx.params.slug) {
    const o = orgs.find((x) => x.qr_slug === ctx.params.slug);
    if (!o) { root.innerHTML = errorHtml('Организация с таким QR-кодом не найдена'); return; }
    if (user.role === 'responsible' && o.org_id !== user.org_id) { root.innerHTML = errorHtml(`Эта форма принадлежит другой организации («${o.organization}»). Войдите под её ответственным лицом.`); return; }
    orgId = o.org_id;
  }
  if (ctx.params.id) {
    existing = await ctx.api.getReport(ctx.params.id); orgId = existing.org_id;
    if (!['draft', 'returned'].includes(existing.status)) { root.innerHTML = errorHtml('Этот отчёт уже нельзя редактировать'); return; }
  }
  if (!orgId) orgId = orgs.find((o) => o.is_active)?.org_id;

  const org = () => orgs.find((o) => o.org_id === Number(orgId));
  const allowed = () => { const o = org(); return products.filter((p) => (o.is_lab ? p.is_lab_product : !o.can_sell ? !p.is_sellable : !p.is_lab_product && p.is_sellable)); };
  const reasons = () => { const o = org(); return o.is_lab ? [LAB_REASON] : !o.can_sell ? [EDU_REASON] : REASONS; };
  const blank = () => ({ product_id: '', quantity_kg: '', portions: '', discount_reason: reasons()[0], shelf_days_left: 0, checked: false, qtyTouched: false });
  let date = existing ? String(existing.report_date).slice(0, 10) : today();
  let items = existing ? existing.items.map((i) => ({ product_id: i.product_id, quantity_kg: i.quantity_kg, portions: i.portions, discount_reason: i.discount_reason, shelf_days_left: i.shelf_days_left, checked: true, qtyTouched: true })) : [blank()];

  let qrOpen = false;
  const draw = () => {
    const o = org(), prods = allowed();
    const permitBad = o.is_lab && !(o.permit_valid_until && String(o.permit_valid_until).slice(0, 10) >= date);
    root.innerHTML = `<h1>Форма учёта остатков</h1>
      ${existing && existing.status === 'returned' ? `<div class="warn"><b>Отчёт возвращён проверяющим:</b> ${esc(existing.reviewer_comment || '')}</div>` : ''}
      <div class="card"><div class="row">
        <div><label>Организация</label>${user.role === 'admin' && !ctx.params.slug && !existing ? `<select id="org">${orgs.filter((x) => x.is_active).map((x) => `<option value="${x.org_id}" ${x.org_id === Number(orgId) ? 'selected' : ''}>${esc(x.organization)}</option>`).join('')}</select>` : `<input value="${esc(o.organization)}" disabled>`}</div>
        <div><label>Дата</label><input type="date" id="date" value="${date}"></div></div>
        ${o.is_lab ? (permitBad ? '<div class="warn"><b>Допуск лаборатории не подтверждён или просрочен.</b> Отчёт можно отправить, но лоты на витрине не будут созданы.</div>' : `<div class="okbox small">Допуск лаборатории действует до ${esc(String(o.permit_valid_until).slice(0, 10))}${o.permit_supervisor ? ', куратор: ' + esc(o.permit_supervisor) : ''}.</div>`) : ''}
        ${!o.can_sell ? '<div class="okbox small">Эта организация только ведёт учёт: лоты на витрине не создаются.</div>' : ''}</div>
      ${existing ? '' : `<details class="noprint" id="phoneqr" style="margin-bottom:16px" ${qrOpen ? 'open' : ''}><summary><b>Заполнить с телефона (QR-код)</b></summary>${phoneCard({ title: 'Форма: ' + o.organization, hash: '#/f/' + o.qr_slug, hint: 'Наведите камеру телефона: откроется эта форма учёта (при необходимости сначала вход).', mock: ctx.config.MODE === 'mock' })}</details>`}
      <div id="items">${items.map((it, i) => {
        const p = prods.find((x) => x.product_id === Number(it.product_id));
        return `<div class="itemrow" data-i="${i}"><div class="row"><div><label>Продукт</label><select data-f="product_id"><option value="">— выберите —</option>${prods.map((x) => `<option value="${x.product_id}" ${x.product_id === Number(it.product_id) ? 'selected' : ''}>${esc(x.product)}</option>`).join('')}</select></div>
          <div><label>Порции</label><input type="number" min="1" step="1" data-f="portions" value="${esc(it.portions)}"></div>
          <div><label>Масса, кг</label><input type="number" min="0" step="0.01" data-f="quantity_kg" value="${esc(it.quantity_kg)}"></div>
          <div><label>Срок годности, дн.</label><input type="number" min="0" step="1" data-f="shelf_days_left" value="${esc(it.shelf_days_left)}"></div></div>
          <div class="row"><div><label>Причина уценки</label><select data-f="discount_reason">${reasons().map((r) => `<option ${r === it.discount_reason ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></div></div>
          ${p ? `<p class="small" style="margin:8px 0 2px"><b>Состав:</b> ${esc(p.composition || '—')}<br><b>Аллергены:</b> ${esc(p.allergens || '—')} · полная цена ${esc(p.price_full_kzt)} ₸ · порция ≈ ${Math.round(p.portion_kg * 1000)} г</p>` : ''}
          <label class="chk"><input type="checkbox" data-f="checked" ${it.checked ? 'checked' : ''}> Состав и аллергены проверены</label>
          ${items.length > 1 ? `<button class="btn red sm" data-del="${i}">Удалить позицию</button>` : ''}</div>`;
      }).join('')}</div>
      <p><button class="btn sec" id="add">+ Добавить позицию</button></p>
      <div class="card"><button class="btn sec" id="draft">Сохранить черновик</button> <button class="btn" id="send">Отправить на проверку</button></div>`;
    const pq = root.querySelector('#phoneqr'); if (pq) { pq.addEventListener('toggle', () => { qrOpen = pq.open; }); bindPhoneCards(pq, draw); }
    const orgSel = root.querySelector('#org'); if (orgSel) orgSel.onchange = () => { orgId = Number(orgSel.value); items = [blank()]; draw(); };
    root.querySelector('#date').onchange = (e) => { date = e.target.value; draw(); };
    root.querySelectorAll('.itemrow').forEach((row) => {
      const i = Number(row.dataset.i);
      row.querySelectorAll('[data-f]').forEach((el) => {
        const f = el.dataset.f;
        el.addEventListener(f === 'product_id' ? 'change' : 'input', () => {
          items[i][f] = el.type === 'checkbox' ? el.checked : el.value;
          if (f === 'quantity_kg') items[i].qtyTouched = true;
          if (f === 'product_id') { const p = prods.find((x) => x.product_id === Number(el.value)); if (p && items[i].portions && !items[i].qtyTouched) items[i].quantity_kg = Math.round(items[i].portions * p.portion_kg * 100) / 100; draw(); }
          if (f === 'portions') { const p = prods.find((x) => x.product_id === Number(items[i].product_id)); if (p && !items[i].qtyTouched && el.value) { items[i].quantity_kg = Math.round(el.value * p.portion_kg * 100) / 100; row.querySelector('[data-f=quantity_kg]').value = items[i].quantity_kg; } }
        });
      });
    });
    root.querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => { items.splice(Number(b.dataset.del), 1); draw(); }; });
    root.querySelector('#add').onclick = () => { items.push(blank()); draw(); };
    root.querySelector('#draft').onclick = () => save(true);
    root.querySelector('#send').onclick = () => save(false);
  };

  const save = async (draft) => {
    const errs = [];
    items.forEach((it, i) => {
      const n = i + 1;
      if (!it.product_id) errs.push(`Позиция ${n}: выберите продукт`);
      if (!(Number(it.portions) > 0)) errs.push(`Позиция ${n}: укажите порции`);
      if (!(Number(it.quantity_kg) > 0)) errs.push(`Позиция ${n}: укажите массу`);
      if (!(Number(it.shelf_days_left) >= 0) || it.shelf_days_left === '') errs.push(`Позиция ${n}: укажите срок годности (0 и больше)`);
      if (!draft && !it.checked) errs.push(`Позиция ${n}: подтвердите проверку состава`);
    });
    if (errs.length) { toast(errs[0] + (errs.length > 1 ? ` (и ещё ${errs.length - 1})` : ''), 'err'); return; }
    const r = await act(() => ctx.api.submitReport({ report_id: existing ? existing.report_id : undefined, org_id: Number(orgId), report_date: date, draft,
      items: items.map((it) => ({ product_id: Number(it.product_id), quantity_kg: Number(it.quantity_kg), portions: Number(it.portions), discount_reason: it.discount_reason, shelf_days_left: Number(it.shelf_days_left) })) }),
      draft ? 'Черновик сохранён' : 'Отчёт отправлен на проверку');
    if (r) ctx.nav('#/reports');
  };
  draw();
}
