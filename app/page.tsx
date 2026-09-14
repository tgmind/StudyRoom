import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isAdminUserId } from "@/lib/admin";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    if (isAdminEmail(user.email) || isAdminUserId(user.id)) {
      redirect("/admin");
    }
    redirect("/room");
  } else {
    redirect("/login");
  }
}
