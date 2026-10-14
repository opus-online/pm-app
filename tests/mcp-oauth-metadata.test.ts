import { describe, it, expect } from "vitest";
import { authServerUrl, protectedResourceMetadata, resourceMetadataUrl } from "@/lib/mcp/oauth-metadata";

describe("oauth metadata", () => {
  it("points the MCP resource at Supabase's auth server", () => {
    expect(protectedResourceMetadata("https://pm.example.com", "https://abc.supabase.co/")).toEqual({
      resource: "https://pm.example.com/api/mcp",
      authorization_servers: ["https://abc.supabase.co/auth/v1"],
      bearer_methods_supported: ["header"],
      resource_name: "PM app",
    });
  });
  it("builds the path-suffixed metadata URL", () => {
    expect(resourceMetadataUrl("https://pm.example.com")).toBe(
      "https://pm.example.com/.well-known/oauth-protected-resource/api/mcp",
    );
    expect(authServerUrl("http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321/auth/v1");
  });
});
