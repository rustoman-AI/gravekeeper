"use client";

import dynamic from "next/dynamic";

/** Requirement 16.4: the Detail_Panel loads in its own chunk, not with the first load. */
export const LazyDetailPanel = dynamic(
  () => import("@/components/detail-panel").then((m) => m.DetailPanel),
  { ssr: false },
);
