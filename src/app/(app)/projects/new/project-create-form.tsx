"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createProjectAction } from "@/app/actions/projects";
import {
  BUDGET_TYPE_OPTIONS,
  createProjectSchema,
  PROJECT_STATUS_OPTIONS,
  type CreateProjectInput,
} from "@/lib/validation/project";
import {
  ClientContactField, ClientField, EnumSelectField, PmField, TagsField,
  type ClientContactOption, type ClientOption, type PmOption,
} from "./project-create-fields";
import { isBlankMilestone, MilestonesEditor } from "../milestones-editor";
import { FormSection } from "@/components/form-section";
import { ProjectIconPicker } from "@/components/project-icon-picker";
import type { ProjectIconKey } from "@/lib/project-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

// Good defaults so a PM can type just a name and hit Create: Planning/Healthy/Fixed are the
// same "new, low-risk project" baseline the rest of the app already assumes.
const DEFAULT_VALUES: Omit<CreateProjectInput, "pm_id"> = {
  name: "",
  icon_key: "folder",
  client_id: null,
  client_contact_id: null,
  description: null,
  status: "planning",
  health: "healthy",
  budget_type: "fixed",
  start_date: null,
  deadline: null,
  milestones: [],
  tags: [],
};

export function ProjectCreateForm({
  clients,
  contacts,
  pms,
  currentUserId,
  defaultClientId,
  onCreated,
}: {
  clients: ClientOption[];
  contacts: ClientContactOption[];
  pms: PmOption[];
  currentUserId: string;
  /** Preselects the client (e.g. creating the project for a won deal). */
  defaultClientId?: string | null;
  /** Replaces the default "go to the new project" navigation. */
  onCreated?: (id: string) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { ...DEFAULT_VALUES, pm_id: currentUserId, client_id: defaultClientId ?? null },
  });

  function onSubmit(values: CreateProjectInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await createProjectAction(values);
      if ("error" in result) setServerError(result.error);
      else if (onCreated) onCreated(result.id);
      else router.push("/projects/" + result.id);
    });
  }

  /** Never-touched milestone rows are dropped BEFORE validation runs, so an extra "Add
   * milestone" click never fails "Name is required" on a row the PM never meant to keep. */
  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    const milestones = form.getValues("milestones") ?? [];
    const kept = milestones.filter((m) => !isBlankMilestone(m));
    if (kept.length !== milestones.length) form.setValue("milestones", kept);
    form.handleSubmit(onSubmit)(e);
  }

  return (
    <Form {...form}>
      <form onSubmit={handleFormSubmit} className="space-y-5">
            {serverError && (
              <Alert variant="destructive">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}

            <FormSection first tone="blue" title="Project details">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl render={<Input autoFocus placeholder="e.g. Retail e-shop replatform" {...field} />} />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="icon_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project icon</FormLabel>
                    <ProjectIconPicker
                      value={(field.value ?? "folder") as ProjectIconKey}
                      onChange={field.onChange}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <PmField control={form.control} pms={pms} />
              <ClientField control={form.control} clients={clients} />
              <ClientContactField control={form.control} contacts={contacts} />
            </FormSection>

            <FormSection tone="amber" title="Status & Budget">
              {/* No Health field: health is DERIVED (deadline/budget/progress -- lib/health.ts)
                  and the stored column is never displayed, so a manual pick would be a lie. */}
              <div className="grid grid-cols-2 gap-3">
                <EnumSelectField control={form.control} name="status" label="Status" options={PROJECT_STATUS_OPTIONS} />
                <EnumSelectField control={form.control} name="budget_type" label="Budget type" options={BUDGET_TYPE_OPTIONS} />
              </div>
            </FormSection>

            <FormSection tone="violet" title="Timeline">
              <MilestonesEditor control={form.control} />
            </FormSection>

            <FormSection tone="teal" title="Tags & description">
              <TagsField control={form.control} />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl render={<Textarea rows={3} {...field} value={field.value ?? ""} />} />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>

            <div className="sticky bottom-0 z-10 -mx-1 flex justify-end border-t bg-background px-1 py-3 in-[[data-slot=dialog-content]]:bg-popover">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating…" : "Create project"}
              </Button>
            </div>
      </form>
    </Form>
  );
}
