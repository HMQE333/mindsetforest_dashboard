

# Plan: Add "Library" (Reading List) Module

## Overview
A new "Library" tab with a bookshelf-style reading list. Users can add books with metadata (title, author, pages, rating), write notes, filter/sort, and get AI-powered book suggestions based on their list.

## Database

**New table: `user_books`**
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL)
- `title` (text, NOT NULL)
- `author` (text, default '')
- `total_pages` (integer, default 0)
- `pages_read` (integer, default 0)
- `rating` (integer, nullable, 1-5)
- `status` (text, default 'to-read') — values: to-read, reading, finished
- `notes` (text, default '')
- `cover_color` (text, default '#8B5CF6') — for visual book spine color
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

RLS: standard user-owns-row for SELECT, INSERT, UPDATE, DELETE.

**New edge function: `ai-book-suggest`**
- Takes user's book list, returns similar book suggestions via Lovable AI.

## Frontend Files

### New files:
1. **`src/components/library/LibraryView.tsx`** — Main view with bookshelf grid, filters (status, rating, author), search bar, and "AI Suggest" button
2. **`src/components/library/BookCard.tsx`** — Individual book card showing cover, title, author, progress bar (pages read/total), rating stars
3. **`src/components/library/AddBookModal.tsx`** — Modal form: title, author, total pages, status, cover color
4. **`src/components/library/BookDetailModal.tsx`** — Expanded view with notes editor, rating selector, page progress, AI Q&A about the book
5. **`src/components/library/AISuggestModal.tsx`** — Shows AI-generated book suggestions based on user's list
6. **`src/hooks/useLibraryState.ts`** — CRUD hook for user_books table
7. **`src/lib/library-data.ts`** — Types and constants

### Modified files:
1. **`src/pages/Index.tsx`** — Add "library" to Tab type, ALL_TAB_LABELS (`📚 Library`), TAB_ORDER, render LibraryView
2. **`src/components/settings/ModulesTab.tsx`** — Add library module to ALL_MODULES
3. **`src/hooks/useUserSettings.ts`** — Add "library" to DEFAULT_MODULES

## Key Features
- **Bookshelf UI**: Cards with colored spines, progress bars, star ratings
- **Filters**: By status (To Read / Reading / Finished), by rating, search by title/author
- **Notes**: Rich text area per book for personal annotations
- **AI Suggestions**: Send book titles+authors to AI, get 5 similar recommendations
- **AI Q&A**: Ask questions about a specific book (using title+author context)
- **Progress tracking**: Pages read vs total with visual progress bar

## Edge Function
`supabase/functions/ai-book-suggest/index.ts` — Uses Lovable AI gateway with `google/gemini-3-flash-preview` to suggest books based on the user's reading list. Also handles Q&A mode for individual books.

