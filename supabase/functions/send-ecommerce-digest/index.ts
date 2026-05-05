import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

async function sendSlackMessage(
  text: string,
  deliveryType: string,
  deliveryChannel: string | null,
  deliverySlackEmail: string | null,
): Promise<boolean> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  if (!SLACK_API_KEY) throw new Error("SLACK_API_KEY not configured");

  const headers = {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": SLACK_API_KEY,
    "Content-Type": "application/json",
  };

  let channel: string | undefined;

  if (deliveryType === "dm" && deliverySlackEmail) {
    const res = await fetch(
      `${GATEWAY_URL}/users.lookupByEmail?email=${encodeURIComponent(deliverySlackEmail)}`,
      { headers },
    );
    const data = await res.json();
    if (!data.ok || !data.user?.id) return false;
    channel = data.user.id;
  } else if (deliveryType === "channel" && deliveryChannel) {
    const channelName = deliveryChannel.replace(/^#/, "");
    let cursor = "";
    do {
      const url = `${GATEWAY_URL}/conversations.list?types=public_channel,private_channel&limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await fetch(url, { headers });
      const data = await res.json();
      if (!data.ok) break;
      const found = data.channels?.find((c: any) => c.name === channelName);
      if (found) {
        channel = found.id;
        // Auto-join
        await fetch(`${GATEWAY_URL}/conversations.join`, {
          method: "POST",
          headers,
          body: JSON.stringify({ channel }),
        });
        break;
      }
      cursor = data.response_metadata?.next_cursor || "";
    } while (cursor);
  }

  if (!channel) return false;

  const postRes = await fetch(`${GATEWAY_URL}/chat.postMessage`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      channel,
      text,
      username: "Performind Budget Digest",
      icon_emoji: ":bar_chart:",
    }),
  });
  const postData = await postRes.json();
  return postData.ok === true;
}

interface ClientBudget {
  slug: string;
  name: string;
  pacing: string;
  deviationPct: number;
  spent: number;
  target: number;
  currency: string;
}

function buildDigestMessage(clients: ClientBudget[], isTest: boolean): string {
  const prefix = isTest ? "🧪 *TEST* – " : "";
  const now = new Date();
  const dateStr = `${now.getDate()}.${now.getMonth() + 1}.${now.getFullYear()}`;

  const green: ClientBudget[] = [];
  const yellow: ClientBudget[] = [];
  const red: ClientBudget[] = [];

  for (const c of clients) {
    if (c.pacing === "on_target") green.push(c);
    else if (c.pacing === "warn") yellow.push(c);
    else red.push(c);
  }

  const formatClient = (c: ClientBudget) => {
    const sign = c.deviationPct >= 0 ? "+" : "";
    const sym = c.currency === "EUR" ? "€" : "Kč";
    return `  • ${c.name}: ${sign}${c.deviationPct.toFixed(1)} % (${Math.round(c.spent).toLocaleString("cs")} / ${Math.round(c.target).toLocaleString("cs")} ${sym})`;
  };

  const lines: string[] = [];
  lines.push(`${prefix}📊 *Budget Pacing – ${dateStr}*`);
  lines.push("");

  if (red.length > 0) {
    lines.push(`🔴 *Kritický stav* (${red.length}):`);
    red.forEach((c) => lines.push(formatClient(c)));
    lines.push("");
  }

  if (yellow.length > 0) {
    lines.push(`🟡 *Vyžaduje pozornost* (${yellow.length}):`);
    yellow.forEach((c) => lines.push(formatClient(c)));
    lines.push("");
  }

  if (green.length > 0) {
    lines.push(`🟢 *V pořádku* (${green.length}):`);
    green.forEach((c) => lines.push(formatClient(c)));
  }

  if (clients.length === 0) {
    lines.push("_Žádní klienti k vyhodnocení._");
  }

  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const amId = body.am_id as string;
    const isTest = body.test === true;
    // For cron: process all due schedules
    const isCron = body.cron === true;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let schedules: any[] = [];

    if (isCron) {
      // Get all enabled schedules
      const { data, error } = await supabaseAdmin
        .from("ecommerce_digest_schedules")
        .select("*")
        .eq("enabled", true);
      if (error) throw error;
      schedules = data || [];

      // Filter by schedule: check if now matches schedule_type/schedule_days/schedule_time
      // schedule_time is in Europe/Prague timezone
      const now = new Date();
      const pragueNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Prague" }));
      const currentDay = pragueNow.getDay() === 0 ? 7 : pragueNow.getDay(); // ISO weekday
      const currentHour = pragueNow.getHours();
      const currentMinute = pragueNow.getMinutes();

      schedules = schedules.filter((s: any) => {
        const [targetH, targetM] = (s.schedule_time || "08:00").split(":").map(Number);
        // Allow 30-minute window for cron
        const targetMinutes = targetH * 60 + targetM;
        const currentMinutes = currentHour * 60 + currentMinute;
        const diff = Math.abs(currentMinutes - targetMinutes);
        if (diff > 30) return false;

        if (s.schedule_type === "weekly") {
          return (s.schedule_days || []).includes(currentDay);
        }
        // daily
        return true;
      });

      // Skip if already sent today
      const todayStr = now.toISOString().slice(0, 10);
      schedules = schedules.filter((s: any) => {
        if (!s.last_sent_at) return true;
        return s.last_sent_at.slice(0, 10) !== todayStr;
      });
    } else if (amId) {
      // Single AM (manual test or direct)
      const { data, error } = await supabaseAdmin
        .from("ecommerce_digest_schedules")
        .select("*")
        .eq("am_id", amId)
        .maybeSingle();
      if (error) throw error;
      if (data) schedules = [data];
      else if (isTest) {
        // Test without saved schedule - create a temporary one
        schedules = [{ am_id: amId, delivery_type: "channel", delivery_channel: null, delivery_slack_email: null }];
      }
    }

    if (schedules.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No schedules to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSent = 0;

    for (const sched of schedules) {
      // Get AM's assigned ecommerce clients
      const { data: assignments } = await supabaseAdmin
        .from("account_manager_clients")
        .select("client_slug")
        .eq("account_manager_id", sched.am_id)
        .eq("section", "ecommerce");

      const slugs = (assignments || []).map((a: any) => a.client_slug);
      if (slugs.length === 0) continue;

      // Get client names
      const { data: clientRows } = await supabaseAdmin
        .from("clients")
        .select("slug, name, display_name")
        .in("slug", slugs);

      const clientNameMap = new Map<string, string>();
      for (const c of clientRows || []) {
        clientNameMap.set(c.slug, c.display_name || c.name);
      }

      // Fetch budget data for each client
      const clients: ClientBudget[] = [];
      for (const slug of slugs) {
        try {
          const budgetUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/fetch-eshop-budget`;
          const res = await fetch(budgetUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ client_slug: slug }),
          });
          const data = await res.json();
          if (data && data.total && !data.error) {
            clients.push({
              slug,
              name: clientNameMap.get(slug) || slug,
              pacing: data.total.pacing,
              deviationPct: data.total.deviationPct,
              spent: data.total.spentThisMonth,
              target: data.total.target,
              currency: data.currency || "CZK",
            });
          }
        } catch {
          // Skip client on error
        }
      }

      if (clients.length === 0 && !isTest) continue;

      const message = buildDigestMessage(clients, isTest);

      // For test without saved delivery, return message preview
      if (isTest && !sched.delivery_channel && !sched.delivery_slack_email) {
        return new Response(JSON.stringify({ sent: clients.length, preview: message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ok = await sendSlackMessage(
        message,
        sched.delivery_type,
        sched.delivery_channel,
        sched.delivery_slack_email,
      );

      if (ok) {
        totalSent++;
        if (!isTest && sched.id) {
          await supabaseAdmin
            .from("ecommerce_digest_schedules")
            .update({ last_sent_at: new Date().toISOString() })
            .eq("id", sched.id);
        }
      }
    }

    return new Response(JSON.stringify({ sent: totalSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-ecommerce-digest error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
