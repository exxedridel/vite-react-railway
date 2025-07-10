import { Link } from "react-router-dom";
import DropdownUser from "./DropdownUser";

function Navbar() {
  return (
    <div>
      <div className="card p-1 flex flex-row items-center justify-between">
        <Link to="/dashboard">
          <img
            className="ml-3 my-1 w-[55px]"
            src="/credit-control.webp"
            alt="cc-logo"
          />
        </Link>
        <DropdownUser />
      </div>
    </div>
  );
}

export default Navbar;
