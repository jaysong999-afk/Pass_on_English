import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createPrivilegedClient } from "@/lib/supabase/admin";
import type { TeacherApplication, TeacherSignupInput } from "@/types";
import {
  saveTeacherApplicationInDb,
  getTeacherApplicationForApplicantInDb,
} from "@/lib/teacher-applications/repository";

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

async function updateTeacherProfile(
  supabase: SupabaseClient,
  userId: string,
  input: TeacherSignupInput
) {
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: input.fullName.trim(),
      phone: input.phone.trim(),
    })
    .eq("id", userId);

  if (profileError) {
    const admin = createPrivilegedClient();
    const { error: adminProfileError } = await admin
      .from("profiles")
      .update({
        full_name: input.fullName.trim(),
        phone: input.phone.trim(),
      })
      .eq("id", userId);

    if (adminProfileError) {
      throw new Error(`profile_update_failed: ${adminProfileError.message}`);
    }
  }
}

async function signInApplicant(
  supabase: SupabaseClient,
  input: TeacherSignupInput
) {
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  });

  if (error) {
    throw new Error(`auth_signin_failed: ${error.message}`);
  }
}

async function findExistingApplicationId(email: string): Promise<string | null> {
  const admin = createPrivilegedClient();
  const { data, error } = await admin
    .from("teacher_applications")
    .select("id")
    .ilike("email", email.trim())
    .order("submitted_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`teacher_application_fetch_failed: ${error.message}`);
  }

  return data?.[0]?.id ?? null;
}

async function recoverExistingApplicant(
  supabase: SupabaseClient,
  input: TeacherSignupInput
): Promise<TeacherApplication> {
  await signInApplicant(supabase, input);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error(`auth_signin_failed: ${userError?.message ?? "missing_user"}`);
  }

  await updateTeacherProfile(supabase, user.id, input);

  const existingId = await findExistingApplicationId(input.email);
  if (existingId) {
    const application = await getTeacherApplicationForApplicantInDb(
      existingId,
      user.id,
      input.email
    );
    if (application) {
      return application;
    }
  }

  return saveTeacherApplicationInDb({
    fullName: input.fullName,
    dateOfBirth: input.dateOfBirth,
    phone: input.phone,
    bankAccount: input.bankAccount,
    facebookMessengerId: input.facebookMessengerId,
    address: input.address,
    email: input.email,
  });
}

async function createTeacherUserViaAdmin(input: TeacherSignupInput): Promise<string> {
  const admin = createPrivilegedClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email.trim(),
    password: input.password,
    email_confirm: true,
    user_metadata: {
      role: "teacher",
      full_name: input.fullName.trim(),
      phone: input.phone.trim(),
      locale: "ko",
    },
  });

  if (error) {
    throw new Error(`auth_signup_failed: ${error.message}`);
  }

  const userId = data.user?.id;
  if (!userId) {
    throw new Error("auth_signup_missing_user");
  }

  await updateTeacherProfile(admin, userId, input);
  return userId;
}

async function createTeacherUserId(
  supabase: SupabaseClient,
  input: TeacherSignupInput
): Promise<string> {
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: {
        full_name: input.fullName.trim(),
        role: "teacher",
        phone: input.phone.trim(),
        locale: "ko",
      },
    },
  });

  if (!signUpError && signUpData.user?.identities?.length === 0) {
    throw new Error("auth_signup_failed: User already registered");
  }

  if (!signUpError && signUpData.user?.id) {
    return signUpData.user.id;
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
      const userId = await createTeacherUserViaAdmin(input);
      await signInApplicant(supabase, input);
      return userId;
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

export async function registerTeacherApplicantInDb(
  input: TeacherSignupInput
): Promise<TeacherApplication> {
  const supabase = await createClient();

  try {
    const userId = await createTeacherUserId(supabase, input);
    await updateTeacherProfile(supabase, userId, input);

    const existingId = await findExistingApplicationId(input.email);
    if (existingId) {
      const application = await getTeacherApplicationForApplicantInDb(
        existingId,
        userId,
        input.email
      );
      if (application) {
        return application;
      }
    }

    return saveTeacherApplicationInDb({
      fullName: input.fullName,
      dateOfBirth: input.dateOfBirth,
      phone: input.phone,
      bankAccount: input.bankAccount,
      facebookMessengerId: input.facebookMessengerId,
      address: input.address,
      email: input.email,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (isAlreadyRegisteredMessage(message)) {
      return recoverExistingApplicant(supabase, input);
    }

    throw error;
  }
}
