import { ModeToggle } from "@/components/ui/mode-toggle";
import BattleMusicControl from "@/components/pokemon/BattleMusicControl";
import DropdownUser from "./DropdownUser";

function Navbar() {
  return (
    <div className="my-2 flex items-center justify-between gap-2">
      <div className="ml-3 flex items-center gap-2">
        <DropdownUser />
        <ModeToggle />
      </div>

      <div className="mr-3 flex shrink-0 items-center">
        <BattleMusicControl compact />
      </div>
    </div>
  );
}

export default Navbar;