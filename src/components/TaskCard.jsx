import React from "react";

function TaskCard({ task }) {
  return (
    <div>
      <h2>{task.title}</h2>
      <p>{task.description}</p>
      <span>{task.isDone === 1 ? "Completed" : "Not completed"}</span>
      <span>{task.createdAt}</span>
      <button>Edit</button>
      <button>Delete</button>
    </div>
  );
}

export default TaskCard;
