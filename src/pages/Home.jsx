import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TaskCard from "../components/TaskCard";
import { useTasks } from "../context/TasksContext";
// import EmployeeCard from "../components/EmployeeCard";
// import { getEmployeesRequest } from "../api/employees.api";

function Home() {
  const { tasks, loadTasks } = useTasks();
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    loadTasks();

    // async function loadEmployees() {
    //   const response = await getEmployeesRequest();
    //   setEmployees(response.data);
    // }
    // loadEmployees();
  }, []);

  function renderMain() {
    if (tasks.length === 0)
      return (
        <div
          className="flex flex-col gap-4 justify-center items-center"
          style={{ height: "35vh" }}
        >
          <h1 className="text-2xl text-white">You don't have tasks</h1>
          <Link
            to="/new-task"
            className="bg-blue-700 text-white px-4 py-2 rounded-sm inline-block"
          >
            Create task
          </Link>
        </div>
      );
    return (
      <div className="grid sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 px-2">
        {tasks.map((task) => (
          <TaskCard task={task} key={task.id} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-4xl text-white font-bold uppercase text-center py-10">
        Panel Calidacion 
      </h1>
      {renderMain()}
      <br />
      {employees.map((employee) => (
        <EmployeeCard key={employee.id} employee={employee}/>
      ))}
    </div>
  );
}

export default Home;
