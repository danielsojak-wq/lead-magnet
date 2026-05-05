import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      name,
      displayName,
      password,
      leadUrls,
      leadColumns,
      costUrls,
      costColumns,
      crmFields,
      crmWritebackUrl,
      webFilter,
      defaultQualified,
      qualificationConfig,
      nameSplit,
      customColumns,
      eshopCurrency,
      section = "leadgen",
    } = body;

    if (!name || !password) {
      return new Response(
        JSON.stringify({ error: "Vyplňte název a heslo" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Heslo musí mít alespoň 6 znaků" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auto-generate slug from name
    const baseSlug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Ensure uniqueness by appending random suffix if needed
    let slug = baseSlug;
    let attempt = 0;
    while (true) {
      const { data: existing } = await supabaseAdmin
        .from("clients")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!existing) break;
      attempt++;
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      if (attempt > 5) {
        slug = `${baseSlug}-${Date.now()}`;
        break;
      }
    }

    // Check name uniqueness
    const { data: existingName } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("name", name)
      .maybeSingle();

    if (existingName) {
      return new Response(
        JSON.stringify({ error: "Klient s tímto názvem již existuje" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert client with temporary password
    const { data: clientData, error: insertError } = await supabaseAdmin
      .from("clients")
      .insert({
        name,
        slug,
        display_name: displayName || null,
        password_hash: "temp",
      })
      .select("id")
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientId = clientData.id;

    // Hash password using pgcrypto via RPC
    await supabaseAdmin.rpc("set_client_password", {
      _client_id: clientId,
      _password: password,
    });

    // Create leads data source
    const filteredLeadUrls = (leadUrls || []).filter((u: string) => u.trim());
    if (filteredLeadUrls.length > 0) {
      const leadConfig: Record<string, unknown> = {};
      if (leadColumns) leadConfig.columns = leadColumns;
      if (defaultQualified) leadConfig.default_qualified = defaultQualified;
      if (qualificationConfig) leadConfig.qualification = qualificationConfig;
      if (nameSplit) leadConfig.name_split = true;
      if (customColumns) leadConfig.custom_columns = customColumns;
      if (crmFields) leadConfig.crm_fields = crmFields;
      if (crmWritebackUrl) leadConfig.writeback_url = crmWritebackUrl;

      await supabaseAdmin.from("client_data_sources").insert({
        client_id: clientId,
        source_type: "leads",
        source_urls: filteredLeadUrls,
        config: Object.keys(leadConfig).length > 0 ? leadConfig : {},
      });
    }

    // Create marketing costs data source
    const filteredCostUrls = (costUrls || []).filter((u: string) => u.trim());
    if (filteredCostUrls.length > 0) {
      const costConfig: Record<string, unknown> = {};
      if (webFilter) costConfig.web_filter = webFilter;
      if (eshopCurrency && eshopCurrency !== "CZK") costConfig.currency = eshopCurrency;

      const sourceType = section === "ecommerce" ? "eshop_costs" : "marketing_costs";
      await supabaseAdmin.from("client_data_sources").insert({
        client_id: clientId,
        source_type: sourceType,
        source_urls: filteredCostUrls,
        config: Object.keys(costConfig).length > 0 ? costConfig : {},
      });
    }

    return new Response(
      JSON.stringify({ success: true, clientId, slug }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
