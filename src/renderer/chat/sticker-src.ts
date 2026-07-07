export interface StickerCatalogEntry {
  id: string;
  src: string;
}

export function getStickerSrcForId(
  id: string,
  builtIn: Record<string, string>,
  enabledStickers: StickerCatalogEntry[],
): string | undefined {
  if (id in builtIn) return builtIn[id];
  return enabledStickers.find((sticker) => sticker.id === id)?.src;
}
