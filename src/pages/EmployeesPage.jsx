import { useEffect, useState } from "react";
import { getEmployeesRequest } from "../api/tasks.api";
import EmployeeCard from "../components/EmployeeCard";

function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  useEffect(() => {
    async function loadEmployees() {
      const response = await getEmployeesRequest();
      setEmployees(response.data);
    }
    loadEmployees();
  }, []);

  return (
    <div>
      <h1>Employees</h1>
      {employees.map((employee) => (
        <EmployeeCard employee={employee} key={employee.id} />
      ))}
    </div>
  );
}

export default EmployeesPage;
