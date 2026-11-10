import type { PartyState } from "@/slices/partySlice";

export const LEGACY_PARTY_KEY = "persist:root";
export const LEGACY_PARTY_BACKUP_KEY = "pokemon-legacy-party-backup:v1";
export const LEGACY_PARTY_OWNER_KEY = "pokemon-legacy-party-owner:v1";
export const LEGACY_PARTY_RESERVATION_KEY =
  "pokemon-legacy-party-reservation:v1";
export const LEGACY_NICKNAME_KEY = "trainer_nickname";
export const ACCOUNT_NICKNAME_EVENT = "pokemon-account-nickname-updated";
let activeAccountId: number | null = null;

export function accountStorageKey(userId: number): string {
  if (!Number.isSafeInteger(userId) || userId <= 0)
    throw new Error("La cuenta no tiene un identificador válido.");
  return `persist:root:user:${userId}`;
}

export function accountNicknameKey(userId: number): string {
  accountStorageKey(userId);
  return `trainer_nickname:user:${userId}`;
}

export function getActiveAccountId(): number | null {
  return activeAccountId;
}

/** Only the session coordinator in store.ts changes the owner after flushing. */
export function selectAccountStorage(userId: number | null): void {
  if (userId !== null) accountStorageKey(userId);
  activeAccountId = userId;
}

export function readLocalValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    throw new Error(
      "No se pudo leer el almacenamiento de este navegador. Tus partidas guardadas se conservan.",
    );
  }
}

export function writeLocalValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    throw new Error(
      "No se pudo guardar en este navegador. Revisa el espacio y los permisos de almacenamiento; la partida anterior se conserva.",
    );
  }
}

export const accountStorage = {
  getItem(_key: string): Promise<string | null> {
    const owner = activeAccountId;
    if (owner === null) return Promise.resolve(null);
    try {
      return Promise.resolve(readLocalValue(accountStorageKey(owner)));
    } catch (error) {
      return Promise.reject(error);
    }
  },
  setItem(_key: string, value: string): Promise<void> {
    // Capture the owner and perform the local write before returning a promise.
    const owner = activeAccountId;
    if (owner === null) return Promise.resolve();
    try {
      writeLocalValue(accountStorageKey(owner), value);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  },
  removeItem(_key: string): Promise<void> {
    // Account transitions and logout must never purge a saved party.
    return Promise.resolve();
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function validPokemon(value: unknown): boolean {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.id) &&
    typeof value.name === "string" &&
    Array.isArray(value.types) &&
    value.types.every((type) => typeof type === "string") &&
    Array.isArray(value.stats) &&
    value.stats.every(
      (stat) =>
        isRecord(stat) &&
        typeof stat.name === "string" &&
        typeof stat.value === "number" &&
        Number.isFinite(stat.value),
    )
  );
}

/** Redux Persist serializes each root field as a JSON string inside root JSON. */
export function decodeAccountParty(
  raw: string | null,
): { party: PartyState } | undefined {
  if (raw === null) return undefined;
  try {
    const root: unknown = JSON.parse(raw);
    if (!isRecord(root)) throw new Error();
    if (root.party === undefined) return undefined;
    if (typeof root.party !== "string") throw new Error();
    const party: unknown = JSON.parse(root.party);
    if (!isRecord(party) || !Array.isArray(party.pokemons)) throw new Error();
    const ids = new Set<string>();
    for (const capture of party.pokemons) {
      if (
        !isRecord(capture) ||
        typeof capture.captureId !== "string" ||
        !capture.captureId ||
        ids.has(capture.captureId) ||
        !validPokemon(capture.pokemon)
      )
        throw new Error();
      ids.add(capture.captureId);
    }
    if (
      party.opponent !== undefined &&
      party.opponent !== null &&
      (!isRecord(party.opponent) || !validPokemon(party.opponent.pokemon))
    )
      throw new Error();
    return {
      party: { ...party, opponent: party.opponent ?? null } as PartyState,
    };
  } catch {
    throw new Error(
      "La partida guardada no se pudo interpretar. Se conserva sin sobrescribir para poder recuperarla.",
    );
  }
}

export function encodeAccountParty(party: PartyState): string {
  return JSON.stringify({
    party: JSON.stringify(party),
    _persist: JSON.stringify({ version: -1, rehydrated: true }),
  });
}

export function readAccountParty(
  userId: number,
): { party: PartyState } | undefined {
  return decodeAccountParty(readLocalValue(accountStorageKey(userId)));
}

export function writeAccountParty(userId: number, party: PartyState): void {
  writeLocalValue(accountStorageKey(userId), encodeAccountParty(party));
}

export function getStoredNickname(userId: number): string {
  try {
    return readLocalValue(accountNicknameKey(userId))?.trim() || "";
  } catch {
    return "";
  }
}

/** Reservation is created only after explicit consent, and survives failed imports. */
export function legacyAvailableTo(userId: number): boolean {
  accountStorageKey(userId);
  const owner = readLocalValue(LEGACY_PARTY_OWNER_KEY);
  const reserved = readLocalValue(LEGACY_PARTY_RESERVATION_KEY);
  return owner === null && (reserved === null || reserved === String(userId));
}

export async function withLegacyImportLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks?.request)
    throw new Error(
      "Este navegador no permite asegurar una importación única. Usa un navegador compatible en una conexión segura; la partida anterior se conserva.",
    );
  return navigator.locks.request(
    "pokemon-legacy-party-import:v1",
    { mode: "exclusive" },
    operation,
  );
}

export function notifyNicknameChanged(userId: number): void {
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent(ACCOUNT_NICKNAME_EVENT, { detail: { userId } }),
    );
}
