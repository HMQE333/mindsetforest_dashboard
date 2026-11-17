-- Prep boxes for a recipe: the ingredients laid out into numbered boxes
-- (box 1 goes in first, then 2...), so cooking is "add box 1, then box 2".
-- { "count": 4, "labels": ["", ...], "assign": { "<ingredient line, normalised>": 0..count-1 } }
ALTER TABLE public.cooking_recipes ADD COLUMN IF NOT EXISTS boxes jsonb;
