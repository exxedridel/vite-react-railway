import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAppContext } from "@/context/AppContext";
import { Button } from "@/components/ui/button";

export default function AdminRoutes({ children }: { children: ReactNode }) {
  const { user } = useAppContext();
  if (user?.role === "admin") return <>{children}</>;
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-lg flex-col justify-center gap-4 px-5">
      <h1 className="text-xl font-semibold">
        Acceso reservado al administrador
      </h1>
      <p className="text-sm text-muted-foreground">
        Esta cuenta puede jugar y comunicarse con otros jugadores. La gestión de
        usuarios requiere permisos de administrador.
      </p>
      <Button asChild>
        <Link to="/dashboard">Volver al juego</Link>
      </Button>
    </main>
  );
}
