"use client";

import { useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { saveContactAction } from "@/app/actions/sales";
import { contactSchema, type ContactInput } from "@/lib/validation/sales";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ContactView } from "../../types";

/** Inputs stay controlled strings ("" = not set); contactSchema turns blanks into nulls. */
type ContactForm = {
  first_name: string;
  last_name: string;
  gender: "" | "female" | "male" | "other";
  email: string;
  phone: string;
  role: string;
  description: string;
};

const NO_GENDER = "none";
const GENDER_LABEL: Record<string, string> = { female: "Female", male: "Male", other: "Other", [NO_GENDER]: "—" };

/** Add (no `contact`) or edit. Always controlled: "+ Add" and the row ⋯ menu both lift its state
 * into ContactsCard, since a DropdownMenuItem unmounts with its menu on click. */
export function ContactFormDialog({
  companyId,
  contact,
  open,
  onOpenChange,
}: {
  companyId: string;
  contact?: ContactView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{contact ? `Edit ${contact.name}` : "Add contact"}</DialogTitle>
        </DialogHeader>
        {open && <ContactFormBody companyId={companyId} contact={contact} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ContactFormBody({
  companyId,
  contact,
  onDone,
}: {
  companyId: string;
  contact?: ContactView;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<ContactForm>({
    resolver: zodResolver(contactSchema) as unknown as Resolver<ContactForm>,
    defaultValues: {
      // Contacts that predate first/last names only carry `name` -- seed the first name from it.
      first_name: contact?.first_name ?? (contact && !contact.last_name ? contact.name : ""),
      last_name: contact?.last_name ?? "",
      gender: contact?.gender ?? "",
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      role: contact?.role ?? "",
      description: contact?.description ?? "",
    },
  });

  function onSubmit(values: ContactForm) {
    setServerError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof saveContactAction>>;
      try {
        result = await saveContactAction(companyId, values as ContactInput, contact?.id ?? null);
      } catch {
        setServerError("Save failed. Try again.");
        return;
      }
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      onDone();
      toast.success(contact ? "Contact saved" : "Contact added");
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field form={form} name="first_name" label="First name" autoFocus />
          <Field form={form} name="last_name" label="Last name" />
          <Field form={form} name="role" label="Position" />
          <FormField
            control={form.control}
            name="gender"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Gender</FormLabel>
                <Select
                  value={field.value || NO_GENDER}
                  onValueChange={(v) => field.onChange(v === NO_GENDER ? "" : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v: string) => GENDER_LABEL[v] ?? "—"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {["female", "male", "other", NO_GENDER].map((g) => (
                      <SelectItem key={g} value={g}>
                        {GENDER_LABEL[g]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <Field form={form} name="email" label="Email" type="email" />
          <Field form={form} name="phone" label="Phone" type="tel" />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Description</FormLabel>
                <FormControl render={<Textarea rows={3} {...field} />} />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <DialogFooter className="-bottom-4">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : contact ? "Save" : "Add contact"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function Field({
  form,
  name,
  label,
  type = "text",
  autoFocus,
}: {
  form: ReturnType<typeof useForm<ContactForm>>;
  name: "first_name" | "last_name" | "email" | "phone" | "role";
  label: string;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl render={<Input type={type} autoFocus={autoFocus} {...field} />} />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
