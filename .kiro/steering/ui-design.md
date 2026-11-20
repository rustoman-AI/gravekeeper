# Gravekeeper: UI Design

## Art direction
- A moonlit Victorian cemetery at night.
- Atmospheric, not cartoonish. No gore, no blood.
- Palette:
  - Blue-black night background.
  - Bone white text.
  - Warm amber for lanterns (ALIVE).
  - Spectral cyan glow for ghosts (HAUNTED). Glow intensity follows the max severity.
  - Weathered stone grey for tombstones (DEAD).
  - Mossy dark green for accents.
- Drifting fog layers.
- Unassessed dependencies appear as unmarked graves.

## Assets and fonts
- All art is original SVG or CSS made in this repo.
- No third-party images, no icons with unclear licences, no copyrighted characters.
- Fonts load through next/font and come from OFL-licensed families only.
- Use one period display face for headings and one highly readable sans for data.

## Voice
- Themed copy (for example "The caretaker found...") wraps the plain API message. It never replaces it.
- The plain message is always visible or one click away.

## Accessibility
- Accessibility is non-negotiable.
- Meet WCAG AA contrast.
- Every status has a text label. Never show status by colour or shape alone.
- Support full keyboard navigation with visible focus.
- prefers-reduced-motion disables fog, drift, and glow pulsing.
- Screen readers get a real table of the same data.
