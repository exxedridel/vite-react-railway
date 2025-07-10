import axios from "axios";

const baseUrl = import.meta.env.VITE_BASE_MIDDLEWARE;
const path = "/api/";

export const loginReq = async (credentials) =>
  await axios.post(baseUrl + path + "login", credentials);

export const logoutReq = async (config) =>
  await axios.post(baseUrl + path + "logout", null, config);
