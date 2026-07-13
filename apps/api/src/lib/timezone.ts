// Conversão simples de horário local do tenant → UTC, sem dependência externa.
// Precisão de minutos é suficiente para agendamentos.

/** "2026-07-15" + "14:30" no fuso do tenant → Date em UTC */
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`);
  const wallInTz = new Date(naive.toLocaleString("en-US", { timeZone }));
  const wallInUtc = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = wallInUtc.getTime() - wallInTz.getTime();
  return new Date(naive.getTime() + offsetMs);
}

/** Date UTC → "HH:MM" no fuso do tenant */
export function formatTimeInZone(date: Date, timeZone: string): string {
  return date.toLocaleTimeString("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Dia da semana ("seg".."dom") de uma data no fuso do tenant */
export function weekdayInZone(dateStr: string, timeZone: string): string {
  const date = zonedTimeToUtc(dateStr, "12:00", timeZone);
  const weekday = date.toLocaleDateString("en-US", { timeZone, weekday: "short" }).toLowerCase();
  const map: Record<string, string> = {
    mon: "seg",
    tue: "ter",
    wed: "qua",
    thu: "qui",
    fri: "sex",
    sat: "sab",
    sun: "dom",
  };
  return map[weekday] ?? "seg";
}
