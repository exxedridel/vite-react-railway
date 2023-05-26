import axios from "axios";

export const getEmployeesRequest = async (employee) =>
  await axios.get(
    "https://mysql-restapi-production-5f4b.up.railway.app/api/employees"
  );

export const createEmployeeRequest = async (employee) =>
  await axios.post(
    "https://mysql-restapi-production-5f4b.up.railway.app/api/employees",
    employee
  );
