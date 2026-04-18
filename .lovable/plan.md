

## Custom Finance Categories

Replace the hardcoded `EXPENSE_CATEGORIES` and `INCOME_CATEGORIES` lists with a user-editable system, so users can name categories that actually match their life (e.g. "Rent", "Coffee runs", "Side gig") instead of generic "bills/food/other".

### Data Model

New table `finance_categories`:
```
id          uuid pk
user_id     uuid
kind        text  -- 'expense' | 'income'
name        text
icon        text  -- emoji
color       text  -- hex
sort_order  int
created_at  timestamptz
```
With RLS (own-user CRUD), unique on `(user_id, kind, lower(name))`.

Transactions stay using the free-form `category` text column — categories link by name, so renaming/deleting a category doesn't orphan transactions.

### Seeding

On first load (or first time user opens Finance), if user has no rows in `finance_categories`, seed defaults from current `EXPENSE_CATEGORIES` / `INCOME_CATEGORIES` lists (with sensible default emojis: 🍔 food, 🚗 transport, 🎬 entertainment, 💡 bills, 💊 health, 🛍 shopping, 📚 education, 💼 salary, 💻 freelance, 📈 investment, 🎁 gift, ↩️ refund, 🔣 other).

### Hook: `useFinanceCategories.ts` (new)

```ts
{
  expenseCategories, incomeCategories, loading,
  addCategory(kind, name, icon, color),
  updateCategory(id, patch),
  deleteCategory(id),
  reorderCategories(kind, orderedIds),
}
```

### UI Changes

**1. New `FinanceCategoriesModal.tsx`**
- Two tabs: "Expense" / "Income"
- Per-row: emoji input · name input · color swatch · drag handle · delete button
- "+ Add category" button at the bottom
- Same glass-card styling as `EditMissionsModal`

**2. `FinanceView.tsx`**
- Add small "⚙ Categories" button next to the sub-tab row (top-right) opening the modal

**3. `AddTransactionModal.tsx`**
- Replace native `<select>` (lines using `EXPENSE_CATEGORIES`/`INCOME_CATEGORIES`) with a custom pill-grid picker of the user's categories, matching the design philosophy (no native OS dropdowns). Show emoji + name. Last row pill: "+ New" → opens categories modal pre-focused on a new entry.

**4. `FinanceTransactions.tsx`**
- Display row uses category emoji + colored chip (looked up by name from user's category list, falls back to plain text if missing — handles deleted categories gracefully)
- Filter dropdown can show user's category list instead of just type

**5. `FinanceOverview.tsx`**
- `biggestExpenseCategory` already uses category name; no logic change. Optionally render with the matching emoji.

### Files to Create / Modify

- **NEW:** migration → `finance_categories` table + RLS + seeding skipped at SQL level (seeded client-side on first load)
- **NEW:** `src/hooks/useFinanceCategories.ts`
- **NEW:** `src/components/finance/FinanceCategoriesModal.tsx`
- **MODIFY:** `src/components/finance/FinanceView.tsx` — open modal button
- **MODIFY:** `src/components/finance/AddTransactionModal.tsx` — pill-grid picker driven by hook
- **MODIFY:** `src/components/finance/FinanceTransactions.tsx` — emoji/color chip for display
- **MODIFY:** `src/hooks/useFinanceState.ts` — keep `EXPENSE_CATEGORIES`/`INCOME_CATEGORIES` only as fallback constants for seeding

### Out of Scope

- Budgets per category
- Reassign/migrate transactions on category rename (transactions still hold the old name string)
- Per-category icons in `FinanceOverview` charts (can be added later)

