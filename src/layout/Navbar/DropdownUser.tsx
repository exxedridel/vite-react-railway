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
import { useAppContext } from "@/context/AppContext";

export default function DropdownUser() {
  const { user } = useAppContext();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="flex flex-row items-center gap-2"
        >
          Hola, {user?.first_name || "N/A"}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 p-3">
        <DropdownMenuLabel className="select-none">
          Datos de tu cuenta
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <div className="flex flex-col gap-1 text-[14px]">
            <div className="flex felx-row items-center">
              <User className="ml-2 mr-2 h-4 w-4" />
              {user?.first_name}{" "}
              {user?.last_name}
            </div>
            <div className="flex felx-row items-center">
              <Mail className="ml-2 mr-2 h-4 w-4" />
              {user?.email || "N/A"}
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
