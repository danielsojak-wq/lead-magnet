import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ...params } = await req.json();
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "list") {
      const { data, error } = await supabaseAdmin
        .from("team_users")
        .select("id, email, role, display_name, linked_am_id")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Also fetch account managers for linking
      const { data: ams } = await supabaseAdmin
        .from("account_managers")
        .select("id, display_name, username");

      return new Response(
        JSON.stringify({ users: data || [], accountManagers: ams || [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "add") {
      const { email, role, display_name, linked_am_id } = params;
      if (!email || !role) {
        return new Response(
          JSON.stringify({ error: "Email and role are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const trimmedEmail = email.trim().toLowerCase();
      if (!trimmedEmail.endsWith("@performind.cz")) {
        return new Response(
          JSON.stringify({ error: "Only @performind.cz emails allowed" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!["admin", "account_manager", "marketing"].includes(role)) {
        return new Response(
          JSON.stringify({ error: "Invalid role" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const insertData: Record<string, unknown> = { email: trimmedEmail, role };
      if (display_name) insertData.display_name = display_name;
      if (linked_am_id) insertData.linked_am_id = linked_am_id;

      const { data, error } = await supabaseAdmin
        .from("team_users")
        .insert(insertData)
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return new Response(
            JSON.stringify({ error: "Tento email je již registrován" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw error;
      }

      return new Response(
        JSON.stringify({ success: true, user: data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "remove") {
      const { id } = params;
      if (!id) {
        return new Response(
          JSON.stringify({ error: "ID is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error } = await supabaseAdmin
        .from("team_users")
        .delete()
        .eq("id", id);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "update") {
      const { id, role, display_name, linked_am_id } = params;
      if (!id) {
        return new Response(
          JSON.stringify({ error: "ID is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updateData: Record<string, unknown> = {};
      if (role) updateData.role = role;
      if (display_name !== undefined) updateData.display_name = display_name;
      if (linked_am_id !== undefined) updateData.linked_am_id = linked_am_id || null;

      const { error } = await supabaseAdmin
        .from("team_users")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("manage-team-users error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
