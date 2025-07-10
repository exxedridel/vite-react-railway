import { createContext, useContext, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { useNavigate } from "react-router-dom";
import { loginReq, logoutReq } from "@/services/login.api";
import { toast } from "@/components/ui/use-toast";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export const AppContext = createContext();

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within a ContextProvider");
  }
  return context;
};

export const AppContextProvider = ({ children }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [polizasData, setPolizasData] = useState();
  const [currentPoliza, setCurrentPoliza] = useState();
  const [authToken, setAuthToken] = useState(
    localStorage.getItem("bearer_token")
  );
  const [user, setUser] = useState();

  // Será SERVICIO - Validar AUTH TOKEN
  // Actualmente solo decodifica auth token
  const validateToken = async (token) => {
    try {
      const decodedToken = jwtDecode(token);
      const currentTime = Date.now() / 1000;
      if (decodedToken.exp < currentTime) {
        console.warn("El token ha expirado. Limpiando sesión...");
        logout(token);
        return;
      }
      console.log("decodedToken:: ", decodedToken);
      setUser({
        first_name: decodedToken.first_name || "N/D",
        last_name: decodedToken.last_name || "N/D",
        email: decodedToken.email,
      });
    } catch (error) {
      console.error("Token no decodificado:", error);
      // localStorage.removeItem("authToken");
      // setAuthToken(null);
      // setCurrentUser(null);
    }

    // setCurrentUser(null);
  };

  // SERVICIO - LOGIN
  const login = async (credentials) => {
    setLoading(true);

    await loginReq(credentials)
      .then((res) => {
        const token = res.data.token;
        if (token) {
          console.log("Has accedido correctamente.");
          localStorage.setItem("bearer_token", token);
          validateToken(token);
          navigate("/dashboard");
        }
      })
      .catch((err) => {
        toast({
          variant: "destructive",
          description: (
            <p className="flex flex-row items-center gap-3">
              <AlertCircle className="h-5 w-5" />
              {err.response.data.message}
            </p>
          ),
        });
      })
      .finally(() => {
        setLoading(false);
      });

    // localStorage.setItem(
    //   "bearer_token",
    //   "hY3iO5gR96poQ7g2xp892ddiIOPwc8wm934r0d7T6se4"
    // );
    // localStorage.setItem(
    //   "usuario",
    //   JSON.stringify({
    //     nombre: "Heved",
    //     apellido_paterno: "Ríos",
    //     apellido_materno: "Delgado",
    //     username: "hevedrios@gmail.com",
    //     profile: "Asesor",
    //   })
    // );
    // navigate("/dashboard");
  };

  // SERVICIO - LOGOUT
  // Actualmente siempre falla, este back no guarda la sesión
  // solo se valida en front por tiempo de expiración del token
  const logout = async (token) => {
    setLoading(true);
    const config = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
    await logoutReq(config)
      .then((response) => {
        // console.log("LogOUT respuesta:: ", response);
        // toast({
        //   description: (
        //     <p className="flex flex-row items-center gap-3">
        //       <CheckCircle2 className="h-5 w-5" />
        //       {response.data.message}
        //     </p>
        //   ),
        // });
      })
      .catch((error) => {
        // console.error("LogOUT error:: ", error);
      })
      .finally(() => {
        setLoading(false);
        toast({
          // variant: "destructive",
          description: (
            <p className="flex flex-row items-center gap-3">
              <AlertCircle className="h-5 w-5" />
              {/* {error.response.data.message} */}
              Se ha cerrado tu sesión.
            </p>
          ),
        });
        localStorage.removeItem("bearer_token");
        localStorage.removeItem("usuario");
        navigate("/");
      });
  };

  return (
    <AppContext.Provider
      value={{
        navigate,
        loading,
        setLoading,
        validateToken,
        login,
        logout,
        isIdle,
        setIsIdle,
        polizasData,
        setPolizasData,
        currentPoliza,
        setCurrentPoliza,
        user,
        setUser,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
