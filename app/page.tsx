import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "sa@admin.tg").toLowerCase();
    const adminUid = process.env.NEXT_PUBLIC_ADMIN_USER_ID || "8076296e-134a-4036-b8ed-1a9c6ff26ec1";
    if (
      user.email?.toLowerCase() === adminEmail ||
      user.email?.toLowerCase() === "sa@admin.tg" ||
      user.id === adminUid
    ) {
      redirect("/admin");
    }
    redirect("/room");
  } else {
    redirect("/login");
  }
}
