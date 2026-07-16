import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

const supabaseUrl = 'https://guupgqeghfcrduhqfzrt.supabase.co';
const supabaseAnonKey = 'sb_publishable_APQhutK3Cj-EWW-UDfRgOA_JA8yHO4Q';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
