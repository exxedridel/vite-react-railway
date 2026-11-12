import { lazy, Suspense, useState, type ReactNode } from "react";
import { MessageCircle, Store, Swords, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/context/AppContext";
import Layout from "@/layout/Layout";
import AdminShopPage from "@/pages/AdminShopPage";
import PvpPartyGate from "@/components/pvp/PvpPartyGate";
import ShopPartyGate from "@/components/shop/ShopPartyGate";

const AdminBattlePanel = lazy(() => import("@/pages/AdminBattlePanel"));
const ADMIN_PANEL_KEY = "pokemon-admin-active-panel:v1";

function AdminWorkspace() {
  const { user } = useAppContext();
  const [panel, setPanel] = useState<"shop" | "battle">(() => {
    try {
      return localStorage.getItem(ADMIN_PANEL_KEY) === "battle"
        ? "battle"
        : "shop";
    } catch {
      return "shop";
    }
  });
  function choosePanel(next: "shop" | "battle") {
    try {
      localStorage.setItem(ADMIN_PANEL_KEY, next);
    } catch {
      /* El panel sigue siendo accesible si el navegador limita el almacenamiento. */
    }
    setPanel(next);
  }
  return (
    <>
      <nav
        aria-label="Paneles del administrador"
        className="mx-auto flex w-full max-w-7xl flex-wrap gap-2 border-b px-3 py-3 sm:px-6"
      >
        <Button
          type="button"
          variant={panel === "shop" ? "default" : "outline"}
          className="min-h-11 gap-2"
          aria-pressed={panel === "shop"}
          onClick={() => choosePanel("shop")}
        >
          <Store className="h-4 w-4" aria-hidden="true" /> Tienda
        </Button>
        <Button
          type="button"
          variant={panel === "battle" ? "default" : "outline"}
          className="min-h-11 gap-2"
          aria-pressed={panel === "battle"}
          onClick={() => choosePanel("battle")}
        >
          <Swords className="h-4 w-4" aria-hidden="true" /> Panel batalla
        </Button>
        <Button asChild variant="outline" className="min-h-11 gap-2">
          <Link to="/users">
            <Users className="h-4 w-4" aria-hidden="true" /> Usuarios
          </Link>
        </Button>
        {user && (
          <Button asChild variant="outline" className="min-h-11 gap-2">
            <Link to="/mensajes-prueba">
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Mensajes
              de prueba
            </Link>
          </Button>
        )}
      </nav>
      {panel === "shop" ? (
        <AdminShopPage />
      ) : (
        <Suspense
          fallback={
            <p
              role="status"
              className="p-8 text-center text-sm text-muted-foreground"
            >
              Preparando el panel de batalla…
            </p>
          }
        >
          <AdminBattlePanel />
        </Suspense>
      )}
    </>
  );
}

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
  if (user.role === "admin") return <AdminWorkspace />;
  return (
    <PvpPartyGate>
      <ShopPartyGate>
        <Layout>{children}</Layout>
      </ShopPartyGate>
    </PvpPartyGate>
  );
}
