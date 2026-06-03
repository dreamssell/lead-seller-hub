import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const supabase = createClient("https://xyz.supabase.co", "apikey");
console.log("getClaims exists:", typeof supabase.auth.getClaims);
