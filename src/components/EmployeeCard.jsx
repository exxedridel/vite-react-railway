import React from "react";

function EmployeeCard({employee}) {
  return (
    <div>
      <h2>{employee.name}</h2>
      <p>{employee.salary}</p>
      <button>Edit</button>
      <button>Delete</button>
    </div>
  );
}

export default EmployeeCard;
