import axios from "axios";

const baseUrl = import.meta.env.VITE_BASE_MIDDLEWARE;
const path = "/api/tasks/";

export const getTasksRequest = async () => await axios.get(baseUrl + path);

export const createTaskRequest = async (task) =>
  await axios.post(baseUrl + path, task);

export const deleteTaskRequest = async (id) =>
  await axios.delete(baseUrl + path + id);

export const getTaskRequest = async (id) =>
  await axios.get(baseUrl + path + id);

export const updateTaskRequest = async (id, updatedTask) =>
  await axios.put(baseUrl + path + id, updatedTask);

export const toggleTaskDoneRequest = async (id, isDone) =>
  await axios.put(baseUrl + path + id, {
    isDone,
  });
