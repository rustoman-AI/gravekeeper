/** Two decorative low-mist layers; hidden from assistive technology (graveyard-art R2.2, R2.5). */
export function FogLayer() {
  return (
    <>
      <div className="gk-fog gk-fog-low" aria-hidden="true" />
      <div className="gk-fog gk-fog-high" aria-hidden="true" />
    </>
  );
}
