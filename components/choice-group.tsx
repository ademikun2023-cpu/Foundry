"use client";
import { useId } from "react";

export default function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  variant = "segmented",
  className = "",
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; note?: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  variant?: "segmented" | "chips";
  className?: string;
}) {
  const labelId = useId();
  return (
    <div className={`choice-field ${className}`}>
      <span className="choice-label" id={labelId}>{label}</span>
      <div
        className={`choice-options choice-${variant}`}
        role="group"
        aria-labelledby={labelId}
      >
        {options.map((option) => (
          <button
            type="button"
            key={option.value}
            aria-pressed={value === option.value}
            disabled={disabled}
            onClick={() => {
              if (option.value !== value) onChange(option.value);
            }}
          >
            {option.label}
            {option.note && <span className="choice-note">{option.note}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
