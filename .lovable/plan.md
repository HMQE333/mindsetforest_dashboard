

## Import Notion "Mastery List" into Library

### What was scraped
The Notion page contains a table called "Mastery List" with columns: Name, Type, Status, Score, Author, Pages, Category tags, and Owned status. It includes:
- ~200+ Books
- ~30+ Courses (MasterClass, Great Courses Plus, Coursera platforms)
- Films and Academic Journals (will be skipped unless you want them)

### Plan

**1. Parse the scraped markdown into structured data**
- Write a Python script to extract each entry from the markdown
- Identify type (Book, Masterclass, Greatcoursesplus, Coursea, Academic Journal, Film)
- Extract: title, author, status, score, tags/categories, pages if available

**2. Map to your database schema**

Books → `user_books` table:
- `title`, `author` from Notion
- `status`: "Done" → "finished", "Not started" → "to-read"
- `rating`: score mapped to 1-5 scale (scores like 4.5 → 5, 3.5 → 4, etc.)
- `tags`: category tags from Notion (e.g., "strategy", "philosophy", "power")
- `total_pages` / `pages_read`: parsed from "256/256" format where available
- `format`: "owned" by default
- `cover_color`: random from existing palette

Courses → `user_courses` table:
- `title`, `instructor` (author) from Notion
- `platform`: "Masterclass" / "Great Courses Plus" / "Coursera"
- `status`: "Done" → "completed", "Not started" → "to-start"
- `rating`: same mapping as books
- `tags`: category tags
- `progress_pct`: 100 if completed, 0 otherwise

**3. Insert via database** using an edge function or direct insert script
- Batch insert all books and courses
- Skip duplicates (Films, Academic Journals unless requested)

### Technical Details
- Script runs via `code--exec` using the Supabase client
- Will need the user's auth session — so we'll use an edge function that accepts the parsed data and inserts it under the authenticated user
- Alternative: use `psql` direct insert if DB access is available

### Items skipped by default
- Films (e.g., "Wolfs of Wall Street", "Openheimer", "haibane renmei")
- Academic Journals (e.g., "Things that make us smart", "Visual Language...")
- Entries with no clear title

