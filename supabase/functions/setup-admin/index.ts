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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Create test admin user
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: "admin@leadseller.com",
      password: "Admin@2026",
      email_confirm: true,
      user_metadata: { display_name: "Admin Lead Seller" },
    });

    if (userError) {
      return new Response(JSON.stringify({ error: userError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    // Assign admin role
    await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: "admin",
    });

    // Create test API key
    const apiKey = "ls_test_LeadSeller2026ProdAuthKey01abc";
    await supabaseAdmin.from("api_keys").insert({
      name: "Produção - Auth Login",
      key: apiKey,
      created_by: userId,
      is_active: true,
    });

    return new Response(
      JSON.stringify({
        message: "Admin criado com sucesso!",
        credentials: {
          email: "admin@leadseller.com",
          password: "Admin@2026",
        },
        api_key: apiKey,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
