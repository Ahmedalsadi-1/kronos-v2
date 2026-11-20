// Copyright 2026, KronOS.
import { useId } from "react";
import { brandText } from "./branding";
export function ChoiceGroup({ label, options, value, onChange }) {
    const name = useId();
    return (
        <div className="choice-group" role="radiogroup" aria-label={label}>
            {options.map((option, index) => {
                const item =
                    option && typeof option === "object"
                        ? option
                        : { value: option, label: option === "" ? "Default" : brandText(String(option)) };
                return (
                    <label className="choice" key={index}>
                        <input
                            type="radio"
                            name={name}
                            value={String(item.value)}
                            checked={String(value) === String(item.value)}
                            onChange={() => onChange(item.value)}
                        />
                        <span>{item.label}</span>
                    </label>
                );
            })}
        </div>
    );
}
