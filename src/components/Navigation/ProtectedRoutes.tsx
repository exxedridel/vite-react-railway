import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAppContext } from "@/context/AppContext";
import { Button } from "@/components/ui/button";

export default function ProtectedRoutes({ children }: { children: ReactNode }) {
  const { user, sessionStatus, sessionError, validateToken, logout } =
    useAppContext();
  if (user) return <>{children}</>;
  if (sessionStatus === "error")
    return (
      <main className="mx-auto flex min-h-[70dvh] max-w-lg flex-col justify-center gap-4 px-5">
        <h1 className="text-xl font-semibold">
          No se pudo verificar la cuenta
        </h1>
        <p role="alert" className="text-sm text-destructive">
          {sessionError}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void validateToken()}>Reintentar</Button>
          <Button variant="outline" onClick={() => void logout()}>
            Volver al login
          </Button>
        </div>
      </main>
    );
  if (sessionStatus === "checking")
    return (
      <p role="status" className="p-8 text-center text-sm">
        Verificando tu cuenta…
      </p>
    );
  return <Navigate to="/" replace />;
}
