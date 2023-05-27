import { deleteTaskRequest } from "../api/tasks.api";

const deleteTask = async (id) => {
  try {
    await deleteTaskRequest(id);
    // setTasks(tasks.filter((task) => task.id !== id));
  } catch (error) {
    console.error(error);
  }
};

function TaskCard({ task }) {
  return (
    <div>
      <h2>{task.title}</h2>
      <p>{task.description}</p>
      <span>{task.isDone === 1 ? "Completed" : "Not completed"}</span>
      <span>{task.createdAt}</span>
      <button>Edit</button>
      <button className="text-lg" onClick={() => deleteTask(task.id)}>
        ☒
      </button>
    </div>
  );
}

export default TaskCard;
