import { createContext, useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginRequest, logoutRequest } from "@/services/login.api";
import { toast } from "@/components/ui/use-toast";
import { AlertCircle, CheckCircle2, Files } from "lucide-react";

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

  // SERVICIO - LOGIN
  const login = async (credentials) => {
    // loginRequest() para la llamada real al BE
    setLoading(true);
    await setTimeout(() => {
      setLoading(false);
      toast({
        description: (
          <p className="flex flex-row items-center gap-3">
            <CheckCircle2 className="h-5 w-5" />
            Has accedido correctamente
          </p>
        ),
      });

      localStorage.setItem(
        "bearer_token",
        "hY3iO5gR96poQ7g2xp892ddiIOPwc8wm934r0d7T6se4"
      );
      localStorage.setItem(
        "usuario",
        JSON.stringify({
          nombre: "Heved",
          apellido_paterno: "Ríos",
          apellido_materno: "Delgado",
          username: "hevedrios@gmail.com",
          profile: "Asesor",
        })
      );
      navigate("/dashboard");
    }, 1000);
  };

  // SERVICIO - LOGOUT
  const logout = async (token) => {
    setLoading(true);
    const config = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
    await logoutRequest(config)
      .then((response) => {
        // console.log("LogOUT respuesta:: ", response);
        setLoading(false);
        toast({
          description: (
            <p className="flex flex-row items-center gap-3">
              <CheckCircle2 className="h-5 w-5" />
              {response.data.message}
            </p>
          ),
        });
      })
      .catch((error) => {
        // console.error("LogOUT error:: ", error);
        setLoading(false);
        toast({
          // variant: "destructive",
          description: (
            <p className="flex flex-row items-center gap-3">
              <AlertCircle className="h-5 w-5" />
              {/* {error.response.data.message} */}
              Has cerrado sesión correctamente
            </p>
          ),
        });
      });
  };

  return (
    <AppContext.Provider
      value={{
        navigate,
        loading,
        setLoading,
        login,
        logout,
        isIdle,
        setIsIdle,
        polizasData,
        setPolizasData,
        currentPoliza,
        setCurrentPoliza,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
