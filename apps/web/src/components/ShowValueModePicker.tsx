import type { ShowValueMode } from "../protocol/types";

export function ShowValueModePicker({
  modes,
  value,
  onChange,
}: {
  modes: ShowValueMode[];
  value: ShowValueMode | undefined;
  onChange: (mode: ShowValueMode) => void;
}) {
  if (modes.length < 2) return null;
  return (
    <fieldset className="show-mode-picker">
      <legend>Choose values for this Show</legend>
      <div className="segmented-picker">
        {modes.map((mode) => (
          <label key={mode}>
            <input
              type="radio"
              name="show-value-mode"
              value={mode}
              checked={value === mode}
              onChange={() => onChange(mode)}
            />
            <span>{mode.toUpperCase()}</span>
          </label>
        ))}
      </div>
      <small>
        Use the {value ? value.toUpperCase() : "chosen"} value on every selected
        card.
      </small>
    </fieldset>
  );
}
