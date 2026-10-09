import {
  Code2,
  Database,
  Folder,
  Globe,
  Landmark,
  Package,
  ShoppingCart,
  Star,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const PROJECT_ICON_KEYS = [
  "folder",
  "globe",
  "code",
  "users",
  "shopping",
  "database",
  "landmark",
  "package",
  "truck",
  "star",
  "wrench",
] as const;

export type ProjectIconKey = (typeof PROJECT_ICON_KEYS)[number];

export const PROJECT_ICONS: Record<ProjectIconKey, { label: string; icon: LucideIcon }> = {
  folder: { label: "Default", icon: Folder },
  globe: { label: "Website", icon: Globe },
  code: { label: "Software", icon: Code2 },
  users: { label: "People", icon: Users },
  shopping: { label: "Commerce", icon: ShoppingCart },
  database: { label: "Data", icon: Database },
  landmark: { label: "Finance", icon: Landmark },
  package: { label: "Product", icon: Package },
  truck: { label: "Logistics", icon: Truck },
  star: { label: "Featured", icon: Star },
  wrench: { label: "Operations", icon: Wrench },
};

const PREFIX = "_icon:";

export function projectIconKey(tags: string[] | null | undefined): ProjectIconKey {
  const stored = tags?.find((tag) => tag.startsWith(PREFIX))?.slice(PREFIX.length);
  return PROJECT_ICON_KEYS.includes(stored as ProjectIconKey)
    ? (stored as ProjectIconKey)
    : "folder";
}

export function visibleProjectTags(tags: string[] | null | undefined) {
  return (tags ?? []).filter((tag) => !tag.startsWith(PREFIX));
}

export function withProjectIcon(tags: string[], iconKey: ProjectIconKey) {
  return [...visibleProjectTags(tags), PREFIX + iconKey];
}

/** Replaces a project's visible tags while keeping its hidden `_icon:` tag exactly as stored
 * (no icon tag is added when the project had none). Visible input tags that look like the
 * hidden prefix are dropped, so callers can't forge or duplicate the icon tag. */
export function replaceVisibleTags(current: string[] | null | undefined, visible: string[]) {
  const hidden = (current ?? []).filter((tag) => tag.startsWith(PREFIX));
  return [...visibleProjectTags(visible), ...hidden];
}
