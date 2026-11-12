// Создаёт учётки в Supabase Auth для всех пользователей из data/users.json и связывает их с таблицей users.
// Запуск (на своём компьютере, service_role key нельзя выкладывать в репозиторий):
//   npm i @supabase/supabase-js
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_KEY=... DEMO_PASSWORD=demo1234 EMAIL_DOMAIN=foodloop-demo.app node supabase/create_demo_users.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, DEMO_PASSWORD = 'demo1234', EMAIL_DOMAIN = 'foodloop-demo.app' } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('Задайте SUPABASE_URL и SUPABASE_SERVICE_KEY'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const users = JSON.parse(readFileSync(new URL('../data/users.json', import.meta.url)));

for (const u of users) {
  const email = `${u.login}@${EMAIL_DOMAIN}`;
  let id;
  const { data, error } = await sb.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true });
  if (error) {
    if (!/already|registered|exists/i.test(error.message)) { console.error(email, error.message); continue; }
    const list = await sb.auth.admin.listUsers({ perPage: 1000 }); id = list.data.users.find((x) => x.email === email)?.id;
  } else id = data.user.id;
  if (!id) { console.error('нет id для', email); continue; }
  const { error: e2 } = await sb.from('users').update({ auth_id: id }).eq('user_id', u.user_id);
  console.log(e2 ? `ОШИБКА ${email}: ${e2.message}` : `ok ${email}`);
}
