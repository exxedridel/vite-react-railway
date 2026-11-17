/** Rejection sampling keeps all twenty faces equally likely. */
export function rollCaptureD20(
  sample: () => number = () => crypto.getRandomValues(new Uint32Array(1))[0],
): number {
  const limit = Math.floor(0x100000000 / 20) * 20;
  for (let attempt = 0; attempt < 128; attempt++) {
    const value = sample();
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff)
      throw new Error("No se pudo generar una tirada D20 válida.");
    if (value < limit) return (value % 20) + 1;
  }
  throw new Error("No se pudo generar la tirada. Intenta nuevamente.");
}

export function automaticCaptureOutcome(
  roll: number,
  minimum: number,
): "caught" | "escaped" {
  if (
    !Number.isSafeInteger(roll) ||
    roll < 1 ||
    roll > 20 ||
    !Number.isSafeInteger(minimum) ||
    minimum < 1 ||
    minimum > 20
  )
    throw new Error("La tirada o el mínimo D20 no son válidos.");
  return roll >= minimum ? "caught" : "escaped";
}
