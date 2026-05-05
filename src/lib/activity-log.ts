import { supabase } from "@/integrations/supabase/client";

/**
 * Log a client activity event (login, CRM review, note, etc.)
 * Fire-and-forget — never blocks UI.
 */
export function logActivity(
  clientSlug: string,
  eventType: string,
  description: string,
  actor: string = "client"
) {
  supabase
    .from("client_activity_log")
    .insert({
      client_slug: clientSlug,
      actor,
      event_type: eventType,
      description,
    })
    .then(({ error }) => {
      if (error) console.error("Activity log failed:", error.message, error.details, error.hint);
    });
}
