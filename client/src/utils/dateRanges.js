// Quick date-range presets used by the Requisitions page and Reports page
// filters ("day / monthly / yearly" style shortcuts), computed client-side
// into ISO date_from/date_to bounds the API already understands.
export const PRESETS = ["all", "today", "week", "month", "year", "custom"];

export function presetLabel(preset) {
  return {
    all: "All Time",
    today: "Today",
    week: "This Week",
    month: "This Month",
    year: "This Year",
    custom: "Custom Range",
  }[preset] || preset;
}

export function presetToRange(preset, customFrom, customTo) {
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);

  if (preset === "today") {
    return { date_from: startOfDay(now).toISOString(), date_to: now.toISOString() };
  }
  if (preset === "week") {
    const day = now.getDay() === 0 ? 7 : now.getDay(); // Monday-start week
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day - 1));
    return { date_from: startOfDay(monday).toISOString(), date_to: now.toISOString() };
  }
  if (preset === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { date_from: startOfDay(first).toISOString(), date_to: now.toISOString() };
  }
  if (preset === "year") {
    const first = new Date(now.getFullYear(), 0, 1);
    return { date_from: startOfDay(first).toISOString(), date_to: now.toISOString() };
  }
  if (preset === "custom") {
    return {
      date_from: customFrom ? new Date(customFrom).toISOString() : undefined,
      date_to: customTo ? new Date(customTo + "T23:59:59").toISOString() : undefined,
    };
  }
  return {}; // "all"
}
