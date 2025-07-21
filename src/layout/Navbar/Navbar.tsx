import { Link } from "react-router-dom";
import { ModeToggle } from "@/components/ui/mode-toggle";
import DropdownUser from "./DropdownUser";
import { HandCoins, Plus } from "lucide-react";

function Navbar() {
  return (
    <div>
      <div className="my-2 flex flex-row items-center justify-between">
        <div className="ml-3 flex flex-row gap-2">
          <DropdownUser />
          <ModeToggle />
        </div>
        <Link to="/dashboard" className="mr-1">
          {/* <img
            className="ml-3 my-1 w-[55px]"
            src="/credit-control.webp"
            alt="cc-logo"
          /> */}
          <Plus size={50} className="w-[55px] text-brand" />
        </Link>
      </div>
    </div>
  );
}

export default Navbar;
