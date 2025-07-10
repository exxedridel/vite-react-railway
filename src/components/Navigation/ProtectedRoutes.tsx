import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

const ProtectedRoutes: React.FC<any> = ({ children }) => {
  const navigate = useNavigate();
  const [usuarioAutenticado, setUsuarioAutenticado] = useState(false);

  useEffect(() => {
    try {
      const bearer_token = localStorage.getItem("bearer_token");
      if (bearer_token) {
        setUsuarioAutenticado(true);
      } else {
        navigate("/");
      }
    } catch (error) {
      console.error("Error al obtener los datos:", error);
    }
  }, []);

  return (
    <>
      {!usuarioAutenticado && null}
      {usuarioAutenticado && children}
    </>
  );
};

export default ProtectedRoutes;
