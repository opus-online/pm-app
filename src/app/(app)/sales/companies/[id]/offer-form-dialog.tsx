"use client";

import { useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { saveOfferAction } from "@/app/actions/sales";
import { OFFER_STATUSES, type OfferStatus } from "@/lib/sales/types";
import { offerSchema, type OfferInput } from "@/lib/validation/sales";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { OFFER_STATUS_DOT, OFFER_STATUS_LABEL } from "../../stage";
import type { OfferView } from "../../types";

/** Inputs stay controlled strings ("" = not set); the schema turns blanks into nulls. */
type OfferForm = {
  title: string;
  amount: string;
  status: OfferStatus;
  sent_on: string;
  valid_until: string;
  link_url: string;
  note: string;
};

/** offerSchema, but a blank amount is an error (not a silent €0) and "36 000,50" is accepted. */
const offerFormSchema = offerSchema.extend({
  amount: z.preprocess(
    (v) => (typeof v === "string" ? (v.replace(/[\s €]/g, "").replace(",", ".") || undefined) : v),
    z.coerce
      .number({ error: "Enter an amount" })
      .min(0, "Amount can't be negative")
      .max(99_999_999, "Amount is too large")
  ),
});

function todayIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Add (no `offer`) or edit. Always controlled: "+ Add offer" and the row ⋯ menu both lift its
 * state into the deal sheet, since a DropdownMenuItem unmounts with its menu on click. */
export function OfferFormDialog({
  dealId,
  offer,
  suggestedTitle,
  open,
  onOpenChange,
}: {
  dealId: string;
  offer?: OfferView;
  /** Prefill for a new offer, e.g. the next version "v3". */
  suggestedTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{offer ? `Edit offer ${offer.title}` : "Add offer"}</DialogTitle>
        </DialogHeader>
        {open && (
          <OfferFormBody
            dealId={dealId}
            offer={offer}
            suggestedTitle={suggestedTitle}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function OfferFormBody({
  dealId,
  offer,
  suggestedTitle,
  onDone,
}: {
  dealId: string;
  offer?: OfferView;
  suggestedTitle?: string;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<OfferForm>({
    resolver: zodResolver(offerFormSchema) as unknown as Resolver<OfferForm>,
    defaultValues: {
      title: offer?.title ?? suggestedTitle ?? "",
      amount: offer ? String(offer.amount) : "",
      status: offer?.status ?? "draft",
      sent_on: offer?.sent_on ?? "",
      valid_until: offer?.valid_until ?? "",
      link_url: offer?.link_url ?? "",
      note: offer?.note ?? "",
    },
  });

  function onSubmit(values: OfferForm) {
    setServerError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof saveOfferAction>>;
      try {
        // The resolver hands back parsed output (amount is a number by now).
        result = await saveOfferAction(dealId, values as unknown as OfferInput, offer?.id ?? null);
      } catch {
        setServerError("Save failed. Try again.");
        return;
      }
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      onDone();
      toast.success(offer ? "Offer saved" : "Offer added");
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
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl render={<Input autoFocus placeholder="e.g. v1" {...field} />} />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount</FormLabel>
                <div className="relative">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground"
                  >
                    €
                  </span>
                  <FormControl
                    render={<Input inputMode="decimal" autoComplete="off" className="pl-6 tabular-nums" {...field} />}
                  />
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(v) => {
                    if (!v) return;
                    field.onChange(v);
                    // Marking it sent without a date most likely means "sent today".
                    if (v === "sent" && !form.getValues("sent_on")) form.setValue("sent_on", todayIso());
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v: OfferStatus) => <StatusOption status={v} />}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {OFFER_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        <StatusOption status={s} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="sent_on"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sent on</FormLabel>
                <FormControl render={<Input type="date" {...field} />} />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="valid_until"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valid until</FormLabel>
                <FormControl render={<Input type="date" {...field} />} />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="link_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Link</FormLabel>
                <FormControl render={<Input type="url" placeholder="https://" {...field} />} />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Note</FormLabel>
                <FormControl render={<Textarea rows={3} {...field} />} />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <DialogFooter className="-bottom-4">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : offer ? "Save" : "Add offer"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function StatusOption({ status }: { status: OfferStatus }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className={cn("size-2 rounded-full", OFFER_STATUS_DOT[status])} />
      {OFFER_STATUS_LABEL[status]}
    </span>
  );
}
