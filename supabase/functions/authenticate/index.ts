import { createClient } from "npm:@supabase/supabase-js@2.49.4";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, password, api_key } = await req.json();

    if (!email || !password || !api_key) {
      return new Response(
        JSON.stringify({ error: "Email, password e api_key são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate API key
    const { data: keyData, error: keyError } = await supabaseAdmin
      .from("api_keys")
      .select("id, is_active")
      .eq("key", api_key)
      .eq("is_active", true)
      .maybeSingle();

    if (keyError || !keyData) {
      return new Response(
        JSON.stringify({ success: false, error: "Chave de API inválida" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authenticate user
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.session) {
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais inválidas" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Monta a URL de redirect com os tokens para a plataforma
    const platformUrl = Deno.env.get("PLATFORM_URL") || "https://id-preview--12ffc7ed-fdc7-4baf-9184-2fc1869c926f.lovable.app";
    const redirectUrl = `${platformUrl}/auth/callback?access_token=${authData.session.access_token}&refresh_token=${authData.session.refresh_token}`;

    return new Response(
      JSON.stringify({
        success: true,
        session: {
          access_token: authData.session.access_token,
          refresh_token: authData.session.refresh_token,
          expires_at: authData.session.expires_at,
        },
        redirectUrl,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
