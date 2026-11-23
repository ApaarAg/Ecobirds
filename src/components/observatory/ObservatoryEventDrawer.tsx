import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import {
  formatTimestampDateTime,
  getDisturbanceCategoryLabel,
} from '../../lib/acoustics';
import type {
  DisturbanceEvent,
  MonitoringSession,
  SpeciesDetection,
} from '../../types/ecosonic';
import { Button } from '../ui/Primitives';

export type InspectedObservatoryItem =
  | { kind: 'detection'; item: SpeciesDetection }
  | { kind: 'disturbance'; item: DisturbanceEvent };

interface ObservatoryEventDrawerProps {
  inspected: InspectedObservatoryItem | null;
  session: MonitoringSession | null;
  showScientificNamesFirst: boolean;
  onClose: () => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ObservatoryEventDrawer({
  inspected,
  session,
  showScientificNamesFirst,
  onClose,
}: ObservatoryEventDrawerProps) {
  const titleId = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!inspected) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const rafId = window.requestAnimationFrame(() => {
      closeBtnRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'Tab' && drawerRef.current) {
        const focusables = Array.from(
          drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => el.offsetParent !== null);

        if (focusables.length === 0) {
          event.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (event.shiftKey) {
          if (active === first || !drawerRef.current.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else if (active === last || !drawerRef.current.contains(active)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      previousFocusRef.current?.focus();
    };
  }, [inspected, onClose]);

  if (!inspected) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-[2px]"
      onClick={handleBackdropClick}
    >
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="observatory-event-drawer"
        className="w-full max-w-md h-full bg-[var(--app-surface)] border-l border-[var(--app-border-strong)] text-[var(--app-text)] shadow-2xl flex flex-col justify-between overflow-y-auto"
      >
        <div className="p-6 space-y-6">
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-[var(--app-border)]">
            <div className="min-w-0">
              <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--app-amber)]">
                {inspected.kind === 'detection'
                  ? 'Demo Fixture · Species Detection'
                  : 'Demo Fixture · Disturbance Signal'}
              </div>
              <h2
                id={titleId}
                className="font-serif text-2xl font-semibold text-[var(--app-text)] mt-1 break-words"
              >
                {inspected.kind === 'detection'
                  ? showScientificNamesFirst
                    ? inspected.item.scientificName
                    : inspected.item.commonName
                  : inspected.item.label}
              </h2>
              {inspected.kind === 'detection' && (
                <p className="text-sm italic text-[var(--app-text-muted)] mt-0.5 break-words">
                  {showScientificNamesFirst
                    ? inspected.item.commonName
                    : inspected.item.scientificName}
                </p>
              )}
            </div>

            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              aria-label="Close inspection drawer"
              className="p-2 rounded-md text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-elevated)]/60 transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {inspected.kind === 'detection' ? (
            <div className="space-y-5">
              <dl className="space-y-3 text-xs">
                <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
                  <dt className="text-[var(--app-text-muted)] shrink-0">Common Name</dt>
                  <dd className="text-[var(--app-text)] text-right font-medium">
                    {inspected.item.commonName}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
                  <dt className="text-[var(--app-text-muted)] shrink-0">Scientific Name</dt>
                  <dd className="text-[var(--app-text-secondary)] italic text-right">
                    {inspected.item.scientificName}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
                  <dt className="text-[var(--app-text-muted)] shrink-0">Raw Confidence Score</dt>
                  <dd className="font-mono tabular-nums text-[var(--app-accent)] font-semibold text-right">
                    {inspected.item.confidenceScore.toFixed(2)}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
                  <dt className="text-[var(--app-text-muted)] shrink-0">Timestamp</dt>
                  <dd className="font-mono tabular-nums text-[var(--app-text-secondary)] text-right">
                    {formatTimestampDateTime(inspected.item.timestampIso)}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
                  <dt className="text-[var(--app-text-muted)] shrink-0">Vocalization Duration</dt>
                  <dd className="font-mono tabular-nums text-[var(--app-text)] text-right">
                    {inspected.item.durationSec.toFixed(1)} s
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
                  <dt className="text-[var(--app-text-muted)] shrink-0">Frequency Range</dt>
                  <dd className="font-mono tabular-nums text-[var(--app-text)] text-right">
                    {inspected.item.frequencyRangeHz[0]}–{inspected.item.frequencyRangeHz[1]} Hz
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
                  <dt className="text-[var(--app-text-muted)] shrink-0">Associated Session</dt>
                  <dd className="font-mono text-[var(--app-text-secondary)] text-right">
                    {inspected.item.sessionId}
                  </dd>
                </div>
                {session && (
                  <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
                    <dt className="text-[var(--app-text-muted)] shrink-0">Session Title</dt>
                    <dd className="text-[var(--app-text-secondary)] text-right">
                      {session.title}
                    </dd>
                  </div>
                )}
              </dl>

              <p className="text-xs text-[var(--app-text-muted)] leading-relaxed border-l-2 border-[var(--app-accent)]/60 pl-3">
                Raw acoustic similarity score supplied by the model fixture. This metric is not a
                calibrated probability.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <dl className="space-y-3 text-xs">
                <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
                  <dt className="text-[var(--app-text-muted)] shrink-0">Category</dt>
                  <dd className="text-[var(--app-text)] text-right font-medium">
                    {getDisturbanceCategoryLabel(inspected.item.category)}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
                  <dt className="text-[var(--app-text-muted)] shrink-0">Severity</dt>
                  <dd className="capitalize text-[var(--app-amber)] font-medium text-right">
                    {inspected.item.severity}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
                  <dt className="text-[var(--app-text-muted)] shrink-0">Peak Level</dt>
                  <dd className="font-mono tabular-nums text-[var(--app-amber)] text-right">
                    {inspected.item.peakDbfs.toFixed(1)} dBFS
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
                  <dt className="text-[var(--app-text-muted)] shrink-0">Frequency Band</dt>
                  <dd className="font-mono tabular-nums text-[var(--app-text)] text-right">
                    {inspected.item.frequencyBandHz[0]}–{inspected.item.frequencyBandHz[1]} Hz
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
                  <dt className="text-[var(--app-text-muted)] shrink-0">Duration</dt>
                  <dd className="font-mono tabular-nums text-[var(--app-text)] text-right">
                    {inspected.item.durationSec} s
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
                  <dt className="text-[var(--app-text-muted)] shrink-0">Timestamp</dt>
                  <dd className="font-mono tabular-nums text-[var(--app-text-secondary)] text-right">
                    {formatTimestampDateTime(inspected.item.timestampIso)}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
                  <dt className="text-[var(--app-text-muted)] shrink-0">Raw Confidence Score</dt>
                  <dd className="font-mono tabular-nums text-[var(--app-text-secondary)] text-right">
                    {inspected.item.confidenceScore.toFixed(2)}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
                  <dt className="text-[var(--app-text-muted)] shrink-0">Associated Session</dt>
                  <dd className="font-mono text-[var(--app-text-secondary)] text-right">
                    {inspected.item.sessionId}
                  </dd>
                </div>
              </dl>

              <div className="space-y-1.5">
                <div className="text-xs font-medium text-[var(--app-text-muted)]">
                  Contextual Notes
                </div>
                <p className="text-xs text-[var(--app-text-secondary)] leading-relaxed">
                  {inspected.item.description}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-[var(--app-border)] flex justify-end">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Close Details
          </Button>
        </div>
      </div>
    </div>
  );
}
