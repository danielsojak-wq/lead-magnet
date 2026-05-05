import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Only allow @performind.cz domain
    if (!trimmedEmail.endsWith("@performind.cz")) {
      return new Response(
        JSON.stringify({ valid: false, error: "domain_not_allowed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up team user
    const { data: teamUser, error: lookupError } = await supabaseAdmin
      .from("team_users")
      .select("id, email, role, display_name, linked_am_id")
      .eq("email", trimmedEmail)
      .maybeSingle();

    if (lookupError) {
      console.error("Team user lookup error:", lookupError);
      return new Response(
        JSON.stringify({ error: "Database error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!teamUser) {
      return new Response(
        JSON.stringify({ valid: false, error: "not_registered" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all clients
    const { data: allClients } = await supabaseAdmin
      .from("clients")
      .select("slug, display_name, name")
      .order("name");

    const clients = allClients || [];

    // Build response based on role
    const response: Record<string, unknown> = {
      valid: true,
      name: teamUser.display_name || trimmedEmail.split("@")[0],
      clients,
    };

    if (teamUser.role === "admin") {
      response.isAdmin = true;
      response.slug = "admin";
    } else if (teamUser.role === "account_manager") {
      response.isAccountManager = true;
      response.slug = "am-overview";

      // Get AM's assigned client slugs
      if (teamUser.linked_am_id) {
        response.amId = teamUser.linked_am_id;
        const { data: assignments } = await supabaseAdmin
          .from("account_manager_clients")
          .select("client_slug")
          .eq("account_manager_id", teamUser.linked_am_id);

        response.assignedSlugs = (assignments || []).map((a: { client_slug: string }) => a.client_slug);
      } else {
        response.assignedSlugs = [];
      }
    } else if (teamUser.role === "marketing") {
      response.isMarketing = true;
      response.slug = "marketing-overview";
    }

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("verify-google-login error:", err);
    return new Response(
      JSON.stringify({ error: "Invalid request" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
