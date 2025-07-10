import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LogOut, User, Mail, ChevronDown, SquareAsterisk } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Usuario {
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string;
  profile: string;
  username: string;
}

export default function DropdownUser() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem("usuario");
    if (userData) {
      const usuarioData = JSON.parse(userData) as Usuario;
      setUsuario(usuarioData);
    }
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="flex flex-row items-center gap-2 mr-5"
        >
          Hola {usuario ? usuario.nombre : "N/A"}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel className="select-none">
          Datos de tu cuenta
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <div className="flex flex-col gap-1 text-[14px]">
            <div className="flex felx-row items-center">
              <User className="ml-2 mr-2 h-4 w-4" />
              {usuario ? usuario.nombre : "N/A"}{" "}
              {usuario ? usuario.apellido_paterno : "N/A"}
            </div>
            <div className="flex felx-row items-center">
              <Mail className="ml-2 mr-2 h-4 w-4" />
              {usuario ? usuario.username : "N/A"}
            </div>
          </div>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <SquareAsterisk className="mr-2 h-4 w-4" />
          <span>Cambiar contraseña</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <LogOut className="mr-2 h-4 w-4" />
          <Link to="/logout">Cerrar Sesión</Link>
          <DropdownMenuShortcut></DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
