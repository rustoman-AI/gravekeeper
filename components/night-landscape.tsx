import type { ReactNode } from "react";
import { FogLayer } from "./fog-layer";
import { SceneBackdrop, type BackdropVariant } from "./scene-backdrop";

/** The shared night landscape: static backdrop plus two drifting fog layers (graveyard-art R1.1). */
export function NightLandscape({ variant, children }: { variant: BackdropVariant; children?: ReactNode }) {
  return (
    <>
      <SceneBackdrop variant={variant} />
      <FogLayer />
      {children}
    </>
  );
}
