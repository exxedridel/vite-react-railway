import { useEffect } from "react";
import { useAppContext } from "@/context/AppContext";

const Logout = () => {
  const { logout } = useAppContext();
  useEffect(() => {
    void logout();
  }, [logout]);
  return (
    <p role="status" className="p-8 text-center text-sm">
      Cerrando sesión…
    </p>
  );
};
export default Logout;
