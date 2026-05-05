import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Bulk set all assignments for an AM
    if (action === "set_all") {
      const amId = body.am_id as string;
      const assignments = body.assignments as Array<{ client_slug: string; section: string }>;
      if (!amId) throw new Error("Missing am_id");

      // Delete all existing
      await supabaseAdmin
        .from("account_manager_clients")
        .delete()
        .eq("account_manager_id", amId);

      // Insert new
      if (assignments && assignments.length > 0) {
        const rows = assignments.map((a) => ({
          account_manager_id: amId,
          client_slug: a.client_slug,
          section: a.section,
        }));
        const { error } = await supabaseAdmin.from("account_manager_clients").insert(rows);
        if (error) throw error;
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Legacy single assign/unassign
    const { amId, clientSlug, section = "leadgen" } = body;

    if (!amId || !clientSlug || !action) {
      return new Response(
        JSON.stringify({ error: "Missing amId, clientSlug, or action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "assign") {
      const { error } = await supabaseAdmin
        .from("account_manager_clients")
        .upsert(
          { account_manager_id: amId, client_slug: clientSlug, section },
          { onConflict: "account_manager_id,client_slug,section" }
        );

      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "unassign") {
      const { error } = await supabaseAdmin
        .from("account_manager_clients")
        .delete()
        .eq("account_manager_id", amId)
        .eq("client_slug", clientSlug)
        .eq("section", section);

      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("manage-am-clients error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
