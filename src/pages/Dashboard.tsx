import { useEffect, useState } from "react";
import { useAppContext } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { getTasksReq } from "@/services/tasks.api";
import { Plus } from "lucide-react";

const Dashboard = () => {
  const { navigate, setLoading } = useAppContext();
  const [tasks, setTasks]: any = useState();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    <div className="container flex flex-col items-center gap-6">
      <div className="card w-full md:w-[800px] space-y-1 text-center">
        <div className="font-bold text-lg">¡Te damos la bienvenida!</div>
        <div className="flex flex-row justify-center gap-1">
          <Plus className="text-brand shrink-0 mt-[0.5px]" />
          <div>
            Agrega un crédito
          </div>
        </div>
        {/* <br /> */}
        {/* <div className="w-full">
          <div className="flex justify-end">
            <Button
              disabled
              variant="default"
              onClick={() => navigate("/buscar-poliza")}
            >
              Nuevo crédito
            </Button>
          </div>
        </div> */}
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
