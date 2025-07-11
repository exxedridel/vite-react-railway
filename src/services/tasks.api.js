import axios from "axios";

const baseUrl = import.meta.env.VITE_BASE_MIDDLEWARE;
const path = "/api/tasks/";

const getAuthorizationHeader = () => {
  const bearerToken = localStorage.getItem('bearer_token');
  return { Authorization: `Bearer ${bearerToken}` };
};

const axiosConfig = {
  headers: getAuthorizationHeader(),
};

export const getTasksReq = async () => await axios.get(baseUrl + path, axiosConfig);
