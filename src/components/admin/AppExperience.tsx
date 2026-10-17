import type { ReactNode } from "react";
import { useAppContext } from "@/context/AppContext";
import Layout from "@/layout/Layout";
import AdminShopPage from "@/pages/AdminShopPage";
import { isShopAdmin } from "@/lib/adminShop";

// Se monta después de ProtectedRoutes y antes del Layout del juego.
export default function AppExperience({ children }: { children: ReactNode }) {
  const { user } = useAppContext();
  if (!user?.email)
    return (
      <div
        role="status"
        className="flex min-h-[50dvh] items-center justify-center px-4 text-sm text-muted-foreground"
      >
        Cargando perfil…
      </div>
    );
  if (isShopAdmin(user.email)) return <AdminShopPage />;
  return <Layout>{children}</Layout>;
}
