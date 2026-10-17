export const KANTO_BADGES = [
  {
    id: "boulder",
    name: "Boulder Badge",
    leader: "Brock",
    sprite: "/badges/kanto/1.png",
  },
  {
    id: "cascade",
    name: "Cascade Badge",
    leader: "Misty",
    sprite: "/badges/kanto/2.png",
  },
  {
    id: "thunder",
    name: "Thunder Badge",
    leader: "Lt. Surge",
    sprite: "/badges/kanto/3.png",
  },
  {
    id: "rainbow",
    name: "Rainbow Badge",
    leader: "Erika",
    sprite: "/badges/kanto/4.png",
  },
  {
    id: "soul",
    name: "Soul Badge",
    leader: "Koga",
    sprite: "/badges/kanto/5.png",
  },
  {
    id: "marsh",
    name: "Marsh Badge",
    leader: "Sabrina",
    sprite: "/badges/kanto/6.png",
  },
  {
    id: "volcano",
    name: "Volcano Badge",
    leader: "Blaine",
    sprite: "/badges/kanto/7.png",
  },
  {
    id: "earth",
    name: "Earth Badge",
    leader: "Giovanni",
    sprite: "/badges/kanto/8.png",
  },
] as const;

export type GymBadgeId = (typeof KANTO_BADGES)[number]["id"];
export type TrainerBag = { money: number; badges: GymBadgeId[] };
export type MoneyDirection = "add" | "subtract";
export const emptyTrainerBag = (): TrainerBag => ({ money: 0, badges: [] });
export const formatBagMoney = (amount: number) =>
  new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(amount);

export function parseMoneyAmount(input: string): number | null {
  if (!/^\d+$/.test(input.trim())) return null;
  const value = Number(input.trim());
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function moneyAfterChange(
  balance: number,
  amount: number,
  direction: MoneyDirection,
): number | null {
  if (
    !Number.isSafeInteger(balance) ||
    balance < 0 ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    (direction !== "add" && direction !== "subtract")
  )
    return null;
  const result = direction === "add" ? balance + amount : balance - amount;
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}
