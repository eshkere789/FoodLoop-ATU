# Сквозной UI-тест в Chromium (демо-режим). Запуск: python3 tests/ui_test.py  (сервер на :8765)
import re, sys
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/index.html'
errs = []
def check(c, m):
    print(('  ✓ ' if c else '  ✗ ') + m)
    if not c: errs.append(m)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1280, 'height': 900}); pg = ctx.new_page()
    logs = []
    pg.on('console', lambda m: logs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
    def login(name):
        pg.goto(BASE + '#/login'); pg.wait_for_selector('[data-login]')
        pg.click(f'[data-login="{name}"]'); pg.wait_for_timeout(500)
    pg.goto(BASE); pg.wait_for_selector('.lot')
    n = pg.locator('.lot').count(); check(n >= 6, f'витрина: {n} лотов')
    pg.fill('#q', 'плов'); pg.wait_for_timeout(200); check(pg.locator('.lot').count() == 1, 'поиск по названию работает')
    pg.fill('#q', ''); pg.check('.alg[value="глютен"]'); pg.wait_for_timeout(200)
    check(pg.locator('.lot').count() < n, 'фильтр «без глютена» скрывает лоты'); pg.uncheck('.alg[value="глютен"]')
    pg.screenshot(path='/tmp/shot_showcase.png')
    # 1. ответственное лицо кофейни подаёт отчёт
    login('resp_5'); pg.goto(BASE + '#/form'); pg.wait_for_selector('.itemrow')
    pg.select_option('[data-f=product_id]', label='Йогурт'); pg.fill('[data-f=portions]', '10')
    check(pg.input_value('[data-f=quantity_kg]') == '2', 'масса подставилась автоматически (10 × 0.2 = 2 кг)')
    pg.select_option('[data-f=discount_reason]', label='Срок годности истекает завтра'); pg.fill('[data-f=shelf_days_left]', '1')
    pg.click('#send'); pg.wait_for_timeout(400); check('#/form' in pg.url, 'без галочки «состав проверен» отправка блокируется')
    pg.check('[data-f=checked]'); pg.click('#send'); pg.wait_for_url(re.compile('#/reports')); pg.wait_for_selector('table')
    check('Отправлена' in pg.inner_text('table'), 'отчёт появился в «Мои отчёты» со статусом «Отправлена»')
    pg.screenshot(path='/tmp/shot_reports.png')
    # 2. проверяющий принимает
    login('reviewer_1'); pg.goto(BASE + '#/review'); pg.wait_for_selector('table')
    check('Кофейня' in pg.inner_text('table'), 'отчёт кофейни в очереди проверки')
    pg.locator('tr', has_text='Кофейня').get_by_text('Проверить').first.click(); pg.wait_for_selector('#acc')
    check(pg.locator('.chk .ok').count() >= 4, 'автопроверки отмечены')
    pg.screenshot(path='/tmp/shot_review.png'); pg.click('#acc'); pg.wait_for_url(re.compile('#/review'))
    # 3. покупатель бронирует
    login('student_3'); pg.goto(BASE + '#/showcase'); pg.wait_for_selector('.lot')
    pg.fill('#q', 'йогурт'); pg.wait_for_timeout(200)
    lot = pg.locator('.lot', has_text='Кофейня'); check(lot.count() == 1, 'новый лот кофейни на витрине'); lot.first.click()
    pg.wait_for_selector('#book'); pg.select_option('#qty', '3'); pg.click('#book'); pg.wait_for_selector('.code')
    code = pg.inner_text('.code'); check(len(code) == 6, f'код выдачи {code}')
    pg.screenshot(path='/tmp/shot_booking.png')
    # 4. выдача
    login('resp_5'); pg.goto(BASE + '#/pickup'); pg.wait_for_selector('table'); pg.fill('#q', code); pg.wait_for_timeout(600)
    pg.click('[data-ok]'); pg.wait_for_timeout(400); check('Выдано' in pg.inner_text('table'), 'заказ выдан по коду')
    # 5. отзыв
    login('student_3'); pg.goto(BASE + '#/my-bookings'); pg.wait_for_selector('[data-fb]'); pg.click('[data-fb]')
    pg.fill('.m', 'Вкусно'); pg.click('.send'); pg.wait_for_timeout(500); check('Отзыв оставлен' in pg.inner_text('main'), 'отзыв оставлен')
    # 6. дашборд
    login('head'); pg.goto(BASE + '#/dashboard'); pg.wait_for_selector('#c1'); pg.wait_for_timeout(1200)
    check(pg.locator('.kpi').count() >= 8, 'KPI карточки'); check('Плов' in pg.inner_text('#recs'), 'рекомендация про плов')
    check(pg.evaluate("document.getElementById('c1').toDataURL().length") > 2000, 'графики нарисованы')
    pg.screenshot(path='/tmp/shot_dash.png', full_page=True)
    with pg.expect_download() as d: pg.click('#xls')
    check(d.value.suggested_filename.endswith('.xlsx'), 'выгрузка Excel: ' + d.value.suggested_filename)
    # 7. реестр и QR
    pg.goto(BASE + '#/registry'); pg.wait_for_selector('table'); pg.select_option('#rs', label='Остаток после обеда'); pg.wait_for_timeout(300)
    check('Итого' in pg.inner_text('table'), 'реестр с фильтрами и итогами')
    login('resp_1'); pg.goto(BASE + '#/qr'); pg.wait_for_selector('.qrcard svg'); check(pg.locator('.qrcard svg').count() == 1, 'QR для своей организации')
    pg.goto(BASE + '#/f/canteen-b'); pg.wait_for_selector('.err-box'); check('другой организации' in pg.inner_text('.err-box'), 'чужой QR запрещён')
    pg.goto(BASE + '#/f/canteen-main'); pg.wait_for_selector('.itemrow'); check(True, 'свой QR открывает форму')
    # 7b. QR для входа и заполнения формы с телефона
    pg.evaluate("sessionStorage.clear(); localStorage.removeItem('fl_base_url')"); pg.click('#logout'); pg.goto(BASE + '#/login'); pg.wait_for_selector('.phoneqr svg')
    check(pg.locator('.phoneqr svg').count() == 1, 'на странице входа есть QR «Войти с телефона»')
    check('localhost' in pg.inner_text('.phoneqr .warn'), 'на localhost показано предупреждение про адрес для телефона')
    pg.locator('.phoneqr summary').click(); pg.fill('[data-base]', '192.168.1.5:8000'); pg.click('[data-savebase]'); pg.wait_for_timeout(400)
    check('http://192.168.1.5:8000/#/login' in pg.inner_text('.phoneqr'), 'адрес QR можно заменить на адрес в сети')
    pg.evaluate("localStorage.removeItem('fl_base_url')")
    pg.goto(BASE + '#/f/canteen-main'); pg.wait_for_url(re.compile('#/login')); pg.wait_for_selector('[data-login]'); check('откроется форма учёта' in pg.inner_text('main'), 'скан QR формы гостем ведёт на вход с подсказкой')
    pg.click('[data-login="resp_1"]'); pg.wait_for_selector('.itemrow'); check('#/f/canteen-main' in pg.url, 'после входа открылась форма организации')
    check(pg.locator('#phoneqr').count() == 1, 'в форме есть блок «Заполнить с телефона»')
    pg.locator('#phoneqr > summary').click(); pg.wait_for_selector('#phoneqr .phoneqr svg')
    pg.select_option('[data-f=discount_reason]', index=1); check(pg.locator('#phoneqr[open]').count() == 1, 'блок QR остаётся раскрытым при вводе')
    pg.goto(BASE + '#/qr'); pg.wait_for_selector('.phoneqr svg'); check(pg.locator('.phoneqr svg').count() == 2, 'раздел QR-коды: вход и витрина')
    # 8. права
    login('student_1'); pg.goto(BASE + '#/dashboard'); pg.wait_for_selector('.err-box'); check('Нет доступа' in pg.inner_text('.err-box'), 'покупателю дашборд закрыт')
    pg.evaluate("sessionStorage.clear()"); pg.click('#logout'); pg.goto(BASE + '#/review'); pg.wait_for_url(re.compile('#/login')); check(True, 'гость перенаправлен на вход')
    # мобильный вид
    m = b.new_context(viewport={'width': 390, 'height': 800}).new_page(); m.goto(BASE); m.wait_for_selector('.lot'); m.screenshot(path='/tmp/shot_mobile.png')
    real = [l for l in logs if 'favicon' not in l]
    check(not real, 'ошибок в консоли нет' + ('' if not real else ': ' + '; '.join(real[:3])))
    b.close()
print('\nПровалов:', len(errs)); sys.exit(1 if errs else 0)
