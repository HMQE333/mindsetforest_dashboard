---
name: Forest visual identity
description: Forest module uses an organic "living grove" look — hero band, ambient backdrop blobs, leaf-shaped seed cards with pillar vein, segmented sub-tabs.
type: design
---
Forest visual upgrade (vs generic glass-card grid):
- Wrapper has `forest-backdrop` class — soft green/cyan/purple radial blobs + bottom ground gradient (defined in src/index.css).
- Hero band at top: animated Leaf icon, "🌳 THE FOREST" tracking-widest title, dynamic tagline per sub-tab, three vital-sign stat chips (Planted / Waters / Today), inbox bell on right.
- Sub-tabs are a single segmented `glass-card` pill with `motion.div layoutId="forest-tab-pill"` sliding indicator.
- Seed cards use `seed-leaf` class (not `glass-card-hover`): asymmetric 18/22px border-radius, 2px left "vein" colored by lead pillar via `--seed-vein` CSS var, hover glow tinted by `--seed-glow`, avatar emoji wrapped in tinted ring circle, snippet uses font-serif.
- Watered droplet icon gets `animate-dewdrop` keyframe pulse.
- Empty state has animated pulsing sprout, not just an emoji.
