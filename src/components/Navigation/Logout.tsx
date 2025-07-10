import React, { useEffect } from "react";
import { useAppContext } from "@/context/AppContext";
import AppLoader from "../AppLoader/AppLoader";

const Logout = () => {

  const { logout, navigate } = useAppContext();

  useEffect(() => {
    async function logoutAsync() {
      try {
        const bearer_token = localStorage.getItem("bearer_token");
        await logout(bearer_token);
      } catch (error) {
        console.error("Error", error);
      }
    }
    logoutAsync(); 
  }, []);

  return <AppLoader/>;
};

export default Logout;
