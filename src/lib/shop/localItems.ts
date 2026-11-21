import type { PartyState } from "@/slices/partySlice";
import {
  USABLE_ITEM_IDS,
  type ConsumptionAck,
  type LocalItemDebit,
  type LocalItemOutbox,
} from "./types";
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is string =>
  typeof value === "string" && /^[\w.:-]{1,128}$/.test(value);
export function validConsumptionAck(value: unknown): value is ConsumptionAck {
  return (
    record(value) &&
    id(value.clientId) &&
    Number.isSafeInteger(value.throughSequence) &&
    Number(value.throughSequence) >= 0 &&
    (value.rejected === undefined ||
      (Array.isArray(value.rejected) &&
        value.rejected.every(
          (entry: unknown) =>
            record(entry) &&
            id(entry.operationId) &&
            Number.isSafeInteger(entry.sequence) &&
            Number(entry.sequence) > 0 &&
            Number(entry.sequence) <= Number(value.throughSequence) &&
            USABLE_ITEM_IDS.includes(
              entry.itemId as LocalItemDebit["itemId"],
            ) &&
            entry.reason === "INSUFFICIENT_ITEMS",
        )))
  );
}
export function validLocalItemOutbox(value: unknown): value is LocalItemOutbox {
  if (
    !record(value) ||
    value.version !== 1 ||
    !id(value.clientId) ||
    !Number.isSafeInteger(value.nextSequence) ||
    Number(value.nextSequence) < 1 ||
    !Array.isArray(value.operations)
  )
    return false;
  let previous = 0;
  const ids = new Set<string>();
  return value.operations.every((op: unknown) => {
    if (
      !record(op) ||
      !id(op.operationId) ||
      ids.has(op.operationId) ||
      !id(op.captureId) ||
      !Number.isSafeInteger(op.sequence) ||
      Number(op.sequence) <= previous ||
      Number(op.sequence) >= Number(value.nextSequence) ||
      op.quantity !== 1 ||
      !USABLE_ITEM_IDS.includes(op.itemId as LocalItemDebit["itemId"]) ||
      !["party", "local-battle"].includes(String(op.context)) ||
      (op.itemId === "rare-candy" && op.context !== "party") ||
      (op.itemId === "max-ether" || op.itemId === "tm"
        ? !Number.isSafeInteger(op.moveId) ||
          Number(op.moveId) < 1 ||
          Number(op.moveId) > 354
        : op.moveId !== undefined)
    )
      return false;
    previous = Number(op.sequence);
    ids.add(op.operationId);
    return true;
  });
}
export function pendingLocalItemOperations(
  party: Pick<PartyState, "localItemOutbox">,
): LocalItemDebit[] {
  return party.localItemOutbox?.operations ?? [];
}
