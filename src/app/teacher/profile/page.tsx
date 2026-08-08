import { redirect } from "next/navigation";

/** Profile editing moved to admin portal; teachers complete profile at signup. */
export default function TeacherProfileRedirectPage() {
  redirect("/teacher");
}
