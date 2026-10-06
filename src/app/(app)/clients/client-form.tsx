"use client";

import { useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, XIcon } from "lucide-react";
import { upsertClientAction } from "@/app/actions/clients";
import {
  clientSchema, type ClientContactInput, type ClientInput,
} from "@/lib/validation/client";
import type { ClientContactRow, ClientRow } from "./types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/form-section";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DESTRUCTIVE_ACTION_CLASS, NEUTRAL_ACTION_CLASS } from "@/lib/action-styles";

const BLANK_CONTACT: ClientContactInput = {
  first_name: "", last_name: null, gender: null, description: null,
  email: null, phone: null, role: null, is_primary: false,
};

function toDefaults(client?: ClientRow, contacts?: ClientContactRow[]): ClientInput {
  return {
    name: client?.name ?? "",
    reg_code: client?.reg_code ?? null,
    email: client?.email ?? null,
    website: client?.website ?? null,
    notes: client?.notes ?? null,
    contacts: contacts?.length
      ? contacts.map((c) => ({
          // gender/description have no field in this form (they're edited only in the Sales
          // contact dialog) -- carried through untouched so re-saving a client here never wipes
          // them, since upsertClientAction deletes and reinserts every contact row.
          first_name: c.first_name ?? c.name,
          last_name: c.last_name,
          gender: c.gender,
          description: c.description,
          email: c.email,
          phone: c.phone,
          role: c.role,
          is_primary: c.is_primary,
        }))
      : [{ ...BLANK_CONTACT, is_primary: true }],
  };
}

/** A row someone added but never typed into -- dropped silently on submit instead of failing
 * "First name is required" on a row they never meant to keep. */
function isBlankContact(c: ClientContactInput): boolean {
  return ![c.first_name, c.last_name, c.email, c.phone, c.role].some((v) => v && v.trim() !== "");
}

/** Shared form for both the /clients screen (full add/edit dialog) and the inline "＋ New
 * client…" quick-create flow inside the project forms -- `onSuccess` gets the saved client's
 * id/name back so the quick-create caller can select it immediately without a page reload. */
export function ClientForm({
  client,
  contacts,
  onSuccess,
}: {
  client?: ClientRow;
  contacts?: ClientContactRow[];
  onSuccess: (client: { id: string; name: string }) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<ClientInput>({
    resolver: zodResolver(clientSchema),
    defaultValues: toDefaults(client, contacts),
  });
  const contactRows = useFieldArray({ control: form.control, name: "contacts" });
  // useWatch (not form.watch -- React Compiler flags the latter as unmemoizable, same note as
  // log-time-form.tsx) drives the per-row Primary badge/button swap.
  const watchedContacts = useWatch({ control: form.control, name: "contacts" });

  function setPrimary(index: number) {
    contactRows.fields.forEach((_, i) => {
      form.setValue(`contacts.${i}.is_primary`, i === index, { shouldDirty: true });
    });
  }

  function removeContact(index: number) {
    const wasPrimary = watchedContacts[index]?.is_primary;
    contactRows.remove(index);
    // Keep the exactly-one-primary invariant when the primary row itself is removed: after the
    // removal the array has shifted, so the surviving first row is always index 0.
    if (wasPrimary && watchedContacts.length > 1) {
      form.setValue("contacts.0.is_primary", true, { shouldDirty: true });
    }
  }

  function onSubmit(values: ClientInput) {
    setServerError(null);
    const kept = values.contacts.filter((c) => !isBlankContact(c));
    startTransition(async () => {
      const result = await upsertClientAction({ ...values, contacts: kept }, client?.id);
      if ("error" in result) setServerError(result.error);
      else onSuccess({ id: result.id, name: result.name });
    });
  }

  return (
    <Form {...form}>
      {/* stopPropagation matters here specifically: ClientQuickCreateDialog renders this form
          inline inside the project create/edit forms' own <form> via the client <Select>'s
          "＋ New client…" option. Dialog content is DOM-portaled out to document.body, but
          React still treats it as a descendant of the outer <form> for SYNTHETIC event
          bubbling purposes (portals bubble through the React tree, not the DOM tree) -- so
          without this, submitting this inner form also re-triggers the outer project form's
          onSubmit (and a real, unwanted project.create), even though the two <form> elements
          are unrelated in the physical DOM. Standalone usage (ClientFormDialog on /clients,
          never nested in another form) is unaffected by this. */}
      <form
        onSubmit={(e) => {
          e.stopPropagation();
          form.handleSubmit(onSubmit)(e);
        }}
        className="space-y-4"
      >
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}
        <FormSection first tone="blue" title="Client">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl render={<Input autoFocus {...field} />} />
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="reg_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Registry code</FormLabel>
                  <FormControl render={<Input {...field} value={field.value ?? ""} />} />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl render={<Input type="email" {...field} value={field.value ?? ""} />} />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Website</FormLabel>
                  <FormControl render={<Input {...field} value={field.value ?? ""} />} />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection tone="emerald" title="Contacts">
          <div className="flex items-center justify-end">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className={NEUTRAL_ACTION_CLASS}
              onClick={() =>
                contactRows.append({ ...BLANK_CONTACT, is_primary: contactRows.fields.length === 0 })
              }
            >
              <PlusIcon /> Add contact
            </Button>
          </div>
          {contactRows.fields.map((row, index) => (
            <div key={row.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                {watchedContacts[index]?.is_primary ? (
                  <Badge variant="secondary">Primary</Badge>
                ) : (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className={NEUTRAL_ACTION_CLASS}
                    onClick={() => setPrimary(index)}
                  >
                    Set primary
                  </Button>
                )}
                {contactRows.fields.length > 1 && (
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className={DESTRUCTIVE_ACTION_CLASS}
                    aria-label="Remove contact"
                    onClick={() => removeContact(index)}
                  >
                    <XIcon />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name={`contacts.${index}.first_name`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First name</FormLabel>
                      <FormControl render={<Input {...field} />} />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`contacts.${index}.last_name`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last name</FormLabel>
                      <FormControl render={<Input {...field} value={field.value ?? ""} />} />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`contacts.${index}.role`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Position</FormLabel>
                      <FormControl render={<Input {...field} value={field.value ?? ""} />} />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`contacts.${index}.email`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl render={<Input type="email" {...field} value={field.value ?? ""} />} />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`contacts.${index}.phone`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl render={<Input {...field} value={field.value ?? ""} />} />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          ))}
        </FormSection>

        <FormSection tone="amber" title="Notes">
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl render={<Textarea rows={3} {...field} value={field.value ?? ""} />} />
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save client"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
