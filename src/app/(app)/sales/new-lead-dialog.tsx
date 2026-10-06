"use client";

import { useMemo, useRef, useState, useTransition, type ReactElement } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Combobox } from "@base-ui/react/combobox";
import {
  ArrowRightIcon, Building2Icon, CheckIcon, ChevronDownIcon, CircleAlertIcon, Loader2Icon, Plus,
  PlusIcon, XIcon,
} from "lucide-react";
import { createLeadAction, findCompanyByRegCodeAction } from "@/app/actions/sales";
import { newLeadSchema, type NewLeadInput } from "@/lib/validation/sales";
import { DEAL_SOURCES, type DealSource } from "@/lib/sales/types";
import { FormSection } from "@/components/form-section";
import { PersonAvatar } from "@/components/person-avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SOURCE_LABEL } from "./stage";
import type { CompanyOption, SalesOwnerOption } from "./types";

/** "existing" = client_id set; "new" = company.* fields; "none" = nothing picked yet. */
type CompanyMode = "none" | "existing" | "new";
type Hit = { id: string; name: string };

const NEW_COMPANY = "__new__";

/** Form state is a superset of NewLeadInput: company/contact always hold strings so inputs
 * stay controlled; what actually gets validated + submitted is pruned by mode (see prune). */
type LeadForm = {
  /** UI state, kept in form values so the resolver (which runs outside render) can see it. */
  mode: CompanyMode;
  contactOpen: boolean;
  client_id: string | null;
  company: { name: string; reg_code: string; phone: string; email: string; website: string };
  deal: { title: string; source: DealSource; owner_id: string; next_follow_up_on: string };
  contact: { first_name: string; last_name: string; role: string; email: string; phone: string };
};

const EMPTY_COMPANY: LeadForm["company"] = { name: "", reg_code: "", phone: "", email: "", website: "" };
const EMPTY_CONTACT: LeadForm["contact"] = { first_name: "", last_name: "", role: "", email: "", phone: "" };

/** Only new-company mode sends `company` (existing mode OMITS it -- ruling); a hidden or untouched contact
 * section is omitted too, so leftovers never reach validation or the server. */
function prune(values: LeadForm): NewLeadInput {
  const { mode, contactOpen } = values;
  const contactFilled = contactOpen && Object.values(values.contact).some((v) => v.trim() !== "");
  return {
    client_id: mode === "existing" ? values.client_id : null,
    ...(mode === "new" ? { company: values.company } : {}),
    deal: values.deal,
    ...(contactFilled ? { contact: values.contact } : {}),
  };
}

export function NewLeadDialog({
  companies,
  owners,
  currentUserId,
  defaultClientId = null,
  noun = "lead",
  trigger = <Button size="sm" />,
}: {
  companies: CompanyOption[];
  owners: SalesOwnerOption[];
  currentUserId: string;
  defaultClientId?: string | null;
  /** "deal" when launched from a company page: "New deal" / "Create deal" / "Deal created". */
  noun?: "lead" | "deal";
  /** Trigger element (base-ui `render`), for callers that need a quieter button. */
  trigger?: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger}>
        <Plus />
        New {noun}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New {noun}</DialogTitle>
        </DialogHeader>
        {/* Mounted only while open, so every open starts from a clean form. */}
        {open && (
          <NewLeadForm
            companies={companies}
            owners={owners}
            currentUserId={currentUserId}
            defaultClientId={defaultClientId}
            noun={noun}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewLeadForm({
  companies,
  owners,
  currentUserId,
  defaultClientId,
  noun,
  onDone,
}: {
  companies: CompanyOption[];
  owners: SalesOwnerOption[];
  currentUserId: string;
  defaultClientId: string | null;
  noun: "lead" | "deal";
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const preselected = defaultClientId && companies.some((c) => c.id === defaultClientId) ? defaultClientId : null;
  const [hit, setHit] = useState<Hit | null>(null);
  const [checking, setChecking] = useState(false);
  // Bumped by every lookup and every company-mode switch: a lookup applies its answer only if
  // nothing has happened since it started (read/written in handlers only, never during render).
  const lookupId = useRef(0);

  const resolver = useMemo<Resolver<LeadForm>>(() => {
    const zod = zodResolver(newLeadSchema);
    return async (values, context, options) => {
      const pruned = prune(values);
      const result = await zod(pruned, context, options as never);
      const errors = { ...result.errors } as Record<string, unknown>;
      const contact = pruned.contact;
      // The schema keeps first_name optional (no contact at all is fine) -- but a half-filled
      // contact without a name would be silently dropped by the server, so ask for it here.
      if (contact && !contact.first_name?.trim()) {
        errors.contact = {
          ...((errors.contact as object | undefined) ?? {}),
          first_name: { type: "required", message: "First name is required" },
        };
      }
      return Object.keys(errors).length
        ? { values: {}, errors: errors as never }
        : { values, errors: {} };
    };
  }, []);

  const defaultOwner = owners.some((o) => o.id === currentUserId) ? currentUserId : (owners[0]?.id ?? currentUserId);
  const form = useForm<LeadForm>({
    resolver,
    defaultValues: {
      mode: preselected ? "existing" : "none",
      contactOpen: !preselected,
      client_id: preselected,
      company: EMPTY_COMPANY,
      deal: { title: "", source: "inbound", owner_id: defaultOwner, next_follow_up_on: "" },
      contact: EMPTY_CONTACT,
    },
  });

  const [mode, contactOpen, clientId] = useWatch({ control: form.control, name: ["mode", "contactOpen", "client_id"] });
  function setMode(next: CompanyMode) {
    form.setValue("mode", next);
  }
  function setContactOpen(next: boolean) {
    form.setValue("contactOpen", next);
  }

  function pickExisting(id: string) {
    lookupId.current++;
    setChecking(false);
    form.setValue("client_id", id);
    form.clearErrors("company");
    setMode("existing");
    // Existing company: contact is optional extra -- fold it away unless something was typed.
    if (Object.values(form.getValues("contact")).every((v) => !v.trim())) setContactOpen(false);
    setHit(null);
    setServerError(null);
  }

  function chooseNew(prefillName: string) {
    lookupId.current++;
    form.setValue("client_id", null);
    if (prefillName && !form.getValues("company.name").trim()) form.setValue("company.name", prefillName);
    setMode("new");
    setContactOpen(true);
    setServerError(null);
    // Coming back to "new" with a reg code already typed: re-check it rather than trust a stale hit.
    setHit(null);
    void checkRegCode(form.getValues("company.reg_code"));
  }

  function clearCompany() {
    lookupId.current++;
    setChecking(false);
    form.setValue("client_id", null);
    setMode("none");
    setHit(null);
  }

  async function checkRegCode(raw: string) {
    const code = raw.trim();
    const id = ++lookupId.current;
    if (!code) {
      setChecking(false);
      return;
    }
    setChecking(true);
    // Stale = another lookup or a mode switch happened meanwhile, or the field was edited.
    const current = () =>
      id === lookupId.current &&
      form.getValues("mode") === "new" &&
      form.getValues("company.reg_code").trim() === code;
    try {
      const found = await findCompanyByRegCodeAction(code);
      if (current()) setHit(found);
    } catch {
      // Lookup is a convenience; the server re-checks on submit.
    } finally {
      if (id === lookupId.current) setChecking(false);
    }
  }

  function onSubmit(values: LeadForm) {
    setServerError(null);
    const payload = prune(values);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof createLeadAction>>;
      try {
        result = await createLeadAction(payload);
      } catch {
        // A thrown action (network, permission) must not hit the error boundary and lose the form.
        setServerError("Could not create the lead. Try again.");
        return;
      }
      if ("error" in result) {
        if (result.existingClientId) {
          const known = companies.find((c) => c.id === result.existingClientId);
          setHit({
            id: result.existingClientId,
            name: known?.name ?? result.existingClientName ?? "another company",
          });
        } else {
          setServerError(result.error);
        }
        return;
      }
      onDone();
      toast.success(noun === "deal" ? "Deal created" : "Lead created");
      router.push(`/sales/companies/${result.clientId}?deal=${result.dealId}`);
    });
  }

  const blocked = mode === "new" && hit !== null;
  const companyNameError = form.formState.errors.company?.name?.message;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <FormSection first tone="blue" title="Company">
          <div className="space-y-2">
            <CompanyCombobox
              companies={companies}
              mode={mode}
              clientId={clientId}
              onPick={pickExisting}
              onNew={chooseNew}
              onClear={clearCompany}
              invalid={mode !== "new" && !!companyNameError}
              errorId="new-lead-company-error"
            />
            {mode !== "new" && companyNameError && (
              <p id="new-lead-company-error" className="text-sm text-destructive">{companyNameError}</p>
            )}
          </div>

          {mode === "new" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="company.name"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Name</FormLabel>
                    <FormControl render={<Input autoFocus placeholder="e.g. Baltic Steel OÜ" {...field} />} />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="company.reg_code"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Registry code</FormLabel>
                    <div className="relative">
                      <FormControl
                        render={
                          <Input
                            {...field}
                            inputMode="numeric"
                            aria-invalid={hit ? true : undefined}
                            onChange={(e) => {
                              field.onChange(e);
                              if (hit) setHit(null);
                            }}
                            onBlur={() => {
                              field.onBlur();
                              void checkRegCode(field.value);
                            }}
                          />
                        }
                      />
                      {checking && (
                        <Loader2Icon className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    {hit && <DuplicateNotice hit={hit} onUse={() => pickExisting(hit.id)} />}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <TextField form={form} name="company.phone" label="Phone" type="tel" />
              <TextField form={form} name="company.email" label="Email" type="email" />
              <TextField form={form} name="company.website" label="Website" type="url" placeholder="https://" className="sm:col-span-2" />
            </div>
          )}

          {/* Existing mode can still be blocked by a server-side duplicate (race) -- show it here too. */}
          {mode !== "new" && hit && <DuplicateNotice hit={hit} onUse={() => pickExisting(hit.id)} />}
        </FormSection>

        <FormSection tone="violet" title="Deal">
          <FormField
            control={form.control}
            name="deal.title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl
                  render={<Input autoFocus={mode === "existing"} placeholder="e.g. Website redesign" {...field} />}
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="deal.source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source</FormLabel>
                  <Select value={field.value} onValueChange={(v) => field.onChange(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{(v: DealSource) => SOURCE_LABEL[v] ?? "Select a source"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {DEAL_SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {SOURCE_LABEL[s]}
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
              name="deal.owner_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Owner</FormLabel>
                  <Select value={field.value} onValueChange={(v) => field.onChange(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: string) => {
                          const owner = owners.find((o) => o.id === v);
                          if (!owner) return "Select an owner";
                          return <OwnerLabel owner={owner} />;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {owners.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          <OwnerLabel owner={o} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <TextField form={form} name="deal.next_follow_up_on" label="Next follow-up" type="date" />
          </div>
        </FormSection>

        {contactOpen ? (
          <FormSection tone="teal" title="Contact">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField form={form} name="contact.first_name" label="First name" />
              <TextField form={form} name="contact.last_name" label="Last name" />
              <TextField form={form} name="contact.role" label="Position" className="sm:col-span-2" />
              <TextField form={form} name="contact.email" label="Email" type="email" />
              <TextField form={form} name="contact.phone" label="Phone" type="tel" />
            </div>
          </FormSection>
        ) : (
          <button
            type="button"
            onClick={() => setContactOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-teal-500/50 hover:bg-teal-500/[0.04] hover:text-foreground"
          >
            <PlusIcon className="size-4" />
            Add contact
          </button>
        )}

        {/* -bottom-4 pins it to the dialog's padding edge so nothing scrolls visibly beneath it. */}
        <DialogFooter className="-bottom-4">
          <Button type="submit" disabled={isPending || blocked}>
            {isPending ? "Creating…" : `Create ${noun}`}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function DuplicateNotice({ hit, onUse }: { hit: Hit; onUse: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-sm"
    >
      <span className="flex min-w-0 items-center gap-2">
        <CircleAlertIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="truncate">
          Already exists:{" "}
          <Link href={`/sales/companies/${hit.id}`} className="font-medium underline underline-offset-3 hover:text-foreground">
            {hit.name}
          </Link>
        </span>
      </span>
      <Button type="button" size="sm" variant="outline" onClick={onUse}>
        Use this company
        <ArrowRightIcon />
      </Button>
    </div>
  );
}

function OwnerLabel({ owner }: { owner: SalesOwnerOption }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <PersonAvatar name={owner.name} avatarUrl={owner.avatar_url} className="size-5 text-[9px]" />
      <span className="truncate">{owner.name}</span>
    </span>
  );
}

type TextFieldName =
  | "company.phone" | "company.email" | "company.website" | "deal.next_follow_up_on"
  | "contact.first_name" | "contact.last_name" | "contact.role" | "contact.email" | "contact.phone";

function TextField({
  form,
  name,
  label,
  type = "text",
  placeholder,
  className,
}: {
  form: ReturnType<typeof useForm<LeadForm>>;
  name: TextFieldName;
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

/* ---------------------------------------------------------------------------------------------- */

type Item = { value: string; name: string; reg_code: string | null; isNew?: boolean; prefill?: string };

/** Company picker over base-ui Combobox (same controlled-input pattern as
 * people/managed-option-combobox.tsx). Matches on name or registry code; the last item is always
 * "New company" -- carrying the typed query along as the prefilled name. */
function CompanyCombobox({
  companies,
  mode,
  clientId,
  onPick,
  onNew,
  onClear,
  invalid,
  errorId,
}: {
  companies: CompanyOption[];
  mode: CompanyMode;
  clientId: string | null;
  onPick: (id: string) => void;
  onNew: (prefillName: string) => void;
  onClear: () => void;
  invalid: boolean;
  errorId: string;
}) {
  const selectedItem = useMemo<Item | null>(() => {
    if (mode === "new") return { value: NEW_COMPANY, name: "New company", reg_code: null, isNew: true };
    const c = mode === "existing" ? companies.find((x) => x.id === clientId) : undefined;
    return c ? { value: c.id, name: c.name, reg_code: c.reg_code } : null;
  }, [mode, clientId, companies]);
  const selectedLabel = selectedItem?.name ?? "";

  // Seed the controlled input from the selection on mount; resync when it changes from outside
  // (e.g. "Use this company"). State-during-render, as in managed-option-combobox.tsx.
  const [query, setQuery] = useState(selectedLabel);
  const [syncedLabel, setSyncedLabel] = useState(selectedLabel);
  if (syncedLabel !== selectedLabel) {
    setSyncedLabel(selectedLabel);
    setQuery(selectedLabel);
  }

  const items = useMemo<Item[]>(() => {
    const raw = query.trim();
    // Input showing the selected label means "no query": reopening lists everything.
    const q = raw.toLowerCase() === selectedLabel.toLowerCase() ? "" : raw.toLowerCase();
    const matches = companies
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.reg_code ?? "").toLowerCase().includes(q))
      .map((c) => ({ value: c.id, name: c.name, reg_code: c.reg_code }));
    const exact = companies.some((c) => c.name.toLowerCase() === q);
    const newLabel = q && !exact ? `New company "${raw}"` : "New company";
    return [...matches, { value: NEW_COMPANY, name: newLabel, reg_code: null, isNew: true, prefill: q && !exact ? raw : "" }];
  }, [companies, query, selectedLabel]);

  function select(item: Item | null) {
    if (!item) return onClear();
    if (item.isNew) return onNew(item.prefill ?? "");
    onPick(item.value);
  }

  return (
    <Combobox.Root
      items={items}
      value={selectedItem}
      onValueChange={select}
      inputValue={query}
      onInputValueChange={setQuery}
      isItemEqualToValue={(a: Item, b: Item) => a.value === b.value}
      itemToStringValue={(item: Item) => item.value}
      itemToStringLabel={(item: Item) => (item.isNew ? "New company" : item.name)}
      filter={null}
    >
      <Combobox.InputGroup
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-background py-2 pr-1.5 pl-2.5 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-destructive/20 dark:bg-input/30"
      >
        <Building2Icon className="size-4 shrink-0 text-muted-foreground" />
        <Combobox.Input
          aria-label="Company"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          autoFocus={mode === "none"}
          placeholder="Search by name or registry code"
          className="h-full w-full border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="flex shrink-0 items-center text-muted-foreground">
          {selectedItem && (
            <Combobox.Clear
              aria-label="Clear company"
              className="flex size-6 items-center justify-center rounded-sm hover:bg-accent hover:text-accent-foreground"
            >
              <XIcon className="size-3.5" />
            </Combobox.Clear>
          )}
          <Combobox.Trigger
            aria-label="Open company list"
            className="flex size-6 items-center justify-center rounded-sm hover:bg-accent hover:text-accent-foreground"
          >
            <ChevronDownIcon className="size-4" />
          </Combobox.Trigger>
        </div>
      </Combobox.InputGroup>

      <Combobox.Portal>
        <Combobox.Positioner className="isolate z-50" sideOffset={4}>
          <Combobox.Popup className="max-h-[min(var(--available-height),18rem)] w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
            <Combobox.List>
              {(item: Item) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  className={cn(
                    "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground",
                    item.isNew && "mt-1 border-t pt-2 font-medium text-blue-600 first:mt-0 first:border-t-0 first:pt-1.5 dark:text-blue-400"
                  )}
                >
                  {item.isNew ? (
                    <>
                      <PlusIcon className="size-4 shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate">
                        {item.name}
                        {item.reg_code && (
                          <span className="text-muted-foreground tabular-nums"> · {item.reg_code}</span>
                        )}
                      </span>
                      <Combobox.ItemIndicator
                        render={<span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />}
                      >
                        <CheckIcon className="pointer-events-none size-4" />
                      </Combobox.ItemIndicator>
                    </>
                  )}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
