export type UserRole = "player" | "admin";
export type ManagedUser = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
};
export type UserWrite = Omit<ManagedUser, "id"> & { password?: string };
export type UserCreate = UserWrite & { password: string };

export class UsersApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "UsersApiError";
  }
}

export function usersBearerToken(): string | null {
  try {
    return localStorage.getItem("bearer_token");
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readUser(value: unknown): ManagedUser {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.id) ||
    (value.id as number) <= 0 ||
    !["email", "first_name", "last_name"].every(
      (field) => typeof value[field] === "string",
    ) ||
    (value.role !== "player" && value.role !== "admin")
  )
    throw new UsersApiError(502, "El servicio devolvió un usuario no válido.");
  // Keep only public fields, even if a server response unexpectedly contains more.
  return {
    id: value.id as number,
    email: value.email as string,
    first_name: value.first_name as string,
    last_name: value.last_name as string,
    role: value.role,
  };
}

function userPath(id?: number): string {
  const base = import.meta.env.VITE_BASE_MIDDLEWARE?.trim().replace(/\/+$/, "");
  if (!base)
    throw new UsersApiError(
      0,
      "Configura la dirección del servicio de autenticación.",
    );
  if (id !== undefined && (!Number.isSafeInteger(id) || id <= 0))
    throw new UsersApiError(400, "El identificador del usuario no es válido.");
  return `${base}/api/users${id === undefined ? "" : `/${id}`}`;
}

async function request(
  method: "GET" | "POST" | "PUT" | "DELETE",
  id?: number,
  body?: UserWrite,
  signal?: AbortSignal,
): Promise<unknown> {
  const token = usersBearerToken();
  if (!token)
    throw new UsersApiError(
      401,
      "Tu sesión terminó. Inicia sesión nuevamente.",
    );
  const response = await fetch(userPath(id), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal,
    cache: "no-store",
  });
  const data: unknown =
    response.status === 204
      ? undefined
      : await response.json().catch(() => undefined);
  // Never apply a response belonging to an account that has since signed out.
  if (signal?.aborted || usersBearerToken() !== token)
    throw new DOMException(
      "La sesión cambió durante la solicitud.",
      "AbortError",
    );
  if (!response.ok) {
    const message =
      isRecord(data) && typeof data.message === "string"
        ? data.message
        : "No se pudo completar la solicitud de usuarios.";
    throw new UsersApiError(response.status, message);
  }
  return data;
}

function writeBody(value: UserWrite): UserWrite {
  return {
    email: value.email.trim().toLowerCase(),
    first_name: value.first_name.trim(),
    last_name: value.last_name.trim(),
    role: value.role,
    ...(value.password !== undefined && value.password !== ""
      ? { password: value.password }
      : {}),
  };
}

export async function listUsers(signal?: AbortSignal): Promise<ManagedUser[]> {
  const data = await request("GET", undefined, undefined, signal);
  if (!isRecord(data) || !Array.isArray(data.users))
    throw new UsersApiError(
      502,
      "El servicio devolvió una lista de usuarios no válida.",
    );
  return data.users.map(readUser);
}

export async function getUser(
  id: number,
  signal?: AbortSignal,
): Promise<ManagedUser> {
  const data = await request("GET", id, undefined, signal);
  return readUser(isRecord(data) ? data.user : undefined);
}

export async function createUser(
  value: UserCreate,
  signal?: AbortSignal,
): Promise<ManagedUser> {
  const data = await request("POST", undefined, writeBody(value), signal);
  return readUser(isRecord(data) ? data.user : undefined);
}

export async function updateUser(
  id: number,
  value: UserWrite,
  signal?: AbortSignal,
): Promise<ManagedUser> {
  const data = await request("PUT", id, writeBody(value), signal);
  return readUser(isRecord(data) ? data.user : undefined);
}

export async function deleteUser(
  id: number,
  signal?: AbortSignal,
): Promise<void> {
  await request("DELETE", id, undefined, signal);
}
