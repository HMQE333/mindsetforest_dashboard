

## Add Breathing Tips to Pattern Cards

### What

Add a short practical tip to select breathing patterns — displayed as a subtle text line on the pattern selection cards. Only patterns where a tip genuinely helps (technique cues, posture, or nostril instructions) get one.

### Tips

| Pattern | Tip |
|---------|-----|
| 4-7-8 | "Place tongue behind upper teeth. Exhale through mouth." |
| Alternate Nostril | "Use thumb for right nostril, ring finger for left." |
| Wim Hof | "Breathe deep into belly, then chest. Let exhale fall naturally." |
| Physiological Sigh | "Two quick sniffs in through nose, then one long exhale through mouth." |
| Coherent | "Breathe gently through the nose. No effort, just rhythm." |

Equal, Box, and Relaxing are intuitive enough not to need tips.

### Changes

**`src/lib/breathing-data.ts`**
- Add optional `tip?: string` field to `BreathingPattern`
- Add tip strings to the 5 patterns listed above

**`src/components/breathing/BreathingView.tsx`**
- Render `p.tip` as a small italic text line below the description on each pattern card, only when present
- Styled as `text-[10px] italic text-muted-foreground/70` to keep it subtle

Two files, minimal change.

