import { useEffect, useState } from "react";
import { useAppContext } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { getTasksReq } from "@/services/tasks.api";

const Dashboard = () => {
  const { navigate, setLoading } = useAppContext();
  const [tasks, setTasks]: any = useState();

  useEffect(() => {
    const getTasks = async () => {
      setLoading(true);
      await getTasksReq()
        .then((res) => {
          console.log("getTasksReq Res:: ", res.data);
          setTasks(res?.data);
        })
        .catch((err) => {
          console.log("getTasksReq Err:: ", err);
        })
        .finally(() => {
          setLoading(false);
        });
    };
    getTasks();
  }, []);

  return (
    <div className="container flex flex-col items-center gap-5">
      <div className="card w-full md:w-[800px]">
        <div className="font-bold text-lg">Registrar Crédito</div>
        <div>
          Aquí puedes registrar un nuevo crédito para mantener tus pagos al
          corriente.
        </div>
        <br />
        <div className="w-full">
          <div className="flex justify-end">
            <Button
              disabled
              variant="default"
              onClick={() => navigate("/buscar-poliza")}
            >
              Nuevo Registro
            </Button>
          </div>
        </div>
      </div>

      {tasks?.map((task: any, i: number) => (
        <div key={i} className="card w-full md:w-[800px]">
          {JSON.stringify(task, null, 2)}
        </div>
      ))}
    </div>
  );
};

export default Dashboard;
