"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validation/auth";
import { changePasswordAction } from "@/app/actions/password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";

const FIELDS = [
  { name: "current", label: "Current password", autoComplete: "current-password" },
  { name: "password", label: "New password", autoComplete: "new-password" },
  { name: "confirm", label: "Repeat new password", autoComplete: "new-password" },
] as const;

export function ChangePasswordCard() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current: "", password: "", confirm: "" },
  });

  function onSubmit(values: ChangePasswordInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await changePasswordAction(values);
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      form.reset();
      toast.success("Password changed");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>At least 12 characters, with upper and lower case letters and a digit.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-sm space-y-4">
            {serverError && (
              <Alert variant="destructive">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}
            {FIELDS.map((f) => (
              <FormField
                key={f.name}
                control={form.control}
                name={f.name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{f.label}</FormLabel>
                    <FormControl render={<Input type="password" autoComplete={f.autoComplete} {...field} />} />
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Saving…" : "Change password"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
