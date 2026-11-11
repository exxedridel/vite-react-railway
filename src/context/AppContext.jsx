import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PartyPopper } from "lucide-react";
import { loginReq, logoutReq, profileReq } from "@/services/login.api";
import { activateAccountStore, clearAccountStore } from "@/store/store";
import LegacyPartyImportDialog from "@/components/Navigation/LegacyPartyImportDialog";

/** @type {import("react").Context<any>} */
export const AppContext = createContext(null);
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context)
    throw new Error("useAppContext must be used within an AppContextProvider");
  return context;
};
function readToken() {
  try {
    return localStorage.getItem("bearer_token");
  } catch {
    return null;
  }
}
function publicProfile(value) {
  if (
    !value ||
    !Number.isSafeInteger(value.id) ||
    value.id <= 0 ||
    typeof value.email !== "string" ||
    typeof value.first_name !== "string" ||
    typeof value.last_name !== "string" ||
    !["admin", "player"].includes(value.role)
  ) {
    throw new Error(
      "El servicio de autenticación devolvió un perfil incompatible.",
    );
  }
  return {
    id: value.id,
    email: value.email,
    first_name: value.first_name,
    last_name: value.last_name,
    role: value.role,
  };
}
export const AppContextProvider = ({ children }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [polizasData, setPolizasData] = useState();
  const [currentPoliza, setCurrentPoliza] = useState();
  const [user, setUser] = useState(null);
  const [sessionStatus, setSessionStatus] = useState("checking");
  const [sessionError, setSessionError] = useState("");
  const [pokemonDialogOpen, setPokemonDialogOpen] = useState(false);
  const [brandColor, setBrandColor] = useState(() =>
    localStorage.getItem("brandColor"),
  );
  const [brandForeColor, setBrandForeColor] = useState(() =>
    localStorage.getItem("brandForeColor"),
  );
  const requestRef = useRef(null);
  const generationRef = useRef(0);
  const logoutRef = useRef(null);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (brandColor) {
      document.documentElement.style.setProperty("--brand", brandColor);
      localStorage.setItem("brandColor", brandColor);
    }
    if (brandForeColor) {
      document.documentElement.style.setProperty(
        "--brand-foreground",
        brandForeColor,
      );
      localStorage.setItem("brandForeColor", brandForeColor);
    }
  }, [brandColor, brandForeColor]);

  const endSession = useCallback(async (expectedToken, message = "") => {
    if (expectedToken && readToken() !== expectedToken) return;
    ++generationRef.current;
    requestRef.current?.abort();
    setUser(null);
    setPokemonDialogOpen(false);
    setPolizasData(undefined);
    setCurrentPoliza(undefined);
    setSessionError(message);
    setSessionStatus("anonymous");
    try {
      localStorage.removeItem("bearer_token");
    } catch {
      toast.error(
        "El navegador no permitió borrar la sesión guardada. Revisa sus permisos de almacenamiento.",
      );
    }
    try {
      await clearAccountStore();
    } catch {
      toast.error("No se pudo completar el guardado local al cerrar sesión.");
    }
    const currentToken = readToken();
    if (!currentToken || (expectedToken && currentToken === expectedToken))
      navigateRef.current("/", { replace: true });
  }, []);

  const validateToken = useCallback(
    async (token = readToken()) => {
      if (!token || readToken() !== token) return null;
      const generation = ++generationRef.current;
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setUser(null);
      setSessionStatus("checking");
      setSessionError("");
      const current = () =>
        generationRef.current === generation && readToken() === token;
      try {
        const response = await profileReq(token, controller.signal);
        const profile = publicProfile(response.data?.user);
        if (!current()) return null;
        await activateAccountStore(profile.id);
        if (!current()) return null;
        setUser(profile);
        setSessionStatus("authenticated");
        return profile;
      } catch (error) {
        if (!current() || controller.signal.aborted) return null;
        if ([401, 403].includes(error?.response?.status)) {
          await endSession(
            token,
            "Tu sesión terminó. Inicia sesión con tu correo y contraseña.",
          );
        } else {
          setSessionStatus("error");
          setSessionError(
            error?.response?.status === 404
              ? "El servicio de autenticación necesita la actualización de usuarios (/api/auth/me)."
              : error?.response?.data?.message ||
                  error?.message ||
                  "No se pudo verificar tu cuenta. Reintenta la conexión.",
          );
        }
        return null;
      }
    },
    [endSession],
  );

  useEffect(() => {
    const token = readToken();
    if (token && !logoutRef.current) void validateToken(token);
    else setSessionStatus("anonymous");
    function changedSession(event) {
      if (event.key !== "bearer_token" && event.key !== null) return;
      const next = readToken();
      if (next) void validateToken(next);
      else void endSession(null);
    }
    window.addEventListener("storage", changedSession);
    return () => {
      ++generationRef.current;
      requestRef.current?.abort();
      window.removeEventListener("storage", changedSession);
    };
  }, [validateToken, endSession]);

  const login = async (credentials) => {
    if (loading) return;
    setLoading(true);
    try {
      const email = credentials.email.trim().toLowerCase();
      const response = await loginReq({
        email,
        password: credentials.password,
      });
      const token = response.data?.token;
      if (typeof token !== "string" || !token)
        throw new Error("El login no devolvió una sesión válida.");
      localStorage.setItem("bearer_token", token);
      const profile = await validateToken(token);
      if (!profile) {
        if (readToken() === token) navigate("/dashboard");
        return;
      }
      toast(<div className="ml-1">¡Te damos la bienvenida!</div>, {
        duration: 4000,
        icon: <PartyPopper className="text-brand h-5 w-5" />,
      });
      navigate("/dashboard");
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "No se pudo iniciar sesión.",
      );
    } finally {
      setLoading(false);
    }
  };

  const logout = useCallback(
    async (token = readToken()) => {
      if (logoutRef.current) return logoutRef.current;
      if (token && readToken() !== token) return;
      const operation = (async () => {
        setLoading(true);
        try {
          const request = token
            ? logoutReq(token).then(
                () => true,
                // An expired or already-revoked session is already closed.
                (error) => error?.response?.status === 401,
              )
            : Promise.resolve(true);
          await endSession(token);
          const confirmed = await request;
          if (readToken() === null) {
            if (confirmed) toast.success("Se ha cerrado tu sesión.");
            else
              toast.warning(
                "Sesión cerrada en este dispositivo. No se pudo confirmar el cierre en el servidor.",
              );
          }
        } finally {
          setLoading(false);
        }
      })();
      logoutRef.current = operation;
      try {
        await operation;
      } finally {
        logoutRef.current = null;
      }
    },
    [endSession],
  );

  return (
    <AppContext.Provider
      value={{
        navigate,
        loading,
        setLoading,
        validateToken,
        login,
        logout,
        sessionStatus,
        sessionError,
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
      {user && <LegacyPartyImportDialog user={user} />}
    </AppContext.Provider>
  );
};
