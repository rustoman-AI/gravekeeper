import { CemeteryGate } from "./cemetery-gate";
import { NightLandscape } from "./night-landscape";

/**
 * Landing hero (graveyard-art R9.1, R9.7, R9.8): the shared night landscape, the
 * cemetery gate, the h1 over it and the pitch sentence under it. No hook and no
 * browser API, so it is Server Component-safe; `LandingPage` and `GateFallback`
 * render the same component so their heights match. The height is fixed
 * (`--hero-h`, 360px, 300px under 640px; set in globals.css) so nothing shifts.
 */
export function Hero() {
  return (
    <section
      className="gk-hero"
      aria-labelledby="hero-title"
      style={{ height: "var(--hero-h, 360px)" }}
    >
      <NightLandscape variant="hero" />
      <CemeteryGate />
      <div className="gk-hero-copy">
        <h1 id="hero-title" className="text-4xl text-bone">
          Gravekeeper
        </h1>
        <p className="text-lg text-bone">
          Paste a public GitHub repository and see which of its dependencies are dead, haunted or
          alive.
        </p>
      </div>
    </section>
  );
}
