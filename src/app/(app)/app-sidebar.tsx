"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { Permission } from "@/lib/auth/permissions";
import { NAV_ITEMS } from "./nav-config";

export function AppSidebar({
  isAdmin,
  permissions,
}: {
  isAdmin: boolean;
  permissions: Permission[];
}) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-8 items-center px-2 text-sm font-semibold whitespace-nowrap">
          <span className="group-data-[collapsible=icon]:hidden">
            PM CMS
          </span>
          <span className="hidden group-data-[collapsible=icon]:inline">
            PM
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.filter(
                (item) =>
                  (!item.adminOnly || isAdmin) &&
                  (!item.permission || permissions.includes(item.permission))
              ).map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname?.startsWith(`${item.href}/`);
                const Icon = item.icon;

                if (item.comingSoon) {
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        disabled
                        aria-disabled="true"
                        tooltip={`${item.label} (coming soon)`}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge>
                        <Badge variant="secondary" className="text-[10px]">
                          Soon
                        </Badge>
                      </SidebarMenuBadge>
                    </SidebarMenuItem>
                  );
                }

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      render={<Link href={item.href} />}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
