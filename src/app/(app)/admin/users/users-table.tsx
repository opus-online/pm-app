"use client";

import { startTransition } from "react";
import { toast } from "sonner";
import { changeUserRoleAction, setSalesAccessAction } from "@/app/actions/admin";
import { APP_ROLES } from "@/lib/validation/auth";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { InlineEditSelect, type InlineEditOption } from "@/components/inline-edit-select";
import { SortableHead } from "@/components/data-table/sortable-head";
import { useSort, type SortAccessors } from "@/components/data-table/use-sort";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDate } from "../../projects/types";
import { ApproveDialog } from "./approve-dialog";
import { UserActions } from "./user-actions";

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  status: "pending" | "active" | "disabled";
  role: string | null;
  sales: boolean;
  created_at: string;
};

const statusVariant = {
  pending: "secondary",
  active: "default",
  disabled: "destructive",
} as const;

// Pending first -- the row an admin actually needs to act on.
const STATUS_RANK = { pending: 0, active: 1, disabled: 2 } as const;

const ROLE_INLINE_OPTIONS: InlineEditOption[] = APP_ROLES.map((r) => ({
  value: r,
  label: r.replace("_", " "),
  badgeVariant: "outline",
}));

type SortKey = "user" | "status" | "role" | "joined";

const ACCESSORS: SortAccessors<UserRow, SortKey> = {
  user: (u) => u.full_name ?? u.email,
  status: (u) => STATUS_RANK[u.status],
  role: (u) => u.role,
  joined: (u) => u.created_at,
};

export function UsersTable({
  users,
  currentUserId,
}: {
  users: UserRow[];
  /** The viewing admin's own id -- self role-change is disabled here (and rejected server-side
   * by changeUserRoleAction) so an admin can never accidentally lock themselves out. */
  currentUserId: string | null;
}) {
  const { rows: sorted, sort, toggle } = useSort(users, ACCESSORS, { key: "status", dir: "asc" });
  if (users.length === 0) {
    return <p className="text-muted-foreground">No users yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead label="User" sortKey="user" sort={sort} onToggle={toggle} />
          <SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggle} />
          <SortableHead label="Role" sortKey="role" sort={sort} onToggle={toggle} />
          <TableHead>Sales</TableHead>
          <SortableHead label="Joined" sortKey="joined" sort={sort} onToggle={toggle} />
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((user) => (
          <TableRow key={user.id}>
            <TableCell>
              <div className="font-medium">{user.full_name ?? "—"}</div>
              <div className="text-sm text-muted-foreground">{user.email}</div>
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant[user.status]}>{user.status}</Badge>
            </TableCell>
            <TableCell>
              {user.status === "pending" || !user.role ? (
                user.role?.replace("_", " ") ?? "—"
              ) : (
                <InlineEditSelect
                  value={user.role}
                  options={ROLE_INLINE_OPTIONS}
                  canEdit={user.id !== currentUserId}
                  ariaLabel="user role"
                  onSave={changeUserRoleAction.bind(null, user.id)}
                />
              )}
            </TableCell>
            <TableCell>
              <Switch
                checked={user.sales}
                aria-label="Sales access"
                onCheckedChange={(v) =>
                  startTransition(async () => {
                    const r = await setSalesAccessAction(user.id, v);
                    if ("error" in r) toast.error(r.error);
                  })
                }
              />
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatDate(user.created_at)}
            </TableCell>
            <TableCell className="text-right">
              {user.status === "pending" ? (
                <ApproveDialog userId={user.id} userLabel={user.full_name ?? user.email} />
              ) : (
                <UserActions userId={user.id} status={user.status} />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
