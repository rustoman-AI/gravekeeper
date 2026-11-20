/** Two decorative fog layers; hidden from assistive technology. */
export function FogLayer() {
  return (
    <>
      <div className="gk-fog" aria-hidden="true" />
      <div className="gk-fog gk-fog-b" aria-hidden="true" />
    </>
  );
}
