"use client";

import { useId, useMemo, useState } from "react";
import { buildPickerModel } from "@/view-model";

/** A candidate manifest; format and size are optional so path-only candidates work. */
export interface PickerCandidateInput {
  readonly path: string;
  readonly format?: string;
  readonly sizeBytes?: number | null;
}

/** Deterministic human size: bytes below 1000, then kB and MB with one decimal (decimal units). */
export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${String(bytes)} ${bytes === 1 ? "byte" : "bytes"}`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} kB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export interface ManifestPickerProps {
  candidates: readonly PickerCandidateInput[];
  /** Repo value for the scan URL. */
  repoValue: string;
  /** Called with the scan URL of the current selection. */
  onScan: (url: string) => void;
}

/** Requirements 11.11, 13.15, 13.17: labelled checkbox group, limit reached, scan button. */
export function ManifestPicker({ candidates, repoValue, onScan }: ManifestPickerProps) {
  const [selected, setSelected] = useState<readonly string[]>([]);
  const baseId = useId();
  const model = useMemo(() => {
    const base = buildPickerModel(
      candidates.map((c) => c.path),
      selected,
      repoValue,
    );
    return {
      ...base,
      candidates: base.candidates.map((c) => {
        const found = candidates.find((d) => d.path === c.path);
        return found === undefined ? c : { ...c, format: found.format, sizeBytes: found.sizeBytes };
      }),
    };
  }, [candidates, selected, repoValue]);

  function toggle(path: string, checked: boolean) {
    setSelected((prev) => (checked ? [...prev.filter((p) => p !== path), path] : prev.filter((p) => p !== path)));
  }

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-bone">Choose manifests to scan (up to {model.limit})</legend>
        {model.candidates.map((c, i) => {
          const id = `${baseId}-${String(i)}`;
          return (
            <div key={c.path} className="flex flex-col">
              <label htmlFor={id} className="flex min-h-11 items-center gap-2 text-bone">
                <input
                  id={id}
                  type="checkbox"
                  checked={c.checked}
                  disabled={c.disabled}
                  onChange={(e) => {
                    toggle(c.path, e.target.checked);
                  }}
                />
                <span>{c.path}</span>
              </label>
              {c.format === undefined && c.sizeBytes === undefined ? null : (
                <span className="ml-6 text-bone-muted">
                  {c.format ?? ""}
                  {c.format !== undefined && typeof c.sizeBytes === "number" ? ", " : ""}
                  {typeof c.sizeBytes === "number" ? formatSize(c.sizeBytes) : ""}
                </span>
              )}
              {c.disabled ? <span className="ml-6 text-bone-muted">limit reached</span> : null}
            </div>
          );
        })}
      </fieldset>
      <button
        type="button"
        disabled={model.scanUrl === null}
        onClick={() => {
          if (model.scanUrl !== null) onScan(model.scanUrl);
        }}
        className="min-h-11 self-start rounded bg-amber px-5 font-semibold text-night hover:bg-bone disabled:opacity-60"
      >
        Scan selected manifests
      </button>
    </div>
  );
}
