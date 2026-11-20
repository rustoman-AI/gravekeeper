"use client";

import dynamic from "next/dynamic";

/** The ManifestPicker loads in its own chunk, only when a result or error needs it. */
export const LazyManifestPicker = dynamic(
  () => import("@/components/manifest-picker").then((m) => m.ManifestPicker),
  { ssr: false },
);
