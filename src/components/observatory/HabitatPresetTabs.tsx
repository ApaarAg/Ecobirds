import React, { useRef } from 'react';
import type { HabitatPresetMeta } from '../../data/demoFixtures';
import type { HabitatPresetId } from '../../types/ecosonic';

interface HabitatPresetTabsProps {
  presets: readonly HabitatPresetMeta[];
  activePreset: HabitatPresetId;
  onSelectPreset: (presetId: HabitatPresetId) => void;
  ariaLabel?: string;
  disabled?: boolean;
}

export function HabitatPresetTabs({
  presets,
  activePreset,
  onSelectPreset,
  ariaLabel = 'Select monitoring station preset',
  disabled = false,
}: HabitatPresetTabsProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (disabled || presets.length === 0) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % presets.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + presets.length) % presets.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = presets.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      const targetPreset = presets[nextIndex];
      onSelectPreset(targetPreset.id);
      buttonRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2 pt-1"
      role="tablist"
      aria-label={ariaLabel}
    >
      {presets.map((preset, index) => {
        const active = preset.id === activePreset;
        return (
          <button
            key={preset.id}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => onSelectPreset(preset.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D3A36C] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--app-bg)] disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${
              active
                ? 'bg-[#788B68] text-[#101C17] font-semibold'
                : 'bg-[var(--app-bg)] text-[var(--app-text-secondary)] border border-[var(--app-border)] hover:border-[var(--app-border-strong)]'
            }`}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
