import React from "react";
import Navbar from "./Navbar/Navbar";

function Layout({ children }) {
  return (
    <div className="h-[100dvh]">
      <Navbar />
        <div className="w-full mx-auto col-span-5 lg:p-12 py-7">{children}</div>
    </div>
  );
}

export default Layout;
