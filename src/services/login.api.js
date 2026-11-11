import axios from "axios";

function authUrl(path) {
  const baseUrl = import.meta.env.VITE_BASE_MIDDLEWARE?.trim().replace(
    /\/+$/,
    "",
  );
  if (!baseUrl)
    throw new Error(
      "Configura VITE_BASE_MIDDLEWARE con la dirección de MySQL.",
    );
  return `${baseUrl}/api/${path}`;
}

export const loginReq = async (credentials) =>
  await axios.post(authUrl("login"), credentials, { timeout: 10000 });

export const profileReq = async (token, signal) =>
  await axios.get(authUrl("auth/me"), {
    headers: { Authorization: `Bearer ${token}` },
    signal,
    timeout: 10000,
  });

export const logoutReq = async (token) =>
  await axios.post(authUrl("logout"), null, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 5000,
  });
