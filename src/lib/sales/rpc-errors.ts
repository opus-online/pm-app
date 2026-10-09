// Friendly text for Sales DB/RPC errors -- never the raw Postgres message. Pure; shared by the
// app's server actions (src/app/actions/sales.ts) and the MCP Sales tools (src/lib/mcp/tools/sales.ts).
export type DbError = { code: string; message: string };

/** The step RPCs (complete_activity/reschedule_activity/reassign_activity). 42501 covers two
 * distinct raises -- the plain manage_sales gate ("Not authorized") and the assignee/done_by
 * sales-access check ("...must be a Sales user") -- so the two are told apart by message
 * content, not by errcode alone. */
export function mapStepRpcError(error: DbError, dateMessage: string): string {
  if (error.code === "42501") {
    return error.message.includes("Sales user") ? "That person doesn't have Sales access." : "Not authorized";
  }
  if (error.code === "P0002") return "This step is already done or was removed.";
  if (error.code === "22004") return dateMessage;
  return "Save failed. Try again.";
}

/** The round-3 RPCs (update_step/cancel_step/edit_entry): same 42501 split as mapStepRpcError,
 * plus 22023 (cross-company or closed-deal reference / system kind) and 22004 (a required field
 * came through blank). notFoundMessage differs between steps and entries since P0002 means
 * something different -- "already done or removed" vs. "not editable". */
export function mapRound3RpcError(error: DbError, notFoundMessage: string): string {
  if (error.code === "42501") {
    return error.message.includes("Sales user") ? "That person doesn't have Sales access." : "Not authorized";
  }
  if (error.code === "P0002") return notFoundMessage;
  if (error.code === "22023") return "That contact or deal belongs to another company or is closed.";
  if (error.code === "22004") return "Fill in the required fields.";
  return "Save failed. Try again.";
}

/** convert_entry_to_step: 22023 here means the entry's deal is closed. */
export function mapConvertEntryError(error: DbError): string {
  if (error.code === "22023") return "This entry is on a closed deal, so it can't become a next step.";
  return mapRound3RpcError(error, "This entry can't be moved to next steps.");
}

/** Planned-step insert into crm_activities. RLS 42501: the insert policy requires
 * is_sales_assignable(assignee_id) for planned rows. */
export function mapPlanStepInsertError(error: DbError | null): string {
  if (error?.code === "42501") return "That person doesn't have Sales access.";
  return "Save failed. Try again.";
}

/** create_lead RPC: 23505 is the unique registry code. */
export function mapCreateLeadError(error: DbError): string {
  return error.code === "23505"
    ? "A company with this registry code already exists."
    : "Could not create the lead. Try again.";
}

/** deals update: 23514 is the lost-needs-a-reason check constraint. */
export function mapDealUpdateError(error: DbError): string {
  if (error.code === "23514") return "Give a reason for losing the deal.";
  return "Save failed. Try again.";
}
