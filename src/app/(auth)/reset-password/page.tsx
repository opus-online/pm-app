import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-password-form";

// Reached from a password-reset email link (/auth/confirm signs the user in first); the
// middleware sends anyone without a session to /login.
export default function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>At least 12 characters, with upper and lower case letters and a digit.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
      </CardContent>
    </Card>
  );
}
