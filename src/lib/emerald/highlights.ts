/** Short, player-facing events. The full protocol and RNG stay in the history. */
const labels: Record<string, string> = {
  brn: "Burned",
  par: "Paralyzed",
  slp: "Asleep",
  frz: "Frozen",
  psn: "Poisoned",
  tox: "Badly poisoned",
  confusion: "Confusion",
  flinch: "Flinch",
  substitute: "Substitute",
  mustrecharge: "Recharge",
  atk: "Attack",
  def: "Defense",
  spa: "Sp. Atk",
  spd: "Sp. Def",
  spe: "Speed",
  accuracy: "Accuracy",
  evasion: "Evasiveness",
};
const label = (s: string = "") => labels[s] ?? s.replace(/^move: /, "");
export function turnHighlights(
  lines: string[],
  names: Record<string, string>,
  initialHp: Record<string, number>,
): string[] {
  const hp = { ...initialHp };
  const events: string[] = [];
  let inMove = false;
  const key = (s: string = "") => s.replace(/^p[12][a-z]?: /, "");
  const who = (s: string = "") => names[key(s)] ?? key(s);
  for (const line of lines) {
    const [, event, actor, value, amount] = line.split("|");
    if (event === "move" || event === "cant") inMove = true;
    if (["boardend", "upkeep", "turn"].includes(event)) inMove = false;
    const name = who(actor);
    switch (event) {
      case "-damage":
      case "-heal": {
        const next = parseInt(value, 10),
          old = hp[key(actor)];
        hp[key(actor)] = next;
        if (Number.isFinite(old) && Number.isFinite(next)) {
          if (event === "-heal" && next > old)
            events.push(`${name} recuperó ${next - old} HP.`);
          else if ((!inMove || line.includes("[from]")) && old > next)
            events.push(
              `${name} perdió ${old - next} HP${!inMove ? " al finalizar el turno" : ""}${amount?.startsWith("[from]") ? ` (${label(amount.replace("[from] ", ""))})` : ""}.`,
            );
        }
        break;
      }
      case "-status":
        events.push(`${name}: ${label(value)}.`);
        break;
      case "-curestatus":
        events.push(`${name} se recuperó de ${label(value)}.`);
        break;
      case "-start":
        events.push(
          value.toLowerCase().includes("substitute")
            ? `${name} creó un Substitute.`
            : `${name}: ${label(value)}${amount && !amount.startsWith("[") ? ` · ${amount}` : ""}.`,
        );
        break;
      case "-end":
        events.push(
          value.toLowerCase().includes("substitute")
            ? `¡Se rompió el Substitute de ${name}!`
            : `${name}: terminó ${label(value)}.`,
        );
        break;
      case "-activate":
        if (value.toLowerCase().includes("substitute"))
          events.push(`El Substitute de ${name} recibió el ataque.`);
        else events.push(`${name}: ${label(value)}.`);
        break;
      case "-hitcount":
        events.push(`${name} recibió ${value} impactos.`);
        break;
      case "-boost":
      case "-unboost":
        events.push(
          `${name}: ${label(value)} ${event === "-boost" ? "+" : "−"}${amount}.`,
        );
        break;
      case "-singleturn":
      case "-singlemove":
        events.push(`${name}: ${label(value)}.`);
        break;
      case "-clearboost":
        events.push(`${name}: modificadores reiniciados.`);
        break;
      case "faint":
        events.push(`${name}: Fainted.`);
        break;
      case "-prepare":
        events.push(`${name} prepara ${value}; atacará en el siguiente turno.`);
        break;
      case "-mustrecharge":
        events.push(`${name} debe recargar.`);
        break;
      case "-weather":
        if (!line.includes("[upkeep]"))
          events.push(
            actor === "none" ? "El clima terminó." : `Clima: ${actor}.`,
          );
        break;
      case "-fieldstart":
      case "-fieldend":
        events.push(
          `${event === "-fieldstart" ? "Se activó" : "Terminó"}: ${label(actor)}.`,
        );
        break;
      case "-sidestart":
      case "-sideend":
        events.push(
          `${event === "-sidestart" ? "Se activó" : "Terminó"} ${label(value)} (${actor.startsWith("p1") ? "tu equipo" : "rival"}).`,
        );
        break;
      case "switch":
      case "drag":
        events.push(`Entró ${name} al combate.`);
        break;
      case "-transform":
        events.push(`${name} se transformó en ${who(value)}.`);
        break;
      case "message":
      case "-message":
        events.push(actor);
        break;
      case "win":
        events.push(`Combate terminado: ${actor}.`);
        break;
      case "tie":
        events.push("Combate terminado: empate.");
        break;
    }
  }
  return events;
}
