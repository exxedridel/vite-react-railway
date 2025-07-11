import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAppContext } from "@/context/AppContext";

const ProtectedRoutes: React.FC<any> = ({ children }) => {
  const navigate = useNavigate();
  const { user, validateToken } = useAppContext();

  useEffect(() => {
    try {
      const bearer_token = localStorage.getItem("bearer_token");
      if (bearer_token) {
        validateToken(bearer_token);
      } else {
        navigate("/");
      }
    } catch (error) {
      console.error("Error al obtener los datos:", error);
    }
  }, []);

  return (
    <>
      {!user && null}
      {user && children}
    </>
  );
};

export default ProtectedRoutes;
