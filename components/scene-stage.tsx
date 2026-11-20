import type { ReactNode } from 'react';
import { SceneBackdrop } from './scene-backdrop';

/**
 * Full-bleed stage of the scene view (graveyard-art R1.2, R1.8, GA-D9): the horizon backdrop and the ground
 * span the page width; the inner column keeps the max-w-6xl width that the results page measures.
 */
export function SceneStage({ children }: { children: ReactNode }) {
  return (
    <div className="gk-stage">
      <SceneBackdrop variant="stage" />
      <div className="gk-stage-inner relative mx-auto w-full max-w-6xl px-4">{children}</div>
    </div>
  );
}
