import React from "react";
import { AlertCircle } from "lucide-react";

function NotFound() {
  return (
    <div className="h-screen flex flex-col items-center justify-center p-3 bg-[url('/back-office/pattern-insuranceservices.svg')]">
      <div className="card p-9 shadow-xl">
        <h2 className="text-5xl font-bold uppercase text-center py-2">404</h2>
        <hr className="my-4" />
        <p className="text-xl font-bold text-center flex flex-row items-center justify-center gap-2">
          <AlertCircle size={18} className="shrink-0" />
          No se encontró esta ruta
        </p>
        <p className="text-md text-center py-2">
          Verifica que la ruta esté escrita correctamente o intenta más tarde.
        </p>
      </div>
    </div>
  );
}

export default NotFound;
