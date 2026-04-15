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
    const { email, api_key } = await req.json();

    if (!email || !api_key) {
      return new Response(
        JSON.stringify({ error: "Email e api_key são obrigatórios" }),
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
        JSON.stringify({ exists: false, error: "Chave de API inválida ou inativa" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update last_used_at
    await supabaseAdmin
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyData.id);

    // Check if user exists
    const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
    const user = userData?.users?.find((u) => u.email === email);

    if (!user) {
      return new Response(
        JSON.stringify({ exists: false, error: "E-mail não encontrado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile && !profile.is_active) {
      return new Response(
        JSON.stringify({ exists: false, error: "Acesso desativado. Contate o administrador." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        exists: true,
        user: {
          id: user.id,
          email: user.email,
          display_name: profile?.display_name || user.email,
          avatar_url: profile?.avatar_url,
          role_label: profile?.role_label,
        },
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
