import { Link } from "react-router-dom";
import { ModeToggle } from "@/components/ui/mode-toggle";
import DropdownUser from "./DropdownUser";
import { HandCoins } from "lucide-react";

function Navbar() {
  return (
    <div>
      <div className="card p-1 flex flex-row items-center justify-between">
        <Link to="/dashboard">
          {/* <img
            className="ml-3 my-1 w-[55px]"
            src="/credit-control.webp"
            alt="cc-logo"
          /> */}
          <HandCoins size={30} className="ml-1 my-1 w-[55px]"/>
        </Link>
        <div className="flex flex-row gap-2">
          <ModeToggle />
          <DropdownUser />
        </div>
      </div>
    </div>
  );
}

export default Navbar;
