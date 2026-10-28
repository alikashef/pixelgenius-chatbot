import type { CSSProperties } from "react";
import type { RobotShape, WidgetColor, WidgetSettings } from "@/lib/api";

/** Curated palette a freelancer picks from; each entry works as an accent in both themes. */
export const WIDGET_COLORS: Record<WidgetColor, { label: string; hex: string; hsl: string; onHsl: string }> = {
  violet: { label: "بنفش", hex: "#7c3aed", hsl: "262 83% 58%", onHsl: "0 0% 100%" },
  saffron: { label: "زعفرانی", hex: "#f28c28", hsl: "27 96% 53%", onHsl: "30 8% 10%" },
  ink: { label: "جوهری", hex: "#36312b", hsl: "30 8% 19%", onHsl: "40 20% 98%" },
  emerald: { label: "زمردی", hex: "#0f9d6e", hsl: "160 82% 34%", onHsl: "0 0% 100%" },
  ocean: { label: "اقیانوسی", hex: "#2f6fde", hsl: "218 72% 53%", onHsl: "0 0% 100%" },
  rose: { label: "گلبهی", hex: "#e2456b", hsl: "345 73% 58%", onHsl: "0 0% 100%" },
  plum: { label: "آلویی", hex: "#7c4dbd", hsl: "265 45% 52%", onHsl: "0 0% 100%" },
};

export const ROBOT_SHAPES: { id: RobotShape; label: string }[] = [
  { id: "circle", label: "دایره" },
  { id: "rectangle", label: "مستطیل" },
  { id: "square", label: "مربع" },
  { id: "hexagon", label: "شش‌ضلعی" },
];

/** robot-heads takes hex colors: the shell in the chosen color, trim in a contrasting tone. */
export function robotColors(color: WidgetColor) {
  return {
    color: WIDGET_COLORS[color].hex,
    trimColor: color === "ink" ? WIDGET_COLORS.violet.hex : "#1e1b2e",
    screenColor: "#fff1df",
  };
}

/** Overrides the brand and primary tokens so buttons, focus rings and highlights take the widget's accent. */
export function accentStyle(widget: Pick<WidgetSettings, "accent">): CSSProperties {
  const accent = WIDGET_COLORS[widget.accent];
  return {
    ["--brand" as string]: accent.hsl,
    ["--brand-solid" as string]: accent.hsl,
    ["--brand-foreground" as string]: accent.onHsl,
    ["--primary" as string]: accent.hsl,
    ["--primary-hover" as string]: accent.hsl,
    ["--primary-foreground" as string]: accent.onHsl,
    ["--ring" as string]: accent.hsl,
  };
}
