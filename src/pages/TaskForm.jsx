import { useEffect, useState } from "react";
import { useTasks } from "../context/TasksContext";
import { useParams, useNavigate } from "react-router-dom";
import { Form, Formik } from "formik";

function TaskForm() {
  const { createTask, getTask, updateTask } = useTasks();
  const [task, setTask] = useState({
    title: "",
    description: "",
  });
  const params = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    async function loadTask() {
      if (params.id) {
        const loadedTask = await getTask(params.id);
        setTask({
          title: loadedTask.title,
          description: loadedTask.description,
        });
      }
    }
    loadTask();
  }, []);

  return (
    <div>
      <h1 className="text-3xl text-white font-bold uppercase text-center py-10">
        {params.id ? "Edit task" : "Create new task"}
      </h1>

      <Formik
        initialValues={task}
        enableReinitialize={true}
        onSubmit={async (values, actions) => {
          console.log(values);

          if (params.id) {
            await updateTask(params.id, values);
          } else {
            await createTask(values);
            actions.resetForm();
          }
          navigate("/");
        }}
      >
        {({ handleChange, handleSubmit, values, isSubmitting }) => (
          <Form
            onSubmit={handleSubmit}
            className="mx-auto mb-10 bg-slate-300 max-w-sm rounded-md p-4"
          >
            <label htmlFor="title" className="block">
              Title
            </label>
            <input
              className="px-2 py-1 rounded-sm w-full"
              type="text"
              name="title"
              id="title"
              placeholder="Write a title"
              onChange={handleChange}
              value={values.title}
            />

            <label htmlFor="description" className="block">
              Description
            </label>
            <textarea
              className="px-2 py-1 rounded-sm w-full"
              name="description"
              id="description"
              rows="3"
              placeholder="Write a description"
              onChange={handleChange}
              value={values.description}
            />
            <div className="w-full flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="block bg-indigo-800 px-7 py-2 text-white rounded-sm"
              >
                {isSubmitting ? "Saving..." : "Save"}
              </button>
            </div>
          </Form>
        )}
      </Formik>
    </div>
  );
}

export default TaskForm;
