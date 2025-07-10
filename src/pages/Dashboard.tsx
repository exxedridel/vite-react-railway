import { useAppContext } from "@/context/AppContext";
import { Button } from "@/components/ui/button";

const Dashboard = () => {
  const { navigate } = useAppContext();
  return (
    <div className="container flex flex-col items-center gap-5">
      <div className="card w-full md:w-[800px]">
        <div className="font-bold text-lg">Registrar Crédito</div>
        <div>
          Aquí puedes registrar un nuevo crédito para mantener tus pagos al corriente.
        </div>
        <br />
        <div className="w-full">
          <div className="flex justify-end"><Button disabled variant="default" onClick={()=> navigate("/buscar-poliza")}>Nuevo Registro</Button></div>
        </div>
      </div>
      {/* <div className="card w-full md:w-[800px]">
        <div className="font-bold text-lg">Cerrar Sesión</div>
        <div>
          Aquí puedes cerrar tu sesión cuando termines de reportar un siniestro.
        </div>
        <br />
        <div className="w-full">
          <div className="flex justify-end"><Button variant="default" onClick={()=> navigate("/logout")}>Cerrar Sesión</Button></div>
        </div>
      </div> */}
    </div>
  );
};

export default Dashboard;
