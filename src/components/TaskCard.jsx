import { useTasks } from "../context/TasksContext";
import { useNavigate } from "react-router-dom";

function TaskCard({ task }) {
  const { deleteTask, toggleTaskDone } = useTasks();
  const navigate = useNavigate();

  const toggleDone = async () => {
    await toggleTaskDone(task.id);
  };

  return (
    <div className="bg-slate-300 rounded-md p-4">
      <header className="flex justify-between">
        <div className="flex gap-1 items-center">
          <button className="" onClick={() => toggleDone()}>
            {task.isDone == 1 ? "🟢" : "⭕"}
          </button>
          <h2 className="text-sm font-bold">{task.title}</h2>
        </div>
        <button className="text-lg" onClick={() => deleteTask(task.id)}>
          ☒
        </button>
      </header>

      <p className="text-sm">{task.description}</p>
      <p className="w-full text-center text-xs py-3">
        Created at {task.createdAt.substring(0, 10)} ⊙
        {task.createdAt.substring(11, 16)}
      </p>

      <div className="flex justify-end">
        <button
          className="bg-indigo-800 px-7 py-2 text-white rounded-sm"
          onClick={() => navigate(`/edit/${task.id}`)}
        >
          Edit
        </button>
      </div>
    </div>
  );
}

export default TaskCard;
