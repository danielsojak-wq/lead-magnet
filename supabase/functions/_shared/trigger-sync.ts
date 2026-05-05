/**
 * Fire-and-forget invocation of a sync edge function for a single client.
 * Used after configuration changes (lead campaign filter, data sources,
 * eshop config) so the cache reflects the new settings immediately,
 * without waiting for the hourly cron.
 *
 * Errors are swallowed and logged — callers should never await this in a
 * way that blocks the user response.
 */
export function triggerClientSync(
  functionName: "sync-leadgen-data" | "sync-eshop-data",
  clientSlug: string,
): Promise<void> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${functionName}`;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: JSON.stringify({ client_slug: clientSlug }),
  })
    .then(() => {
      console.log(`[trigger-sync] ${functionName} invoked for ${clientSlug}`);
    })
    .catch((err) => {
      console.error(`[trigger-sync] ${functionName} failed for ${clientSlug}:`, err);
    });
}