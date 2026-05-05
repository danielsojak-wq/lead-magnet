import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { client, password } = await req.json();

    if (!client || !password || typeof client !== "string" || typeof password !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const trimmedClient = client.trim().toLowerCase();

    // Check if this is an admin login
    if (trimmedClient === "admin") {
      const { data: isAdmin } = await supabaseAdmin.rpc("verify_admin_password", {
        _username: "admin",
        _password: password,
      });

      if (!isAdmin) {
        await new Promise((r) => setTimeout(r, 300));
        return new Response(
          JSON.stringify({ valid: false }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: clients } = await supabaseAdmin
        .from("clients")
        .select("slug, display_name, name")
        .order("name");

      return new Response(
        JSON.stringify({
          valid: true,
          isAdmin: true,
          slug: "admin",
          name: "Performind Admin",
          clients: clients || [],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if this is an account manager login (email, display name, or email prefix)
    const { data: amAccounts } = await supabaseAdmin
      .from("account_managers")
      .select("id, username, display_name");

    const normalize = (v: string | null | undefined) => (v || "").trim().toLowerCase();

    const matchedAM = (amAccounts || []).find((am: { id: string; username: string; display_name: string | null }) => {
      const username = normalize(am.username);
      const displayName = normalize(am.display_name);
      const usernamePrefix = normalize(am.username?.split("@")[0]);
      return username === trimmedClient || displayName === trimmedClient || usernamePrefix === trimmedClient;
    });

    if (matchedAM) {
      const { data: isAM } = await supabaseAdmin.rpc("verify_am_password", {
        _username: matchedAM.username,
        _password: password,
      });

      if (isAM) {
        // Get all clients
        const { data: allClients } = await supabaseAdmin
          .from("clients")
          .select("slug, display_name, name")
          .order("name");

        // Get AM's assigned client slugs
        const { data: assignments } = await supabaseAdmin
          .from("account_manager_clients")
          .select("client_slug")
          .eq("account_manager_id", matchedAM.id);

        const assignedSlugs = (assignments || []).map((a: { client_slug: string }) => a.client_slug);

        return new Response(
          JSON.stringify({
            valid: true,
            isAccountManager: true,
            amId: matchedAM.id,
            slug: "am-overview",
            name: matchedAM.display_name || matchedAM.username,
            clients: allClients || [],
            assignedSlugs,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check if this is a marketing specialist login
    const { data: marketingAccounts } = await supabaseAdmin
      .from("marketing_users")
      .select("id, username, display_name");

    const matchedMarketing = (marketingAccounts || []).find((m: { id: string; username: string; display_name: string | null }) => {
      return normalize(m.username) === trimmedClient;
    });

    if (matchedMarketing) {
      const { data: isMarketing } = await supabaseAdmin.rpc("verify_marketing_password", {
        _username: matchedMarketing.username,
        _password: password,
      });

      if (isMarketing) {
        const { data: allClients } = await supabaseAdmin
          .from("clients")
          .select("slug, display_name, name")
          .order("name");

        return new Response(
          JSON.stringify({
            valid: true,
            isMarketing: true,
            slug: "marketing-overview",
            name: matchedMarketing.display_name || matchedMarketing.username,
            clients: allClients || [],
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Regular client login
    const { data: isValid } = await supabaseAdmin.rpc("verify_client_password", {
      _client_name: trimmedClient,
      _password: password,
    });

    if (!isValid) {
      await new Promise((r) => setTimeout(r, 300));
      return new Response(
        JSON.stringify({ valid: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: clientData } = await supabaseAdmin
      .from("clients")
      .select("slug, display_name")
      .eq("name", trimmedClient)
      .single();

    return new Response(
      JSON.stringify({ valid: true, slug: clientData?.slug, name: clientData?.display_name || client }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
