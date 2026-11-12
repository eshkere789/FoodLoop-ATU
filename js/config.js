// Настройки прототипа FoodLoop АТУ
export const CONFIG = {
  // 'mock'     — всё работает прямо в браузере на демо-данных (ничего настраивать не нужно)
  // 'supabase' — реальная БД Supabase (заполните URL и anon key; схема в supabase/schema.sql)
  MODE: 'mock',
  SUPABASE_URL: '',          // ЗАГЛУШКА: https://xxxx.supabase.co
  SUPABASE_ANON_KEY: '',     // ЗАГЛУШКА: публичный anon key (service_role сюда НЕЛЬЗЯ)
  EMAIL_DOMAIN: 'foodloop-demo.app',   // домен для email учёток: <login>@<домен>
  DEMO_PASSWORD: 'demo1234', // ЗАГЛУШКА: общий демо-пароль
  TG_BOT_USERNAME: '@FoodLoopATU_bot', // ЗАГЛУШКА: имя вашего бота
  CO2_FACTOR: 2.5,           // кг CO2-экв. на 1 кг отходов (допущение, указать источник)
  LAUNCH_DATE: '2026-09-15', // условная дата запуска витрины
};
