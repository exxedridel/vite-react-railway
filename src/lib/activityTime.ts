export const ACTIVITY_TIME_ZONE = "America/Mexico_City";

const formatter = new Intl.DateTimeFormat("es-MX", {
  timeZone: ACTIVITY_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function formatActivityDate(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime())
    ? formatter.format(date)
    : "Fecha no disponible";
}
