import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  LogOut,
  User,
  Mail,
  ChevronDown,
  Pencil,
  Trash2,
  History,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppContext } from "@/context/AppContext";
import { useAppDispatch } from "@/store/hooks";
import { resetGame } from "@/slices/partySlice";
import FloatingActivityHistory from "@/components/pokemon/FloatingActivityHistory";

const NICKNAME_STORAGE_KEY = "trainer_nickname";
const getStoredNickname = (): string => {
  try {
    return localStorage.getItem(NICKNAME_STORAGE_KEY)?.trim() || "";
  } catch {
    return "";
  }
};
type ActiveDialog = "nickname" | "reset" | null;

export default function DropdownUser() {
  const { user, navigate, setPokemonDialogOpen } = useAppContext();
  const dispatch = useAppDispatch();
  const [nickname, setNickname] = useState(getStoredNickname);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const openingDialogRef = useRef(false);
  const resetSubmittedRef = useRef(false);
  const backendFullName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "N/A";
  const buttonName = nickname || user?.first_name || "N/A";
  const profileName = nickname || backendFullName;

  const openDialog = (dialog: Exclude<ActiveDialog, null>) => {
    openingDialogRef.current = true;
    if (dialog === "nickname") setNicknameDraft(nickname);
    if (dialog === "reset") resetSubmittedRef.current = false;
    setMenuOpen(false);
    setActiveDialog(dialog);
  };
  const closeDialog = () => {
    openingDialogRef.current = false;
    setActiveDialog(null);
  };
  const handleSaveNickname = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = nicknameDraft.trim();
    if (!value) {
      toast.error("Escribe un nickname.");
      return;
    }
    if (value.length > 30) {
      toast.error("El nickname debe tener máximo 30 caracteres.");
      return;
    }
    try {
      localStorage.setItem(NICKNAME_STORAGE_KEY, value);
      setNickname(value);
      closeDialog();
      toast.success("Nickname guardado.");
    } catch {
      toast.error("No se pudo guardar el nickname en este navegador.");
    }
  };
  const handleRemoveNickname = () => {
    try {
      localStorage.removeItem(NICKNAME_STORAGE_KEY);
      setNickname("");
      setNicknameDraft("");
      closeDialog();
      toast.success("Nickname eliminado.");
    } catch {
      toast.error("No se pudo eliminar el nickname.");
    }
  };
  const handleResetGame = () => {
    if (resetSubmittedRef.current) return;
    resetSubmittedRef.current = true;
    setPokemonDialogOpen(false);
    dispatch(resetGame());
    closeDialog();
    navigate("/dashboard");
    toast.success("Partida reiniciada.", {
      description:
        "Ya puedes elegir un nuevo Pokémon inicial. El reinicio quedó en el historial.",
    });
  };

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            ref={menuTriggerRef}
            variant="outline"
            className="flex flex-row items-center border-brand"
          >
            <img
              src="/pkmn-trainer.webp"
              alt=""
              className="w-11 h-11 -ml-3 mb-1 -mr-1.5"
            />
            <span className="mr-1 max-w-[140px] truncate">{buttonName}</span>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-64 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto p-3"
          onCloseAutoFocus={(event) => {
            if (openingDialogRef.current) event.preventDefault();
          }}
        >
          <DropdownMenuLabel className="select-none">
            Pokémon Master Trainer
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <div className="flex flex-col gap-1 text-sm">
              <div className="flex flex-row items-center">
                <User className="ml-2 mr-2 h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">{profileName}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => openDialog("nickname")}
                  aria-label={nickname ? "Editar nickname" : "Agregar nickname"}
                  className="ml-1 h-8 w-8 shrink-0"
                >
                  <Pencil className="h-3.5 w-3.5 text-brand" />
                </Button>
              </div>
              <div className="flex flex-row items-center text-primary/60">
                <Mail className="ml-2 mr-2 h-4 w-4 shrink-0" />
                <span className="min-w-0 break-all">
                  {user?.email || "N/A"}
                </span>
              </div>
            </div>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              openingDialogRef.current = false;
              setMenuOpen(false);
              setHistoryVisible(true);
            }}
          >
            <History className="mr-2 h-4 w-4" />
            <span>Historial de actividad</span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <img
              src="/ditto.png"
              alt=""
              className="h-[16.1px] w-[16.1px] mr-2"
            />
            <span>Simular poké-enemigo</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => openDialog("reset")}>
            <RotateCcw className="mr-2 h-4 w-4" />
            <span>Reiniciar juego</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/logout">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Cerrar sesión</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={activeDialog === "nickname"}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[425px]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            menuTriggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {nickname ? "Editar nickname" : "Agregar nickname"}
            </DialogTitle>
            <DialogDescription>
              Elige el nombre de tu entrenador para este navegador. Si lo
              eliminas, aparecerá el nombre de tu cuenta.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveNickname}>
            <div className="space-y-3 py-4">
              <label htmlFor="trainer-nickname" className="text-sm font-medium">
                Nickname
              </label>
              <Input
                id="trainer-nickname"
                value={nicknameDraft}
                onChange={(event) => setNicknameDraft(event.target.value)}
                placeholder="Tu nombre de entrenador"
                autoComplete="off"
                maxLength={30}
                aria-describedby="nickname-length"
              />
              <p id="nickname-length" className="text-xs text-muted-foreground">
                Máximo 30 caracteres.
              </p>
            </div>
            <DialogFooter className="gap-2">
              {nickname && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRemoveNickname}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar
                </Button>
              )}
              <Button type="submit" disabled={!nicknameDraft.trim()}>
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeDialog === "reset"}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[425px]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            menuTriggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>¿Reiniciar el juego?</DialogTitle>
            <DialogDescription>
              Se eliminará todo tu equipo, incluido el inicial, con sus niveles,
              movimientos y estados. También se quitará al oponente guardado.
              Podrás elegir un nuevo Pokémon inicial. Esta acción no se puede
              deshacer. El historial de las últimas 10 acciones se conserva y
              registrará este reinicio.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleResetGame}
            >
              Sí, reiniciar juego
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {historyVisible && (
        <FloatingActivityHistory onClose={() => setHistoryVisible(false)} />
      )}
    </>
  );
}
