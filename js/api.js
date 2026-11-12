import { CONFIG } from './config.js';
import { browserMock } from './backend-mock.js';
import { createSupabase } from './backend-supabase.js';
export const api = CONFIG.MODE === 'supabase' ? createSupabase(CONFIG) : browserMock(CONFIG);
