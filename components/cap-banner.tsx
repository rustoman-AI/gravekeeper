import type { NotesModel } from "@/view-model";

export interface CapBannerProps {
  banner: NonNullable<NotesModel["capBanner"]>;
}

/** Requirement 11.6: the cap banner with its plain message and the skipped count. */
export function CapBanner({ banner }: CapBannerProps) {
  return (
    <div role="status" className="rounded border border-amber bg-night-raised p-3 text-bone">
      <p>{banner.message}</p>
      <p className="text-bone-muted">Skipped dependencies: {banner.skippedCount}</p>
    </div>
  );
}
