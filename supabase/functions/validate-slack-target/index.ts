import { corsHeaders } from "../_shared/cors.ts";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!SLACK_API_KEY) throw new Error("SLACK_API_KEY not configured");

    const { type, channel, slack_email } = await req.json();

    if (type === "channel") {
      const channelName = (channel || "").replace(/^#/, "").trim();
      if (!channelName) {
        return new Response(JSON.stringify({ valid: false, error: "Název kanálu je prázdný" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Paginate through channels to find the one
      let cursor: string | undefined;
      let found = false;

      do {
        const params = new URLSearchParams({ types: "public_channel,private_channel", limit: "200" });
        if (cursor) params.set("cursor", cursor);

        const res = await fetch(`${GATEWAY_URL}/conversations.list?${params}`, {
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": SLACK_API_KEY,
          },
        });
        const data = await res.json();
        if (!data.ok) {
          return new Response(JSON.stringify({ valid: false, error: `Slack API error: ${data.error}` }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        found = data.channels?.some((c: any) => c.name === channelName) ?? false;
        if (found) break;

        cursor = data.response_metadata?.next_cursor;
      } while (cursor);

      if (!found) {
        return new Response(JSON.stringify({ valid: false, error: `Kanál #${channelName} nebyl nalezen ve Slacku. Pokud je privátní, pozvěte do něj Lovable App bota (/invite @Lovable App).` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ valid: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "dm") {
      const email = (slack_email || "").trim();
      if (!email) {
        return new Response(JSON.stringify({ valid: false, error: "Email je prázdný" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await fetch(`${GATEWAY_URL}/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": SLACK_API_KEY,
        },
      });
      const data = await res.json();

      if (!data.ok || !data.user?.id) {
        return new Response(JSON.stringify({ valid: false, error: `Uživatel s emailem ${email} nebyl nalezen ve Slacku` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ valid: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ valid: false, error: "Neznámý typ doručení" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("validate-slack-target error:", message);
    return new Response(JSON.stringify({ valid: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
