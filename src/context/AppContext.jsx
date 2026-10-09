import { createContext, useContext, useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PartyPopper } from "lucide-react";

import { loginReq, logoutReq } from "@/services/login.api";

/** @type {import("react").Context<any>} */
export const AppContext = createContext(null);

export const useAppContext = () => {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error(
      "useAppContext must be used within an AppContextProvider"
    );
  }

  return context;
};

export const AppContextProvider = ({ children }) => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [polizasData, setPolizasData] = useState();
  const [currentPoliza, setCurrentPoliza] = useState();
  const [user, setUser] = useState(null);

  // Estado compartido del diálogo.
  const [pokemonDialogOpen, setPokemonDialogOpen] = useState(false);

  // Colores del tema.
  const [brandColor, setBrandColor] = useState(() =>
    localStorage.getItem("brandColor")
  );

  const [brandForeColor, setBrandForeColor] = useState(() =>
    localStorage.getItem("brandForeColor")
  );

  useEffect(() => {
    if (brandColor) {
      document.documentElement.style.setProperty("--brand", brandColor);
      localStorage.setItem("brandColor", brandColor);
    }

    if (brandForeColor) {
      document.documentElement.style.setProperty(
        "--brand-foreground",
        brandForeColor
      );
      localStorage.setItem("brandForeColor", brandForeColor);
    }
  }, [brandColor, brandForeColor]);

  const validateToken = async (token) => {
    try {
      const decodedToken = jwtDecode(token);
      const currentTime = Date.now() / 1000;

      if (decodedToken.exp < currentTime) {
        console.warn("El token ha expirado. Limpiando sesión...");
        await logout(token);
        return;
      }

      setUser({
        first_name: decodedToken.first_name || "N/D",
        last_name: decodedToken.last_name || "N/D",
        email: decodedToken.email,
      });
    } catch (error) {
      console.error("Token no decodificado:", error);
      setUser(null);
    }
  };

  const login = async (credentials) => {
    setLoading(true);

    try {
      const res = await loginReq(credentials);
      const token = res.data.token;

      if (token) {
        toast(<div className="ml-1">¡Te damos la bienvenida!</div>, {
          duration: 4000,
          icon: <PartyPopper className="text-brand h-5 w-5" />,
        });

        localStorage.setItem("bearer_token", token);
        await validateToken(token);
        navigate("/dashboard");
      }
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "No se pudo iniciar sesión."
      );
    } finally {
      setLoading(false);
    }
  };

  const logout = async (token) => {
    setLoading(true);
    setPokemonDialogOpen(false);

    const config = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };

    try {
      await logoutReq(config);
    } catch {
      // El cierre local también funciona si el endpoint no está disponible.
    } finally {
      localStorage.removeItem("bearer_token");
      setUser(null);
      setLoading(false);

      toast.success("Se ha cerrado tu sesión.");
      navigate("/");
    }
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
        pokemonDialogOpen,
        setPokemonDialogOpen,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};