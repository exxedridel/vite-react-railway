import Dashboard from "@/pages/Dashboard";
import BuscarPoliza from "@/pages/BuscarPoliza";
import RegistrarSiniestro from "@/pages/RegistrarSiniestro";

const AppRoutes = [
  {
    path: "/dashboard",
    component: Dashboard,
    exact: true,
  },
  {
    path: "/buscar-poliza",
    component: BuscarPoliza,
    exact: true,
  },
  {
    path: "/registrar-siniestro",
    component: RegistrarSiniestro,
    exact: true,
  },
];

export default AppRoutes;