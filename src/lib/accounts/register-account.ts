import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createPrivilegedClient } from "@/lib/supabase/admin";
import type { RegisterAccountInput } from "@/lib/account-store.types";
import { countryToTimezone } from "@/lib/account-location";

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
      country: input.country,
      timezone: countryToTimezone(input.country),
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
        country: input.country,
        timezone: countryToTimezone(input.country),
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
      timezone: countryToTimezone(input.country),
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

async function findAuthUserByEmail(email: string): Promise<User | null> {
  const admin = createPrivilegedClient();
  const normalizedEmail = email.trim().toLowerCase();

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`auth_user_lookup_failed: ${error.message}`);
    }

    const user = data.users.find(
      (candidate) => candidate.email?.trim().toLowerCase() === normalizedEmail
    );
    if (user) return user;
    if (data.users.length < 200) return null;
  }
}

/** Recover only a partial signup whose original password is proven correct. */
async function recoverIncompleteStudentAuth(
  supabase: SupabaseClient,
  input: RegisterAccountDbInput
): Promise<string | null> {
  const admin = createPrivilegedClient();
  const user = await findAuthUserByEmail(input.email);
  if (!user || user.email_confirmed_at || user.last_sign_in_at) return null;

  const { count, error: studentError } = await admin
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("account_holder_id", user.id);
  if (studentError) {
    throw new Error(`student_lookup_failed: ${studentError.message}`);
  }
  if ((count ?? 0) > 0) return null;

  // A correct password reaches email_not_confirmed; invalid credentials do not.
  const { error: verificationError } = await supabase.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  });
  const verificationDetail =
    `${verificationError?.code ?? ""} ${verificationError?.message ?? ""}`.toLowerCase();
  if (
    !verificationDetail.includes("email_not_confirmed") &&
    !verificationDetail.includes("email not confirmed")
  ) {
    return null;
  }

  const { error: confirmError } = await admin.auth.admin.updateUserById(user.id, {
    email_confirm: true,
    user_metadata: {
      full_name: input.fullName.trim(),
      role: "student",
      country: input.country,
      timezone: countryToTimezone(input.country),
      account_type: input.accountType,
      phone: input.phone.trim(),
    },
  });
  if (confirmError) {
    throw new Error(`auth_signup_failed: ${confirmError.message}`);
  }

  await signInStudent(supabase, input);
  await updateRegisteredProfile(admin, user.id, input);
  return user.id;
}

export async function createRegisteredStudentAuth(
  input: RegisterAccountDbInput
): Promise<{ supabase: SupabaseClient; userId: string }> {
  const supabase = await createClient();

  await supabase.auth.signOut();

  if (hasServiceRoleKey()) {
    try {
      const userId = await createStudentUserViaAdmin(input);
      await signInStudent(supabase, input);
      return { supabase, userId };
    } catch (adminError) {
      const adminMessage =
        adminError instanceof Error ? adminError.message : "auth_signup_failed";
      if (!isAlreadyRegisteredMessage(adminMessage)) throw adminError;

      const recoveredUserId = await recoverIncompleteStudentAuth(supabase, input);
      if (recoveredUserId) return { supabase, userId: recoveredUserId };
      throw new Error(`auth_signup_failed: ${adminMessage}`);
    }
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: {
        full_name: input.fullName.trim(),
        role: "student",
        country: input.country,
        timezone: countryToTimezone(input.country),
        account_type: input.accountType,
        phone: input.phone.trim(),
      },
    },
  });

  if (!signUpError && signUpData.user?.identities?.length === 0) {
    throw new Error("auth_signup_failed: User already registered");
  }

  if (!signUpError && signUpData.user?.id && signUpData.session) {
    return { supabase, userId: signUpData.user.id };
  }

  if (!signUpError && signUpData.user?.id) {
    throw new Error("auth_email_confirmation_required");
  }

  if (!signUpError) {
    throw new Error("auth_signup_missing_user");
  }

  const signUpMessage = signUpError.message;
  if (isAlreadyRegisteredMessage(signUpMessage)) {
    throw new Error(`auth_signup_failed: ${signUpMessage}`);
  }

  throw new Error(`auth_signup_failed: ${signUpMessage}`);
}
