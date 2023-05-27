import axios from "axios";

const TASKS_ENDPOINT =
  "https://mysql-restapi-production-5f4b.up.railway.app/api/tasks/";

export const getTasksRequest = async () => await axios.get(TASKS_ENDPOINT);

export const createTaskRequest = async (task) =>
  await axios.post(TASKS_ENDPOINT, task);

export const deleteTaskRequest = async (id) =>
  await axios.delete(TASKS_ENDPOINT+id);

export const getTaskRequest = async (id) =>
  await axios.get(`http://localhost:4000/tasks/${id}`);

export const updateTaskRequest = async (id, updatedTask) =>
  await axios.put(`http://localhost:4000/tasks/${id}`, updatedTask);

export const toggleTaskDoneRequest = async (id, done) =>
  await axios.put(`http://localhost:4000/tasks/${id}`, {
    done,
  });
