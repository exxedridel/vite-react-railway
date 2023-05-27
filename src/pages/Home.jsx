import { useEffect, useState } from "react";
import { getEmployeesRequest } from "../api/employees.api";
import { getTasksRequest } from "../api/tasks.api";
import EmployeeCard from "../components/EmployeeCard";
import TaskCard from "../components/TaskCard";

function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    async function loadEmployees() {
      const response = await getEmployeesRequest();
      setEmployees(response.data);
    }
    loadEmployees();

    async function loadTasks() {
      const response = await getTasksRequest();
      setTasks(response.data);
    }
    loadTasks();
  }, []);

  return (
    <div>
      <h1>Tasks</h1>
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
      <br />
      <hr />
      <h1>Employees</h1>
      {employees.map((employee) => (
        <EmployeeCard employee={employee} key={employee.id} />
      ))}
    </div>
  );
}

export default EmployeesPage;
