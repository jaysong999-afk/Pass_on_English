"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GraduationCap } from "lucide-react";
import type { VideoPlatform } from "@/types";
import { VideoPlatformSelector } from "@/components/shared/VideoPlatformSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  submitTeacherApplication,
  teacherApplicationErrorMessage,
} from "@/lib/teacher-applications";

export default function TeacherSignupPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [facebookMessengerId, setFacebookMessengerId] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [videoPlatforms, setVideoPlatforms] = useState<VideoPlatform[]>(["ZOOM"]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== passwordConfirm) {
      setError("Passwords do not match.");
      return;
    }

    if (!dateOfBirth) {
      setError("Please enter your date of birth.");
      return;
    }
    if (videoPlatforms.length === 0) { setError("Select at least one lesson platform."); return; }

    setSubmitting(true);
    try {
      const result = await submitTeacherApplication({
        fullName: fullName.trim(),
        dateOfBirth,
        phone: phone.trim(),
        bankAccount: bankAccount.trim(),
        facebookMessengerId: facebookMessengerId.trim(),
        address: address.trim(),
        email: email.trim(),
        password,
        videoPlatforms,
      });
      if (!result.ok) {
        setError(teacherApplicationErrorMessage(result.error));
        return;
      }
      router.push(`/teacher/signup/profile?applicationId=${result.application.id}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700">
      <header className="px-6 py-5">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-sm font-black text-white ring-1 ring-white/20">
            PE
          </div>
          <div>
            <p className="text-sm font-bold text-white">Pass on English</p>
            <p className="text-xs text-emerald-100/80">Teacher Portal</p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-10 pb-16">
        <Card className="w-full max-w-lg border-0 shadow-2xl shadow-black/20">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <GraduationCap className="h-7 w-7" />
            </div>
            <CardTitle className="text-2xl">Teacher Registration</CardTitle>
            <CardDescription className="text-base leading-relaxed">
              Apply to join our ESL teaching team. An admin will review your application before
              your account is activated.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Maria Santos"
                  autoComplete="name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">Date of birth</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+63 912 345 6789"
                  autoComplete="tel"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bankAccount">Bank account number</Label>
                <Input
                  id="bankAccount"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  placeholder="For salary deposits"
                  autoComplete="off"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="facebookMessengerId">Facebook Messenger ID</Label>
                <Input
                  id="facebookMessengerId"
                  value={facebookMessengerId}
                  onChange={(e) => setFacebookMessengerId(e.target.value)}
                  placeholder="messenger.com/t/your.profile"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="City, province, country"
                  rows={3}
                  required
                />
              </div>

              <div className="border-t border-gray-100 pt-4">
                <p className="mb-3 text-xs text-gray-500">
                  Account credentials (used after admin approval)
                </p>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="teacher@email.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="passwordConfirm">Confirm password</Label>
                    <Input
                      id="passwordConfirm"
                      type="password"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </div>
                </div>
              </div>

              <VideoPlatformSelector value={videoPlatforms} onChange={setVideoPlatforms} language="en" />
              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button
                type="submit"
                className="h-12 w-full rounded-xl bg-emerald-600 text-base hover:bg-emerald-700"
                disabled={submitting}
              >
                {submitting ? "Submitting…" : "Submit application"}
              </Button>

              <p className="text-center text-sm text-gray-500">
                Already have an account?{" "}
                <Link href="/teacher/login" className="font-semibold text-emerald-700 hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
