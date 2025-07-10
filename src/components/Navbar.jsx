import React from "react";
import { Link } from "react-router-dom";

function Navbar() {
  return (
    <div className="bg-neutral-800 flex justify-center px-3 py-4">
      <div className="container flex justify-between ">
        <Link to="/" className="text-lg text-white font-bold flex items-center">
          <img src="/credit-control.webp" alt="cc-logo" width={40}/>
        </Link>

        <ul className="flex gap-x-2">
          <li>
            <Link
              to="/"
              className="bg-zinc-900 text-white px-4 py-2 rounded-sm inline-block"
            >
              Home
            </Link>
          </li>
          <li>
            <Link
              to="/new-task"
              className="bg-blue-700 text-white px-4 py-2 rounded-sm inline-block"
            >
              Create task
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default Navbar;
