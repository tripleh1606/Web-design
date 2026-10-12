const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim();

const supabase = createClient(url, key);

async function test() {
  const { data, error } = await supabase.from('shop_operating_hours').select('*');
  if (error) {
    console.error('DB ERROR:', error);
  } else {
    console.log('DB SUCCESS, data:', data);
  }
}
test();
