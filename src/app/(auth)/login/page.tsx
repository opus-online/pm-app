import Link from "next/link";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoginForm } from "./login-form";
import { AzureButton } from "./azure-button";
import { Separator } from "@/components/ui/separator";

// Hidden until Entra ID is configured; flip to true to bring the button back.
const SHOW_MICROSOFT_SIGN_IN = false;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle>PM CMS</CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error === "account_disabled" && (
          <Alert variant="destructive">
            <AlertDescription>
              Your account has been disabled. Contact an administrator.
            </AlertDescription>
          </Alert>
        )}
        {error === "oauth_failed" && (
          <Alert variant="destructive">
            <AlertDescription>Microsoft sign-in failed. Try again.</AlertDescription>
          </Alert>
        )}
        {SHOW_MICROSOFT_SIGN_IN && (
          <>
            <AzureButton />
            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>
          </>
        )}
        <LoginForm />
        <p className="text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link href="/signup" className="underline underline-offset-4">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
