import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { allRedirectUrisAllowed } from "@/lib/mcp/oauth-consent";

/** True only when every redirect URI the OAuth client registered is allowlisted (service-role
 * read of the client record). A client that registered a Claude callback *and* another address
 * could otherwise receive codes at the other address once the user consented. Fails closed. */
export async function clientRedirectsAllowed(clientId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().auth.admin.oauth.getClient(clientId);
  if (error || !data) {
    if (error) console.error("oauth getClient failed:", error.message);
    return false;
  }
  return allRedirectUrisAllowed(data.redirect_uris ?? []);
}
