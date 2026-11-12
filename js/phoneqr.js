// QR-коды для открытия сайта и формы учёта с телефона.
// Адрес берётся из адресной строки; если сайт открыт на localhost, телефон его не увидит,
// поэтому адрес можно переопределить (например, http://192.168.1.5:8000/) — он хранится в localStorage.
import { esc, toast } from './util.js';

const KEY = 'fl_base_url';

export function qrSvg(text) {
  const q = window.qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}

const defaultBase = () => location.origin + location.pathname;
export function getBase() { try { return localStorage.getItem(KEY) || defaultBase(); } catch { return defaultBase(); } }
export function normalizeBase(v) {
  v = String(v || '').trim().replace(/#.*$/, '');
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = 'http://' + v;
  try { new URL(v); } catch { return null; }
  return /\/$|\.html?$/i.test(v) ? v : v + '/';
}
export function setBase(v) {
  const n = normalizeBase(v);
  if (n === null) return false;
  try { n ? localStorage.setItem(KEY, n) : localStorage.removeItem(KEY); } catch { /* ignore */ }
  return true;
}
export const appUrl = (hash) => getBase() + hash;
export function isLocalHost() { try { return /^(localhost|127\.|\[?::1\]?$|0\.0\.0\.0)/.test(new URL(getBase()).hostname); } catch { return false; } }

// HTML карточки «Открыть с телефона»
export function phoneCard({ title, hash, hint, mock = false }) {
  const url = appUrl(hash);
  return `<div class="card phoneqr" data-hash="${esc(hash)}">
    <div class="phoneqr-in"><div class="phoneqr-img">${qrSvg(url)}</div>
    <div class="phoneqr-txt"><h3>${esc(title)}</h3><p class="muted small">${esc(hint || '')}</p>
      <p class="small" style="word-break:break-all"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></p>
      <p><button class="btn sec sm" data-copy>Копировать ссылку</button></p>
      ${isLocalHost() ? '<div class="warn small"><b>Адрес localhost не откроется на телефоне.</b> Укажите адрес компьютера в вашей Wi-Fi сети ниже (например, <code>http://192.168.1.5:8000/</code>) или откройте опубликованный сайт.</div>' : ''}
      ${mock ? '<p class="small muted">Демо-режим: данные хранятся в браузере каждого устройства, поэтому отчёт, отправленный с телефона, не появится на компьютере. Для общей базы включите режим Supabase.</p>' : ''}
      <details class="small"><summary>Изменить адрес сайта для QR</summary>
        <div class="row" style="margin-top:8px"><div><input data-base placeholder="http://192.168.1.5:8000/" value="${esc(getBase())}"></div></div>
        <p><button class="btn sm" data-savebase>Применить</button> <button class="btn sec sm" data-resetbase>Сбросить</button></p></details>
    </div></div></div>`;
}

// Навешивает обработчики на карточки внутри root. redraw вызывается после смены адреса.
export function bindPhoneCards(root, redraw) {
  root.querySelectorAll('.phoneqr').forEach((card) => {
    const url = appUrl(card.dataset.hash);
    card.querySelector('[data-copy]').onclick = async () => {
      try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); }
      catch { window.prompt('Скопируйте ссылку:', url); }
    };
    card.querySelector('[data-savebase]').onclick = () => {
      if (!setBase(card.querySelector('[data-base]').value)) { toast('Некорректный адрес', 'err'); return; }
      toast('Адрес для QR сохранён'); redraw();
    };
    card.querySelector('[data-resetbase]').onclick = () => { setBase(''); toast('Адрес сброшен'); redraw(); };
  });
}
