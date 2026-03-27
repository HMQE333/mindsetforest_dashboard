

## Plan: Finance Module ("💰 Finance" tab)

### Overview
A new top-level module tab for tracking income, expenses, monthly subscriptions, and loans to/from friends. Features a clean savings chart (income minus expenses over time) and organized transaction management.

### Database tables (2 new tables + migration)

**1. `finance_transactions`**
| Column | Type | Default |
|--------|------|---------|
| id | uuid | gen_random_uuid() |
| user_id | uuid | — |
| type | text | 'expense' | — values: `income`, `expense`, `subscription`, `loan_out`, `loan_in` |
| title | text | — |
| amount | numeric | 0 |
| category | text | 'other' | — e.g. food, transport, entertainment, salary, freelance, etc. |
| date | text | today |
| is_recurring | boolean | false |
| recurring_day | integer | null | — day of month for subscriptions |
| person_name | text | '' | — for loans: who borrowed/lent |
| is_settled | boolean | false | — for loans: paid back? |
| notes | text | '' |
| created_at | timestamptz | now() |

RLS: standard user_id = auth.uid() for all CRUD.

**2. `finance_summary`** — not needed, we'll compute from transactions client-side.

### New files

**`src/hooks/useFinanceState.ts`**
- CRUD hook for `finance_transactions` (fetch, add, update, delete)
- Computed helpers: monthly totals, savings (income - expenses), active subscriptions, outstanding loans

**`src/components/finance/FinanceView.tsx`**
- Main view with sub-tabs: **Overview**, **Transactions**, **Subscriptions**, **Loans**
- Stats strip at top: Monthly Income, Monthly Expenses, Savings, Active Subscriptions count

**`src/components/finance/FinanceOverview.tsx`**
- Savings chart (last 6 months) — bar chart using the same teal style as tracker detailed stats, showing income vs expenses vs savings per month
- Quick summary cards: this month's balance, biggest expense category, total outstanding loans

**`src/components/finance/FinanceTransactions.tsx`**
- List of all income/expense entries with add button
- Filter by month, type, category
- Each row: icon + title + amount (green for income, red for expense) + date

**`src/components/finance/FinanceSubscriptions.tsx`**
- Grid of active recurring subscriptions with monthly total
- Add/edit/delete subscriptions
- Visual: card per subscription with icon, name, amount, billing day

**`src/components/finance/FinanceLoans.tsx`**
- Who owes you / who you owe sections
- Mark as settled
- Total outstanding amount

**`src/components/finance/AddTransactionModal.tsx`**
- Modal form: type selector (income/expense/subscription/loan), title, amount, category, date, person (for loans), recurring toggle

### Integration into existing app

**`src/pages/Index.tsx`**
- Add `"finance"` to the `Tab` type and `ALL_TAB_LABELS` (`"💰 Finance"`)
- Add to `TAB_ORDER`
- Import and render `FinanceView`

**`src/components/settings/ModulesTab.tsx`**
- Add finance to `ALL_MODULES` list

**`src/hooks/useUserSettings.ts`**
- Add `"finance"` to `DEFAULT_MODULES`

### Savings chart design
- 6-month horizontal bar chart, one group per month
- Green bars = income, red bars = expenses, teal/accent bar = savings (net)
- Built with plain divs + framer-motion (matching existing tracker chart style, no external chart library)
- Persistent value labels on bars

### Files changed/created summary
1. **Migration** — 1 new table `finance_transactions`
2. **`src/hooks/useFinanceState.ts`** — new
3. **`src/components/finance/FinanceView.tsx`** — new
4. **`src/components/finance/FinanceOverview.tsx`** — new
5. **`src/components/finance/FinanceTransactions.tsx`** — new
6. **`src/components/finance/FinanceSubscriptions.tsx`** — new
7. **`src/components/finance/FinanceLoans.tsx`** — new
8. **`src/components/finance/AddTransactionModal.tsx`** — new
9. **`src/pages/Index.tsx`** — add tab
10. **`src/components/settings/ModulesTab.tsx`** — add module entry
11. **`src/hooks/useUserSettings.ts`** — add to defaults

