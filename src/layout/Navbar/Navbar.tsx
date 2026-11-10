import { ModeToggle } from "@/components/ui/mode-toggle";
import BattleMusicControl from "@/components/pokemon/BattleMusicControl";
import DropdownUser from "./DropdownUser";
import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/context/AppContext";

function Navbar() {
  const { user } = useAppContext();
  return (
    <div className="my-2 flex items-center justify-between gap-2">
      <div className="ml-3 flex items-center gap-2">
        <DropdownUser />
        <ModeToggle />
        {user && (
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to="/mensajes-prueba">
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Mensajes
            </Link>
          </Button>
        )}
      </div>

      <div className="mr-3 flex shrink-0 items-center">
        <BattleMusicControl compact />
      </div>
    </div>
  );
}

export default Navbar;
