"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CircleAlertIcon } from "lucide-react";
import { saveCompanyAction } from "@/app/actions/sales";
import { companySchema, type CompanyInput } from "@/lib/validation/sales";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EDIT_ACTION_CLASS } from "@/lib/action-styles";
import type { CompanyView } from "../../types";

/** Inputs stay controlled strings; companySchema turns blanks into nulls on submit. */
type CompanyForm = { name: string; reg_code: string; phone: string; email: string; website: string; notes: string };

export function CompanyFormDialog({ company }: { company: CompanyView }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" className={EDIT_ACTION_CLASS} />}>Edit</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {company.name}</DialogTitle>
        </DialogHeader>
        {/* Mounted only while open: every open starts from the saved values. */}
        {open && <CompanyFormBody company={company} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CompanyFormBody({ company, onDone }: { company: CompanyView; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);
  const form = useForm<CompanyForm>({
    resolver: zodResolver(companySchema) as unknown as Resolver<CompanyForm>,
    defaultValues: {
      name: company.name,
      reg_code: company.reg_code ?? "",
      phone: company.phone ?? "",
      email: company.email ?? "",
      website: company.website ?? "",
      notes: company.notes ?? "",
    },
  });

  function onSubmit(values: CompanyForm) {
    setServerError(null);
    setDuplicate(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof saveCompanyAction>>;
      try {
        result = await saveCompanyAction(values as CompanyInput, company.id);
      } catch {
        setServerError("Save failed. Try again.");
        return;
      }
      if ("error" in result) {
        if (result.existingClientId) {
          setDuplicate({ id: result.existingClientId, name: result.error.replace(/^Already exists:\s*/, "") });
        } else {
          setServerError(result.error);
        }
        return;
      }
      onDone();
      toast.success("Company saved");
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
          <Field form={form} name="name" label="Name" className="sm:col-span-2" />
          <FormField
            control={form.control}
            name="reg_code"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Registry code</FormLabel>
                <FormControl
                  render={
                    <Input
                      {...field}
                      inputMode="numeric"
                      aria-invalid={duplicate ? true : undefined}
                      onChange={(e) => {
                        field.onChange(e);
                        if (duplicate) setDuplicate(null);
                      }}
                    />
                  }
                />
                {duplicate && (
                  <p role="alert" className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                    <CircleAlertIcon className="size-4 shrink-0" />
                    <span>
                      Already exists:{" "}
                      <Link
                        href={`/sales/companies/${duplicate.id}`}
                        className="font-medium underline underline-offset-3 hover:text-foreground"
                      >
                        {duplicate.name}
                      </Link>
                    </span>
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
          <Field form={form} name="phone" label="Phone" type="tel" />
          <Field form={form} name="email" label="Email" type="email" />
          <Field form={form} name="website" label="Website" type="url" placeholder="https://" className="sm:col-span-2" />
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Notes</FormLabel>
                <FormControl render={<Textarea rows={4} {...field} />} />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <DialogFooter className="-bottom-4">
          <Button type="submit" disabled={isPending || duplicate !== null}>
            {isPending ? "Saving…" : "Save"}
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
  placeholder,
  className,
}: {
  form: ReturnType<typeof useForm<CompanyForm>>;
  name: "name" | "phone" | "email" | "website";
  label: string;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl render={<Input type={type} placeholder={placeholder} {...field} />} />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
