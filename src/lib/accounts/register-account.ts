import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createPrivilegedClient } from "@/lib/supabase/admin";
import type { RegisterAccountInput } from "@/lib/account-store.types";

export interface RegisterAccountDbInput extends RegisterAccountInput {
  password: string;
}

function hasServiceRoleKey(): boolean {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return Boolean(key && key !== "placeholder-service-key");
}

function isAlreadyRegisteredMessage(message: string): boolean {
  const detail = message.toLowerCase();
  return (
    detail.includes("already registered") ||
    detail.includes("already been registered") ||
    detail.includes("user already exists") ||
    detail.includes("email address has already been registered")
  );
}

async function signInStudent(
  supabase: SupabaseClient,
  input: RegisterAccountDbInput
) {
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  });

  if (error) {
    throw new Error(`auth_signin_failed: ${error.message}`);
  }
}

export async function updateRegisteredProfile(
  supabase: SupabaseClient,
  userId: string,
  input: RegisterAccountDbInput
) {
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: input.fullName.trim(),
      phone: input.phone.trim(),
      account_type: input.accountType,
    })
    .eq("id", userId);

  if (profileError) {
    const admin = createPrivilegedClient();
    const { error: adminProfileError } = await admin
      .from("profiles")
      .update({
        full_name: input.fullName.trim(),
        phone: input.phone.trim(),
        account_type: input.accountType,
      })
      .eq("id", userId);

    if (adminProfileError) {
      throw new Error(`profile_update_failed: ${adminProfileError.message}`);
    }
  }
}

async function createStudentUserViaAdmin(input: RegisterAccountDbInput): Promise<string> {
  const admin = createPrivilegedClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email.trim(),
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.fullName.trim(),
      role: "student",
      country: input.country,
      account_type: input.accountType,
      phone: input.phone.trim(),
    },
  });

  if (error) {
    throw new Error(`auth_signup_failed: ${error.message}`);
  }

  const userId = data.user?.id;
  if (!userId) {
    throw new Error("auth_signup_missing_user");
  }

  await updateRegisteredProfile(admin, userId, input);
  return userId;
}

export async function createRegisteredStudentAuth(
  input: RegisterAccountDbInput
): Promise<{ supabase: SupabaseClient; userId: string }> {
  const supabase = await createClient();

  await supabase.auth.signOut();

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: {
        full_name: input.fullName.trim(),
        role: "student",
        country: input.country,
        account_type: input.accountType,
        phone: input.phone.trim(),
      },
    },
  });

  if (!signUpError && signUpData.user?.identities?.length === 0) {
    throw new Error("auth_signup_failed: User already registered");
  }

  if (!signUpError && signUpData.user?.id) {
    await signInStudent(supabase, input);
    return { supabase, userId: signUpData.user.id };
  }

  if (!signUpError) {
    throw new Error("auth_signup_missing_user");
  }

  const signUpMessage = signUpError.message;
  if (isAlreadyRegisteredMessage(signUpMessage)) {
    throw new Error(`auth_signup_failed: ${signUpMessage}`);
  }

  if (hasServiceRoleKey()) {
    try {
      const userId = await createStudentUserViaAdmin(input);
      await signInStudent(supabase, input);
      return { supabase, userId };
    } catch (adminError) {
      const adminMessage =
        adminError instanceof Error ? adminError.message : "auth_signup_failed";
      if (isAlreadyRegisteredMessage(adminMessage)) {
        throw new Error(`auth_signup_failed: ${adminMessage}`);
      }
      throw adminError;
    }
  }

  throw new Error(`auth_signup_failed: ${signUpMessage}`);
}
