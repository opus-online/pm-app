// The complete MCP tool list. Pure so tests/mcp-registry.test.ts can assert on it directly.
// Spec scope: read everything the user can read; write Sales + project-work data. NO delete,
// credential, user/role/access/delegation or settings tools -- enforced by FORBIDDEN_NAME_PATTERN
// in the registry test (and asserted again at registration time in ./server.ts).
import { PROJECT_WRITE_TOOLS } from "@/lib/mcp/tools/projects";
import { READ_TOOLS } from "@/lib/mcp/tools/read";
import { SALES_TOOLS } from "@/lib/mcp/tools/sales";
import type { ToolDef } from "@/lib/mcp/types";

// Key-related names are matched as api_key/mcp_key/access_key rather than a bare "key" so
// ordinary words stay usable; "access" already covers access_key but is listed for clarity.
export const FORBIDDEN_NAME_PATTERN =
  /delete|remove|credential|secret|password|role|access|delegat|user_admin|setting|permission|grant|revoke|token|invite|purge|destroy|admin|impersonat|api_key|mcp_key|access_key/i;

export const TOOLS: ToolDef[] = [...READ_TOOLS, ...SALES_TOOLS, ...PROJECT_WRITE_TOOLS];

/** What a key gets to see: read-only keys get only the read tools. */
export function toolsForKey(canWrite: boolean): ToolDef[] {
  return canWrite ? TOOLS : TOOLS.filter((t) => t.readOnly);
}
