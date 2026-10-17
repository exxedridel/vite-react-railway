export const SHOP_ADMIN_EMAIL = "najerad2223@gmail.com";
export const ADMIN_SHOP_STORAGE_KEY = `pokemon-admin-shop:v1:${SHOP_ADMIN_EMAIL}`;
export const isShopAdmin = (email: unknown): boolean =>
  typeof email === "string" && email.trim().toLowerCase() === SHOP_ADMIN_EMAIL;

export const PLAYER_COLORS = [
  { id: "pink", name: "Rosa", hsl: "347 77% 50%", foreground: "0 0% 98%" },
  {
    id: "yellow",
    name: "Amarillo",
    hsl: "46 82% 47.5%",
    foreground: "0 0% 0%",
  },
  {
    id: "cyan",
    name: "Azul",
    hsl: "191.45 100% 29.8%",
    foreground: "0 0% 98%",
  },
  { id: "coral", name: "Coral", hsl: "16 100% 66%", foreground: "0 0% 98%" },
  { id: "purple", name: "Morado", hsl: "271 76% 53%", foreground: "0 0% 98%" },
  { id: "default", name: "Default", hsl: "", foreground: "" },
  { id: "green", name: "Verde", hsl: "160 100% 19%", foreground: "0 0% 98%" },
  {
    id: "yellowgreen",
    name: "Verde lima",
    hsl: "72 65% 63%",
    foreground: "0 0% 0%",
  },
] as const;
export type PlayerColorId = (typeof PLAYER_COLORS)[number]["id"];
export type ShopPlayer = {
  id: string;
  nickname: string;
  colorId: PlayerColorId;
  money: number;
};
export type AdminShopSession = { version: 1; players: ShopPlayer[] };
export type MoneyOperation = "add" | "subtract";
export function calculatePlayerBalance(
  balance: number,
  amount: number,
  operation: MoneyOperation,
): number | null {
  if (
    !Number.isSafeInteger(balance) ||
    balance < 0 ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    (operation !== "add" && operation !== "subtract")
  )
    return null;
  const next = operation === "add" ? balance + amount : balance - amount;
  return Number.isSafeInteger(next) && next >= 0 ? next : null;
}
export function changePlayerMoney(
  session: AdminShopSession,
  id: string,
  amount: number,
  operation: MoneyOperation,
): AdminShopSession | null {
  const player = session.players.find((p) => p.id === id);
  if (!player) return null;
  const money = calculatePlayerBalance(player.money, amount, operation);
  if (money === null) return null;
  return {
    ...session,
    players: session.players.map((p) => (p.id === id ? { ...p, money } : p)),
  };
}
export function assignPlayerColor(
  players: ShopPlayer[],
  id: string,
  colorId: PlayerColorId,
): ShopPlayer[] {
  const player = players.find((p) => p.id === id);
  if (!player || !PLAYER_COLORS.some((c) => c.id === colorId)) return players;
  return players.map((p) =>
    p.id === id
      ? { ...p, colorId }
      : p.colorId === colorId
        ? { ...p, colorId: player.colorId }
        : p,
  );
}

export const SHOP_ITEMS = [
  {
    id: "poke-ball",
    name: "Poké Ball",
    price: 150,
    image: "/admin-shop/poke-ball.png",
  },
  {
    id: "great-ball",
    name: "Great Ball",
    price: 300,
    image: "/admin-shop/great-ball.png",
  },
  {
    id: "ultra-ball",
    name: "Ultra Ball",
    price: 450,
    image: "/admin-shop/ultra-ball.png",
  },
  {
    id: "full-restore",
    name: "Full Restore",
    price: 350,
    image: "/admin-shop/full-restore.png",
  },
  { id: "tm", name: "TM", price: 500, image: "/admin-shop/tm-normal.png" },
  {
    id: "bicycle",
    name: "Bicycle",
    price: 1200,
    image: "/admin-shop/bicycle.png",
  },
] as const;

export const formatShopMoney = (value: number) =>
  new Intl.NumberFormat("es-MX").format(value);
export function parsePlayerMoney(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const amount = Number(value.trim());
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}
export function parsePlayerCount(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= PLAYER_COLORS.length
    ? count
    : null;
}
export function validAdminSession(value: unknown): value is AdminShopSession {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<AdminShopSession>;
  if (
    s.version !== 1 ||
    !Array.isArray(s.players) ||
    s.players.length < 1 ||
    s.players.length > PLAYER_COLORS.length
  )
    return false;
  if (
    !s.players.every(
      (p) =>
        p &&
        typeof p.id === "string" &&
        p.id.length > 0 &&
        typeof p.nickname === "string" &&
        p.nickname.trim().length > 0 &&
        p.nickname.length <= 30 &&
        PLAYER_COLORS.some((color) => color.id === p.colorId) &&
        Number.isSafeInteger(p.money) &&
        p.money >= 0,
    )
  )
    return false;
  return (
    new Set(s.players.map((p) => p.id)).size === s.players.length &&
    new Set(s.players.map((p) => p.nickname.trim().toLowerCase())).size ===
      s.players.length &&
    new Set(s.players.map((p) => p.colorId)).size === s.players.length
  );
}
export function readAdminSession(
  storage: Pick<Storage, "getItem">,
): AdminShopSession | null {
  const raw = storage.getItem(ADMIN_SHOP_STORAGE_KEY);
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!validAdminSession(value))
    throw new Error("Configuración de tienda inválida.");
  return value;
}
export function writeAdminSession(
  storage: Pick<Storage, "setItem">,
  session: AdminShopSession,
): void {
  if (!validAdminSession(session))
    throw new Error("Revisa los jugadores y sus saldos.");
  storage.setItem(ADMIN_SHOP_STORAGE_KEY, JSON.stringify(session));
}
