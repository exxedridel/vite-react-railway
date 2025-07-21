import { createContext, useContext, useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { useNavigate } from "react-router-dom";
import { loginReq, logoutReq } from "@/services/login.api";
// import { toast } from "@/components/ui/use-toast";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, LogOut, PartyPopper } from "lucide-react";

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
  const [user, setUser] = useState(null);

  // *** Cambiar color del tema *****************************
  const initBrandColor = () => {
    return localStorage.getItem("brandColor");
  };
  const initBrandForeColor = () => {
    return localStorage.getItem("brandForeColor");
  };
  const [brandColor, setBrandColor] = useState(initBrandColor);
  const [brandForeColor, setBrandForeColor] = useState(initBrandForeColor);

  useEffect(() => {
    document.documentElement.style.setProperty("--brand", brandColor);
    document.documentElement.style.setProperty(
      "--brand-foreground",
      brandForeColor
    );

    localStorage.setItem("brandColor", brandColor);
    localStorage.setItem("brandForeColor", brandForeColor);
  }, [brandColor]);
  // **********************************************

  // Decodifica y valida AUTH_TOKEN, setea USER
  const validateToken = async (token) => {
    try {
      const decodedToken = jwtDecode(token);
      const currentTime = Date.now() / 1000;
      if (decodedToken.exp < currentTime) {
        console.warn("El token ha expirado. Limpiando sesión...");
        logout(token);
        return;
      } else {
        setUser({
          first_name: decodedToken.first_name || "N/D",
          last_name: decodedToken.last_name || "N/D",
          email: decodedToken.email,
        });
      }
    } catch (error) {
      console.error("Token no decodificado:", error);
      setUser(null);
    }
  };

  // SERVICIO - LOGIN
  const login = async (credentials) => {
    setLoading(true);

    await loginReq(credentials)
      .then((res) => {
        const token = res.data.token;
        if (token) {
          toast(<div className="ml-1">¡Te damos la bienvenida!</div>, {
            duration: 4000,
            icon: <PartyPopper className="text-brand h-5 w-5" />,
          });
          console.log("Has accedido correctamente.");
          localStorage.setItem("bearer_token", token);
          validateToken(token);
          navigate("/dashboard");
        }
      })
      .catch((err) => {
        //   toast({
        //     variant: "destructive",
        //     description: (
        //       <p className="flex flex-row items-center gap-3">
        //         <AlertCircle className="h-5 w-5" />
        //         {err.response.data.message}
        //       </p>
        //     ),
        //   });
        toast("fghgfhghgfhfghgfd.");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  // Servicio LOGOUT
  // Actualmente solo limpia el bearer_token
  const logout = async (token) => {
    setLoading(true);
    const config = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
    await logoutReq(config) // Actualmente no existe, siempre va al catch
      .then((res) => {
        // console.log("LogOUT respuesta:: ", res);
      })
      .catch((err) => {
        // console.error("LogOUT error:: ", err);
      })
      .finally(() => {
        setLoading(false);
        toast.success("Se ha cerrado tu sesión.");
        console.log("Se ha cerrado tu sesión.");
        localStorage.removeItem("bearer_token");
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
        brandColor,
        setBrandColor,
        brandForeColor,
        setBrandForeColor,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
