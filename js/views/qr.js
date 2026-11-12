import { esc } from '../util.js';
import { qrSvg, getBase, phoneCard, bindPhoneCards } from '../phoneqr.js';

const base = () => getBase();

export default async function (root, ctx) {
  const draw = () => render(root, ctx, draw);
  await draw();
}

async function render(root, ctx, redraw) {
  let orgs = (await ctx.api.listOrgs()).filter((o) => o.is_active);
  if (ctx.user.role === 'responsible') orgs = orgs.filter((o) => o.org_id === ctx.user.org_id);
  root.innerHTML = `<h1>QR-коды</h1>
    <h2>Вход с телефона</h2>
    <div class="grid2">${phoneCard({ title: 'Вход в систему', hash: '#/login', hint: 'Сканируйте телефоном: откроется страница входа. После входа ответственное лицо попадает в форму учёта.' })}
    ${phoneCard({ title: 'Витрина для покупателей', hash: '#/showcase', hint: 'Открывает витрину со скидками (вход не нужен), удобно для плаката у кассы.' })}</div>
    <h2>Формы учёта организаций</h2><p class="muted">Сканируйте QR, чтобы открыть форму категоризации блюд нужной организации. Если вы ещё не вошли, сначала откроется страница входа, затем сразу форма. Адрес берётся из адресной строки; на localhost его нужно заменить на адрес компьютера в сети (см. «Изменить адрес»).</p>
    <div class="grid">${orgs.map((o) => { const url = `${base()}#/f/${o.qr_slug}`; return `<div class="card qrcard"><h3>${esc(o.organization)}</h3>${qrSvg(url)}<p class="small muted" style="word-break:break-all">${esc(url)}</p><button class="btn sm" data-print="${o.org_id}">Печать плаката</button></div>`; }).join('')}</div>`;
  bindPhoneCards(root, redraw);
  root.querySelectorAll('[data-print]').forEach((b) => {
    b.onclick = () => {
      const o = orgs.find((x) => x.org_id === Number(b.dataset.print)); const url = `${base()}#/f/${o.qr_slug}`;
      const w = window.open('', '_blank', 'width=700,height=900'); if (!w) { alert('Разрешите всплывающие окна для печати'); return; }
      w.document.write(`<html><head><meta charset="utf-8"><title>Плакат ${esc(o.organization)}</title><style>body{font-family:Calibri,Arial,sans-serif;text-align:center;padding:40px}h1{font-size:34px;margin:0 0 6px}h2{font-size:22px;font-weight:400;margin:0 0 20px}svg{width:420px;height:420px}p{font-size:18px}</style></head>
        <body><h1>${esc(o.organization)}</h1><h2>Сканируйте, чтобы внести остатки</h2>${qrSvg(url)}<p>FoodLoop АТУ · учёт остатков и продажа излишков</p><script>window.onload=()=>window.print()<\/script></body></html>`);
      w.document.close();
    };
  });
}
