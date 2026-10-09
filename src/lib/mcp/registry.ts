// The complete MCP tool list. Pure so tests/mcp-registry.test.ts can assert on it directly.
// Spec scope: read everything the user can read; write Sales + project-work data. NO delete,
// credential, user/role/access/delegation or settings tools -- enforced by FORBIDDEN_NAME_PATTERN
// in the registry test (and asserted again at registration time in ./server.ts).
import { READ_TOOLS } from "@/lib/mcp/tools/read";
import type { ToolDef } from "@/lib/mcp/types";

export const FORBIDDEN_NAME_PATTERN =
  /delete|remove|credential|secret|password|role|access|delegat|user_admin|setting/i;

export const TOOLS: ToolDef[] = [...READ_TOOLS];
