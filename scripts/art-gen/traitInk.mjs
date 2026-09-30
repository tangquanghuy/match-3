// Trait activation backdrop: one organic brush stroke, not a geometric badge.
// ART_MANIFEST=traitInk.mjs node scripts/art-gen/generate.mjs trait-ink-stroke
export const ASSETS = {
  'trait-ink-stroke': {
    size: '1536x1024',
    background: 'transparent',
    longest: 768,
    pad: 0.015,
    out: 'game-assets/bundled/fx/trait_ink_stroke.webp',
    prompt: `Production game UI texture, isolated on a genuinely transparent alpha background.
ONE single charcoal-black Chinese calligraphy brush stroke, wide horizontal silhouette, aspect ratio 5:1.
The stroke occupies the middle horizontal third of the canvas with empty transparent padding above and below.
A natural confident sideways swash made with an actual ink-loaded soft brush: irregular rounded pressure-loaded left start,
a dark cohesive middle with subtle parallel bristle streaks, then a delicate tapered dry-brush right finish.
The gesture rises very slightly to the right. Organic pressure variation, frayed brush hairs, small streaks of negative space,
subtle translucent ink bleeding at the edges. The center must remain dense enough to support small pale lettering later.
Restrained elegant East Asian brushwork, convincingly scanned physical ink, not vector art or a geometric shape.
Not a rectangle, not a badge, not a serrated polygon, not a symmetrical ribbon. No splatter clouds, no detached dots.
No text, no lettering, no symbols, no gold, no borders, no shadow, no glow, no paper texture, no mockup.
Only ONE black brush stroke. Preserve fine alpha transparency at the feathered edges. Do not paint a checkerboard.`
  }
};
