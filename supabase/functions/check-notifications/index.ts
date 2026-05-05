import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

interface NotificationRule {
  id: string;
  user_type: string;
  user_id: string;
  user_display_name: string | null;
  client_slug: string;
  rule_type: string;
  params: { days?: number; message?: string };
  delivery: { type: string; channel?: string; slack_email?: string };
  frequency: string; // "once" | "daily" | "3days" | "5days" | "weekly"
  enabled: boolean;
  last_notified_at: string | null;
}

const FREQUENCY_HOURS: Record<string, number> = {
  once: Infinity,
  daily: 24,
  "3days": 72,
  "5days": 120,
  weekly: 168,
};

interface ClientStatus {
  slug: string;
  name: string;
  adsActive: boolean;
  lastLeadDaysAgo: number | null;
}

async function sendSlackMessage(text: string, delivery: NotificationRule["delivery"]) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");

  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  if (!SLACK_API_KEY) throw new Error("SLACK_API_KEY not configured");

  let channel: string | undefined;

  if (delivery.type === "dm" && delivery.slack_email) {
    // Look up user by email
    const lookupRes = await fetch(`${GATEWAY_URL}/users.lookupByEmail?email=${encodeURIComponent(delivery.slack_email)}`, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": SLACK_API_KEY,
      },
    });
    const lookupData = await lookupRes.json();
    if (!lookupData.ok || !lookupData.user?.id) {
      console.error("Slack user lookup failed:", lookupData);
      return false;
    }
    channel = lookupData.user.id;
  } else if (delivery.type === "channel" && delivery.channel) {
    // Find channel by name
    const channelName = delivery.channel.replace(/^#/, "");
    const listRes = await fetch(`${GATEWAY_URL}/conversations.list?types=public_channel,private_channel&limit=200`, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": SLACK_API_KEY,
      },
    });
    const listData = await listRes.json();
    if (!listData.ok) {
      console.error("Slack channel list failed:", listData);
      return false;
    }
    const found = listData.channels?.find((c: any) => c.name === channelName);
    if (!found) {
      console.error(`Channel #${channelName} not found`);
      return false;
    }
    channel = found.id;

    // Auto-join channel if bot is not a member
    await fetch(`${GATEWAY_URL}/conversations.join`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": SLACK_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel }),
    });
  }

  if (!channel) return false;

  const postRes = await fetch(`${GATEWAY_URL}/chat.postMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SLACK_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel,
      text,
      username: "Performind Alert",
      icon_emoji: ":bell:",
    }),
  });
  const postData = await postRes.json();
  if (!postData.ok) {
    console.error("Slack postMessage failed:", postData);
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const testSlug = body.test_client_slug as string | undefined;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Fetch enabled rules
    let query = supabaseAdmin
      .from("notification_rules")
      .select("*")
      .eq("enabled", true);
    if (testSlug) query = query.eq("client_slug", testSlug);
    const { data: rules, error: rulesErr } = await query;

    if (rulesErr) throw rulesErr;
    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ checked: 0, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Get client statuses by invoking fetch-admin-overview internally
    const overviewUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/fetch-admin-overview`;
    const overviewRes = await fetch(overviewUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const overviewData = await overviewRes.json();
    const clients: ClientStatus[] = Array.isArray(overviewData) ? overviewData : overviewData.clients || [];

    const clientMap = new Map<string, ClientStatus>();
    for (const c of clients) clientMap.set(c.slug, c);

    // 3. Evaluate rules
    let sent = 0;

    for (const rule of rules as NotificationRule[]) {
      // Skip based on frequency setting (unless test mode)
      if (!testSlug && rule.last_notified_at) {
        const freq = rule.frequency || "once";
        const cooldownHours = FREQUENCY_HOURS[freq] ?? Infinity;
        if (cooldownHours === Infinity) continue; // "once" — already sent
        const cooldownMs = cooldownHours * 60 * 60 * 1000;
        const lastNotified = new Date(rule.last_notified_at).getTime();
        if (Date.now() - lastNotified < cooldownMs) continue;
      }

      const client = clientMap.get(rule.client_slug);
      if (!client) continue;

      let shouldNotify = false;
      let message = "";

      if (testSlug) {
        // Test mode: always send
        shouldNotify = true;
        message = `🧪 *TEST* – ${client.name}: Toto je testovací notifikace (pravidlo: ${rule.rule_type === "no_lead_days" ? `${rule.params.days || 3} dní bez poptávky` : "neaktivní reklamy"})`;
      } else if (rule.rule_type === "no_lead_days") {
        const threshold = rule.params.days || 3;
        if (client.adsActive && client.lastLeadDaysAgo !== null && client.lastLeadDaysAgo >= threshold) {
          shouldNotify = true;
          const defaultMsg = `⚠️ *${client.name}*: Reklamy běží, ale žádná poptávka už ${client.lastLeadDaysAgo} dní (limit: ${threshold})`;
          message = rule.params.message
            ? rule.params.message.replace(/\{klient\}/g, client.name).replace(/\{dny\}/g, String(client.lastLeadDaysAgo))
            : defaultMsg;
        }
      } else if (rule.rule_type === "ads_inactive") {
        if (!client.adsActive) {
          shouldNotify = true;
          const defaultMsg = `🔴 *${client.name}*: Reklamy jsou neaktivní`;
          message = rule.params.message
            ? rule.params.message.replace(/\{klient\}/g, client.name).replace(/\{dny\}/g, "")
            : defaultMsg;
        }
      }

      if (shouldNotify && message) {
        const ok = await sendSlackMessage(message, rule.delivery);
        if (ok) {
          sent++;
          if (!testSlug) {
            await supabaseAdmin
              .from("notification_rules")
              .update({ last_notified_at: new Date().toISOString() })
              .eq("id", rule.id);
          }
        }
      }
    }

    return new Response(JSON.stringify({ checked: rules.length, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("check-notifications error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
