// graveyard-art Requirement 3.2: shared hash, moved out of scene.ts so variants.ts and scene.ts can both import it.
/** FNV-1a, 32 bit, over UTF-16 code units. */
export function hashKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
