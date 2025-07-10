import React from "react";
import Navbar from "./Navbar/Navbar";

function Layout({ children }) {
  return (
    <div className="h-screen">
      <Navbar />
        <div className="w-full mx-auto col-span-5 lg:p-12 py-4">{children}</div>
    </div>
  );
}

export default Layout;
