import {
  LayoutDashboard,
  FolderKanban,
  Building2,
  Handshake,
  Users,
  Gauge,
  BarChart3,
  Wallet,
  KeyRound,
  ArrowRightLeft,
  Activity,
  ShieldCheck,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/auth/permissions";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  comingSoon?: boolean;
  permission?: Permission;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Clients", href: "/clients", icon: Building2 },
  { label: "Sales", href: "/sales", icon: Handshake, permission: "view_sales" },
  // Client feedback round 1: user-facing name is "Employees" (route stays /people).
  { label: "Employees", href: "/people", icon: Users },
  { label: "Workload", href: "/workload", icon: Gauge },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Budgets", href: "/budgets", icon: Wallet },
  { label: "Credentials", href: "/credentials", icon: KeyRound },
  { label: "Delegations", href: "/delegations", icon: ArrowRightLeft },
  { label: "Activity", href: "/activity", icon: Activity },
  { label: "User access", href: "/admin/users", icon: ShieldCheck, adminOnly: true },
  { label: "Settings", href: "/settings", icon: Settings },
];
