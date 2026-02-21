# Plan: Bezpieczenstwo, Error Handling, Personalizacja   

&nbsp;

Ważne: nie zmieniaj nic z domyslnego wygladu dashboardu i domyslnych tekstow dodaj jedynie personalizacje dla nowych kont w osobnym formularzu, nie dodawaj koniecznosci potwierdzenia email 

## 1. KRYTYCZNY: Bezpieczenstwo

### 1a. Walidacja sily hasla (frontend)

Dodanie wizualnej walidacji hasla na stronie rejestracji w `src/pages/Auth.tsx`:

- Min. 8 znakow, 1 wielka litera, 1 cyfra
- Pasek sily hasla (slabe / srednie / silne) wyswietlany pod polem hasla
- Walidacja tylko w trybie "Sign Up", nie w "Sign In"
- &nbsp;

## 2. WYSOKI: Error Handling

### 2a. Global Error Boundary

- Nowy komponent `src/components/ErrorBoundary.tsx` (React class component z `componentDidCatch`)
- Wyswietla stylowy ekran bledu pasujacy do ciemnego motywu z przyciskiem "Try again"
- Owinac cala aplikacje w `App.tsx` wewnatrz ErrorBoundary

### 2b. NotFound page restyling

- Zmiana `src/pages/NotFound.tsx`: zamiana `bg-muted` na `bg-background`, dodanie ciemnego motywu, animacji framer-motion, gradientow jak w reszcie aplikacji
- Usunac `console.error`, zastapic normalnym renderem

### 2c. Toast/feedback na bledy bazy danych

- W hookach (`useDashboardState`, `useLadderState`, `useOracleState`, `useHabitLoopState`): dodanie `toast.error()` gdy operacje bazodanowe sie nie powioda (aktualnie bledy sa ciche)

## 3. SREDNI: Personalizacja

jak ktos tworzy nowe konto to daj mozliwosc uzyj domyslnych ustawien (wszystko to co mam) albo stworz wlasne (wypelnia caly formularz na bazie jego wlasnych 8 kafelkow zycia i co przez to rozumie)

### 3c. Branding w index.html

- Tytul strony: "MindsetForest" zamiast "Lovable App"
- Meta description: "Gamified productivity tracker - Do. Track. Level Up."
- og:title i twitter:title: "MindsetForest"
- Usunac komentarze TODO

---

## Pliki do modyfikacji


| Plik                               | Zmiana                         |
| ---------------------------------- | ------------------------------ |
| `src/pages/Auth.tsx`               | &nbsp;                         |
| `src/pages/ResetPassword.tsx`      | &nbsp;                         |
| `src/App.tsx`                      | Dodanie ErrorBoundary,         |
| `src/components/ErrorBoundary.tsx` | NOWY - globalny error boundary |
| `src/pages/NotFound.tsx`           | Restyling na ciemny motyw      |
| `src/hooks/useDashboardState.ts`   | Toast na bledy DB              |
| `src/hooks/useLadderState.ts`      | Toast na bledy DB              |
| `src/hooks/useOracleState.ts`      | Toast na bledy DB              |
| `src/hooks/useHabitLoopState.ts`   | Toast na bledy DB              |
| `src/lib/dashboard-data.ts`        | Uniwersalne domyslne misje     |
| `src/lib/oracle-data.ts`           | &nbsp;                         |
| `index.html`                       | Branding MindsetForest         |


## Kolejnosc implementacji

1. Bezpieczenstwo (Auth.tsx + ResetPassword + email verification)
2. Error Boundary + NotFound restyling
3. Toast errors w hookach
4. Personalizacja danych (dashboard-data, oracle-data, index.html)