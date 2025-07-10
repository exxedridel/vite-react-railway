import axios from "axios";

const baseUrl = import.meta.env.VITE_BASE_MIDDLEWARE;
const path = "api/v1/auth";

export const loginRequest = async (credentials) =>
  await axios.post(baseUrl + path + "login", credentials);

export const logoutRequest = async (config) =>
  await axios.post(baseUrl + path + "logout", null, config);
