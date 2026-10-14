// Labels for an AI credential's access level -- shared by the key dialog, the key and
// connection tables and the claude.ai consent page.
export const ACCESS_LABEL = { false: "Read only", true: "Read and write" } as const;

export const ACCESS_ITEMS = [
  { value: "false", label: ACCESS_LABEL.false },
  { value: "true", label: ACCESS_LABEL.true },
];

export const accessLabel = (canWrite: boolean) => ACCESS_LABEL[canWrite ? "true" : "false"];
