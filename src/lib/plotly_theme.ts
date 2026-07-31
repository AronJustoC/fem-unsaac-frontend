export type PlotlyAppTheme = "light" | "dark";

export const getPlotlyTheme = (theme: PlotlyAppTheme) => {
  const isDark = theme === "dark";

  return {
    isDark,
    paperBackground: isDark ? "#111827" : "#FFFFFF",
    plotBackground: isDark ? "#0B0F1A" : "#FFFFFF",
    text: isDark ? "#E5E7EB" : "#0F172A",
    mutedText: isDark ? "#94A3B8" : "#475569",
    subtleText: isDark ? "#9CA3AF" : "#64748B",
    grid: isDark ? "rgba(148, 163, 184, 0.18)" : "rgba(15, 23, 42, 0.12)",
    zeroLine: isDark ? "rgba(226, 232, 240, 0.28)" : "rgba(15, 23, 42, 0.22)",
    axisLine: isDark ? "rgba(148, 163, 184, 0.35)" : "rgba(71, 85, 105, 0.35)",
    legendBackground: isDark ? "rgba(15, 23, 42, 0.88)" : "rgba(255, 255, 255, 0.9)",
    legendBorder: isDark ? "rgba(148, 163, 184, 0.22)" : "rgba(15, 23, 42, 0.14)",
    hoverBackground: isDark ? "#111827" : "#FFFFFF",
    hoverBorder: isDark ? "#334155" : "#CBD5E1",
  };
};

