/** A form field preselects its only candidate (e.g. a single deal/contact on a company) --
 * anything else (none, or more than one) leaves the field for the user to choose. */
export function singleId<T extends { id: string }>(items: T[]): string | null {
  return items.length === 1 ? items[0].id : null;
}
