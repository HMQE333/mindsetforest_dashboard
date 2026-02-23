

# Populate Archive with Test Data

## Overview
Insert 18 diverse test blocks into the archive to cover all content types and features: pure text, links, images, and mixed content across all pillars and directions.

## What gets added

| Type | Count | Examples |
|------|-------|---------|
| Pure text | 5 | Stoic routine, Wing Chun notes, trading rules, reflection template, quotes |
| Links only | 4 | JS resources (3 URLs), trading tools, UI inspiration, YouTube video |
| Images only | 4 | Workout photo, desk setup, nature walk (3 images), dashboard mockups (2 images) |
| Mixed (text + links + images) | 3 | Side project architecture, networking notes, book notes |
| Quick captures | 2 | Short idea, quote of the day |

## Coverage
- **All 8 pillars**: mind, body, creation, exploration, networking (plus multi-pillar combos)
- **All directions**: wisdom, goals, direction, freedom, protection, creation, expression, community
- **Diverse tags**: stoicism, programming, trading, fitness, design, books, etc.
- **source_url**: Set on ~6 blocks, NULL on others

## Technical Details

A single database migration will insert 18 rows into `archive_blocks` for the existing user account. Each block has realistic content with proper pillar/direction/tag arrays. Image blocks use Unsplash placeholder URLs in `[image] <url>` format to test the thumbnail rendering and lightbox features.

