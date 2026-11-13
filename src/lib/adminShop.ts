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
export type PlayerColorPreferences = Record<string, PlayerColorId>;

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
  {
    id: "max-ether",
    name: "Max Ether",
    price: 350,
    image: "/admin-shop/max-ether.png",
  },
  {
    id: "max-elixir",
    name: "Max Elixir",
    price: 700,
    image: "/admin-shop/max-elixir.png",
  },
  { id: "tm", name: "TM", price: 500, image: "/admin-shop/tm-normal.png" },
  {
    id: "bicycle",
    name: "Bicycle",
    price: 1200,
    image: "/admin-shop/bicycle.png",
  },
] as const;
export type ShopCatalogItem = {
  id: (typeof SHOP_ITEMS)[number]["id"];
  name: string;
  price: number;
  image: string;
};
export const MAX_SHOP_QUANTITY = 99;
export const formatShopMoney = (value: number) =>
  new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(value);

/** Display-only quote. The server independently validates price and funds. */
export function maximumShopQuantity(
  balance: number,
  unitPrice: number,
): number {
  if (
    !Number.isSafeInteger(balance) ||
    balance < 0 ||
    !Number.isSafeInteger(unitPrice) ||
    unitPrice < 0
  )
    return 0;
  return unitPrice === 0
    ? MAX_SHOP_QUANTITY
    : Math.min(MAX_SHOP_QUANTITY, Math.floor(balance / unitPrice));
}
export function quoteShopPurchase(
  balance: number,
  unitPrice: number,
  quantity: number,
): { total: number; remaining: number } | null {
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > maximumShopQuantity(balance, unitPrice)
  )
    return null;
  const total = unitPrice * quantity;
  return Number.isSafeInteger(total)
    ? { total, remaining: balance - total }
    : null;
}
export function parseShopQuantity(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) &&
    quantity >= 1 &&
    quantity <= MAX_SHOP_QUANTITY
    ? quantity
    : null;
}

function colorStorageKey(adminId: number): string {
  if (!Number.isSafeInteger(adminId) || adminId <= 0)
    throw new Error("Administrador no válido.");
  return `pokemon-admin-shop-colors:v2:${adminId}`;
}
export function isPlayerColorId(value: unknown): value is PlayerColorId {
  return (
    typeof value === "string" &&
    PLAYER_COLORS.some((color) => color.id === value)
  );
}
export function readShopColors(
  storage: Pick<Storage, "getItem">,
  adminId: number,
): PlayerColorPreferences {
  const raw = storage.getItem(colorStorageKey(adminId));
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed).filter(
      ([key, value]) => /^[1-9]\d*$/.test(key) && isPlayerColorId(value),
    ),
  ) as PlayerColorPreferences;
}
export function writeShopColors(
  storage: Pick<Storage, "setItem">,
  adminId: number,
  colors: PlayerColorPreferences,
): void {
  const safe = Object.fromEntries(
    Object.entries(colors).filter(
      ([key, value]) => /^[1-9]\d*$/.test(key) && isPlayerColorId(value),
    ),
  );
  storage.setItem(colorStorageKey(adminId), JSON.stringify(safe));
}
export function shopPlayerColor(
  colors: PlayerColorPreferences,
  playerId: number,
): PlayerColorId {
  return (
    colors[String(playerId)] ??
    PLAYER_COLORS[Math.abs(playerId - 1) % PLAYER_COLORS.length].id
  );
}
