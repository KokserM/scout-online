import type { RulesMode } from "../protocol/types";

export function rulesModeName(mode: RulesMode): string {
  return mode === "official" ? "Official" : "Võsu";
}

export function RulesModeBadge({
  mode,
  className = "",
}: {
  mode: RulesMode;
  className?: string;
}) {
  return (
    <span className={`mode-badge mode-badge--${mode} ${className}`.trim()}>
      {rulesModeName(mode)}
    </span>
  );
}
