export type UserRole = "student" | "teacher" | "admin";

export interface AuthProfile {
  id: string;
  role: UserRole;
  fullName: string | null;
  locale: string | null;
}

export interface AuthContext {
  userId: string;
  email: string;
  profile: AuthProfile;
}
