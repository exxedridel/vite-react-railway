import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModeToggle } from "@/components/ui/mode-toggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppContext } from "@/context/AppContext";
import {
  createUser,
  deleteUser,
  listUsers,
  updateUser,
  usersBearerToken,
  UsersApiError,
  type ManagedUser,
  type UserRole,
  type UserWrite,
} from "@/services/users.api";

type UserDraft = UserWrite & { password: string };
type Editor = { mode: "create" } | { mode: "edit"; user: ManagedUser };
const emptyDraft = (): UserDraft => ({
  email: "",
  first_name: "",
  last_name: "",
  password: "",
  role: "player",
});
const roleLabel = (role: UserRole) =>
  role === "admin" ? "Administrador" : "Jugador";
const errorMessage = (error: unknown) =>
  error instanceof UsersApiError
    ? error.message
    : "No se pudo conectar con el servicio de usuarios. Intenta nuevamente.";
const wasAborted = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";

export function validateUserDraft(
  draft: UserDraft,
  creating: boolean,
): string | null {
  const email = draft.email.trim();
  if (!email || email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return "Ingresa un correo válido de hasta 100 caracteres.";
  if (
    [draft.first_name, draft.last_name].some(
      (name) => !name.trim() || name.trim().length > 100,
    )
  )
    return "Nombre y apellidos son obligatorios y admiten hasta 100 caracteres cada uno.";
  if (draft.role !== "admin" && draft.role !== "player")
    return "Selecciona un rol válido.";
  if (creating || draft.password !== "") {
    const bytes = new TextEncoder().encode(draft.password).length;
    if (draft.password.length < 8 || bytes > 72)
      return "La contraseña debe tener al menos 8 caracteres y como máximo 72 bytes UTF-8.";
  }
  return null;
}

export default function UsersPage() {
  const { user, logout, validateToken } = useAppContext();
  const ownId = Number(user?.id);
  const allowed = user?.role === "admin";
  const token = usersBearerToken();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [draft, setDraft] = useState<UserDraft>(emptyDraft);
  const [formError, setFormError] = useState("");
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [saving, setSaving] = useState(false);
  const mounted = useRef(false);
  const busy = useRef(false);
  const listRequest = useRef<AbortController | null>(null);
  const mutationRequest = useRef<AbortController | null>(null);
  const identity = useRef({ ownId, token, allowed });
  identity.current = { ownId, token, allowed };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      listRequest.current?.abort();
      mutationRequest.current?.abort();
    };
  }, []);

  function currentSession(expectedToken: string | null, expectedId: number) {
    return (
      mounted.current &&
      identity.current.allowed &&
      identity.current.ownId === expectedId &&
      identity.current.token === expectedToken &&
      usersBearerToken() === expectedToken
    );
  }

  async function expireSession(
    error: unknown,
    expectedToken: string | null,
    expectedId: number,
  ) {
    if (
      !(error instanceof UsersApiError) ||
      error.status !== 401 ||
      !currentSession(expectedToken, expectedId)
    )
      return false;
    setUsers([]);
    toast.error("Tu sesión terminó. Vuelve a iniciar sesión.");
    await logout(expectedToken);
    return true;
  }

  useEffect(() => {
    mutationRequest.current?.abort();
    busy.current = false;
    setSaving(false);
    setEditor(null);
    setDraft(emptyDraft());
    setDeleting(null);
    setFormError("");
    setDeleteError("");
    setUsers([]);
    setSearch("");
  }, [ownId, token, allowed]);

  useEffect(() => {
    listRequest.current?.abort();
    const request = new AbortController();
    listRequest.current = request;
    if (!allowed) {
      setLoading(false);
      return () => request.abort();
    }
    setLoading(true);
    setLoadError("");
    void listUsers(request.signal)
      .then((nextUsers) => {
        if (currentSession(token, ownId) && !request.signal.aborted)
          setUsers(nextUsers);
      })
      .catch(async (error: unknown) => {
        if (
          request.signal.aborted ||
          wasAborted(error) ||
          !currentSession(token, ownId)
        )
          return;
        if (await expireSession(error, token, ownId)) return;
        setUsers([]);
        setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (currentSession(token, ownId) && !request.signal.aborted)
          setLoading(false);
      });
    return () => request.abort();
  }, [allowed, ownId, token, refresh]);

  function openEditor(target?: ManagedUser) {
    if (busy.current) return;
    setFormError("");
    setEditor(target ? { mode: "edit", user: target } : { mode: "create" });
    setDraft(
      target
        ? {
            email: target.email,
            first_name: target.first_name,
            last_name: target.last_name,
            role: target.role,
            password: "",
          }
        : emptyDraft(),
    );
  }

  function closeEditor() {
    if (busy.current) return;
    setEditor(null);
    setDraft(emptyDraft());
    setFormError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || busy.current || !allowed) return;
    const validation = validateUserDraft(draft, editor.mode === "create");
    if (validation) {
      setFormError(validation);
      return;
    }
    const editingSelf = editor.mode === "edit" && editor.user.id === ownId;
    if (editingSelf && draft.role !== user.role) {
      setFormError("No puedes cambiar el rol de tu propia cuenta.");
      return;
    }
    const payload: UserDraft = {
      email: draft.email.trim().toLowerCase(),
      first_name: draft.first_name.trim(),
      last_name: draft.last_name.trim(),
      role: draft.role,
      password: draft.password,
    };
    const credentialsChanged =
      editingSelf &&
      (payload.email !== String(user.email).trim().toLowerCase() ||
        payload.password !== "");
    const request = new AbortController();
    mutationRequest.current = request;
    busy.current = true;
    setSaving(true);
    setFormError("");
    try {
      const saved =
        editor.mode === "create"
          ? await createUser(payload, request.signal)
          : await updateUser(editor.user.id, payload, request.signal);
      if (!currentSession(token, ownId) || request.signal.aborted) return;
      setUsers((current) =>
        [...current.filter((item) => item.id !== saved.id), saved].sort(
          (a, b) => a.id - b.id,
        ),
      );
      setEditor(null);
      setDraft(emptyDraft());
      if (credentialsChanged) {
        toast.success(
          "Cuenta actualizada. Inicia sesión con tus nuevos datos.",
          { duration: 7000 },
        );
        await logout(token);
      } else {
        toast.success(
          editor.mode === "create" ? "Usuario creado." : "Usuario actualizado.",
        );
        if (editingSelf && token) await validateToken(token);
      }
    } catch (error) {
      if (
        request.signal.aborted ||
        wasAborted(error) ||
        !currentSession(token, ownId)
      )
        return;
      if (await expireSession(error, token, ownId)) return;
      setFormError(errorMessage(error));
    } finally {
      if (mutationRequest.current === request) {
        busy.current = false;
        if (mounted.current) setSaving(false);
      }
    }
  }

  async function remove() {
    if (!deleting || deleting.id === ownId || busy.current || !allowed) return;
    const request = new AbortController();
    mutationRequest.current = request;
    busy.current = true;
    setSaving(true);
    setDeleteError("");
    try {
      await deleteUser(deleting.id, request.signal);
      if (!currentSession(token, ownId) || request.signal.aborted) return;
      setUsers((current) => current.filter((item) => item.id !== deleting.id));
      setDeleting(null);
      toast.success("Usuario eliminado.");
    } catch (error) {
      if (
        request.signal.aborted ||
        wasAborted(error) ||
        !currentSession(token, ownId)
      )
        return;
      if (await expireSession(error, token, ownId)) return;
      setDeleteError(errorMessage(error));
    } finally {
      if (mutationRequest.current === request) {
        busy.current = false;
        if (mounted.current) setSaving(false);
      }
    }
  }

  const query = search.trim().toLowerCase();
  const visibleUsers = users.filter((item) =>
    `${item.email} ${item.first_name} ${item.last_name} ${roleLabel(item.role)}`
      .toLowerCase()
      .includes(query),
  );
  const editingSelf = editor?.mode === "edit" && editor.user.id === ownId;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-3">
          <Users className="h-7 w-7 text-brand" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-bold">Usuarios</h1>
            <p className="text-sm text-muted-foreground">
              Gestiona las cuentas y sus permisos.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver
            </Link>
          </Button>
          <ModeToggle />
          <Button asChild variant="outline" size="icon">
            <Link to="/logout" aria-label="Cerrar sesión">
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </header>

      {!allowed ? (
        <p role="alert" className="rounded-xl border p-4 text-sm">
          Solo las cuentas con rol administrador pueden gestionar usuarios.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full sm:max-w-sm">
              <Search
                className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                aria-label="Buscar usuarios"
                placeholder="Buscar por nombre, correo o rol"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={loading || saving}
                className="gap-2"
                onClick={() => setRefresh((value) => value + 1)}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Actualizar
              </Button>
              <Button
                type="button"
                disabled={loading || saving}
                className="gap-2"
                onClick={() => openEditor()}
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Crear usuario
              </Button>
            </div>
          </div>
          {loadError && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 p-4 text-sm"
            >
              <p className="text-destructive">{loadError}</p>
              <Button
                type="button"
                variant="outline"
                disabled={loading || saving}
                onClick={() => setRefresh((value) => value + 1)}
              >
                Reintentar
              </Button>
            </div>
          )}
          {loading ? (
            <p
              role="status"
              className="py-10 text-center text-sm text-muted-foreground"
            >
              Cargando usuarios…
            </p>
          ) : (
            !loadError && (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <caption className="sr-only">
                    Cuentas de usuario y acciones de administración
                  </caption>
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <th scope="col" className="p-4">
                        Nombre
                      </th>
                      <th scope="col" className="p-4">
                        Correo
                      </th>
                      <th scope="col" className="p-4">
                        Rol
                      </th>
                      <th scope="col" className="p-4 text-right">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleUsers.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="p-4">
                          <span className="break-words font-medium">
                            {item.first_name} {item.last_name}
                          </span>
                          {item.id === ownId && (
                            <span className="ml-2 whitespace-nowrap text-xs text-muted-foreground">
                              Tu cuenta
                            </span>
                          )}
                        </td>
                        <td className="break-all p-4">{item.email}</td>
                        <td className="p-4">{roleLabel(item.role)}</td>
                        <td className="p-4">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={saving}
                              aria-label={`Editar ${item.email}`}
                              onClick={() => openEditor(item)}
                            >
                              <Pencil
                                className="mr-1 h-4 w-4"
                                aria-hidden="true"
                              />{" "}
                              Editar
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={saving || item.id === ownId}
                              title={
                                item.id === ownId
                                  ? "No puedes eliminar tu propia cuenta"
                                  : undefined
                              }
                              aria-label={`Eliminar ${item.email}`}
                              onClick={() => {
                                setDeleteError("");
                                setDeleting(item);
                              }}
                            >
                              <Trash2
                                className="h-4 w-4 text-destructive"
                                aria-hidden="true"
                              />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {visibleUsers.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="p-8 text-center text-muted-foreground"
                        >
                          {users.length
                            ? "No hay usuarios que coincidan con la búsqueda."
                            : "No hay usuarios para mostrar."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )
          )}
          {!loading && !loadError && (
            <p className="text-xs text-muted-foreground">
              {visibleUsers.length} de {users.length} usuarios
            </p>
          )}
        </>
      )}

      <Dialog
        open={allowed && editor !== null}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editor?.mode === "create" ? "Crear usuario" : "Editar usuario"}
            </DialogTitle>
            <DialogDescription>
              {editor?.mode === "create"
                ? "La nueva cuenta podrá iniciar sesión con estos datos."
                : "Actualiza los datos de la cuenta. Deja la contraseña vacía para conservarla."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <fieldset disabled={saving} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="user-email">Correo</Label>
                <Input
                  id="user-email"
                  type="email"
                  required
                  maxLength={100}
                  autoComplete="off"
                  value={draft.email}
                  onChange={(event) =>
                    setDraft({ ...draft, email: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="user-first-name">Nombre</Label>
                  <Input
                    id="user-first-name"
                    required
                    maxLength={100}
                    autoComplete="off"
                    value={draft.first_name}
                    onChange={(event) =>
                      setDraft({ ...draft, first_name: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user-last-name">Apellidos</Label>
                  <Input
                    id="user-last-name"
                    required
                    maxLength={100}
                    autoComplete="off"
                    value={draft.last_name}
                    onChange={(event) =>
                      setDraft({ ...draft, last_name: event.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-role">Rol</Label>
                <select
                  id="user-role"
                  disabled={editingSelf || saving}
                  value={draft.role}
                  onChange={(event) =>
                    setDraft({ ...draft, role: event.target.value as UserRole })
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value="player">Jugador</option>
                  <option value="admin">Administrador</option>
                </select>
                {editingSelf && (
                  <p className="text-xs text-muted-foreground">
                    No puedes cambiar tu propio rol.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-password">
                  {editor?.mode === "edit"
                    ? "Nueva contraseña (opcional)"
                    : "Contraseña"}
                </Label>
                <Input
                  id="user-password"
                  type="password"
                  required={editor?.mode === "create"}
                  maxLength={72}
                  autoComplete="new-password"
                  value={draft.password}
                  onChange={(event) =>
                    setDraft({ ...draft, password: event.target.value })
                  }
                  aria-describedby="user-password-help"
                />
                <p
                  id="user-password-help"
                  className="text-xs text-muted-foreground"
                >
                  Al menos 8 caracteres y hasta 72 bytes UTF-8. Los acentos y
                  emojis pueden ocupar varios bytes.
                </p>
              </div>
              {editingSelf && (
                <p className="text-sm text-muted-foreground">
                  Si cambias tu correo o contraseña, tendrás que volver a
                  iniciar sesión.
                </p>
              )}
            </fieldset>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={closeEditor}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving
                  ? "Guardando…"
                  : editor?.mode === "create"
                    ? "Crear usuario"
                    : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={allowed && deleting !== null}
        onOpenChange={(open) => {
          if (!open && !busy.current) {
            setDeleting(null);
            setDeleteError("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar usuario</DialogTitle>
            <DialogDescription>
              Se eliminará la cuenta {deleting?.email}. Esta acción no se puede
              deshacer y sus sesiones dejarán de ser válidas.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setDeleting(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={saving || deleting?.id === ownId}
              onClick={() => void remove()}
            >
              {saving ? "Eliminando…" : "Eliminar usuario"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
