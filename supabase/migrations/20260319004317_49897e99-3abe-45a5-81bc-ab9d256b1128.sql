-- Create cooking_recipes table for the recipe journal
CREATE TABLE public.cooking_recipes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  ingredients TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  rating INTEGER,
  servings INTEGER NOT NULL DEFAULT 4,
  cook_time TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'tried',
  cost_per_serving NUMERIC,
  ai_processed_content TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cooking_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recipes" ON public.cooking_recipes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own recipes" ON public.cooking_recipes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own recipes" ON public.cooking_recipes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own recipes" ON public.cooking_recipes FOR DELETE USING (auth.uid() = user_id);

-- Create cooking_plan_entries table for the meal planner calendar
CREATE TABLE public.cooking_plan_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  recipe_id UUID REFERENCES public.cooking_recipes(id) ON DELETE SET NULL,
  plan_date TEXT NOT NULL,
  meal_type TEXT NOT NULL DEFAULT 'dinner',
  custom_label TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cooking_plan_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plan entries" ON public.cooking_plan_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own plan entries" ON public.cooking_plan_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own plan entries" ON public.cooking_plan_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own plan entries" ON public.cooking_plan_entries FOR DELETE USING (auth.uid() = user_id);

-- Create ingredient_costs table for cost tracking per ingredient
CREATE TABLE public.cooking_ingredient_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ingredient_name TEXT NOT NULL,
  cost_per_unit NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'g',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, ingredient_name)
);

ALTER TABLE public.cooking_ingredient_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ingredient costs" ON public.cooking_ingredient_costs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ingredient costs" ON public.cooking_ingredient_costs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ingredient costs" ON public.cooking_ingredient_costs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ingredient costs" ON public.cooking_ingredient_costs FOR DELETE USING (auth.uid() = user_id);

-- Timestamps trigger function
CREATE OR REPLACE FUNCTION public.update_cooking_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_cooking_recipes_updated_at
BEFORE UPDATE ON public.cooking_recipes
FOR EACH ROW EXECUTE FUNCTION public.update_cooking_updated_at();

CREATE TRIGGER update_cooking_ingredient_costs_updated_at
BEFORE UPDATE ON public.cooking_ingredient_costs
FOR EACH ROW EXECUTE FUNCTION public.update_cooking_updated_at();