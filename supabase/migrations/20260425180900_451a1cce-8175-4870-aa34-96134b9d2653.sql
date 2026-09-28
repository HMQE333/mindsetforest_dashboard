
-- Seed test friends. Safe to re-run.
DO $$
DECLARE
  me uuid := '245580b9-fe2a-48c6-a9b7-c1bbc34a0647';
  luna uuid := '11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  kai  uuid := '22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  mira uuid := '33333333-cccc-4ccc-cccc-cccccccccccc';
BEGIN
  -- Insert into auth.users (minimal required fields for FK satisfaction)
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, email_change, email_change_token_new, recovery_token)
  VALUES
    (luna, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'luna.test@example.com', crypt('TestPass123!', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, '', '', '', ''),
    (kai,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kai.test@example.com',  crypt('TestPass123!', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, '', '', '', ''),
    (mira, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mira.test@example.com', crypt('TestPass123!', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, '', '', '', '')
  ON CONFLICT (id) DO NOTHING;

  -- Profiles (codes use only A-H J-N P-Z 2-9)
  INSERT INTO public.user_profiles (user_id, username, friend_code, display_name, avatar_emoji) VALUES
    (luna, 'luna_fox',  'LUNAFX', 'Luna Fox', '🦊'),
    (kai,  'kai_storm', 'KASTRM', 'Kai Storm', '⚡'),
    (mira, 'mira_sage', 'MRASGE', 'Mira Sage', '🌙')
  ON CONFLICT (user_id) DO NOTHING;

  -- Dashboard stats
  INSERT INTO public.dashboard_state (user_id, current_xp, current_level, streak_days, missions_completed) VALUES
    (luna, 340, 4, 7, 28),
    (kai, 1250, 13, 21, 142),
    (mira, 80, 1, 2, 6)
  ON CONFLICT DO NOTHING;

  -- 7-day activity for Luna
  INSERT INTO public.daily_completions (user_id, date, missions_completed, xp_earned, categories_engaged)
  SELECT luna, to_char(now() - (i || ' days')::interval, 'YYYY-MM-DD'),
         (random()*5)::int + 1, ((random()*50)::int + 10), ARRAY['mind','body']
  FROM generate_series(0,6) i
  ON CONFLICT DO NOTHING;

  -- 7-day activity for Kai
  INSERT INTO public.daily_completions (user_id, date, missions_completed, xp_earned, categories_engaged)
  SELECT kai, to_char(now() - (i || ' days')::interval, 'YYYY-MM-DD'),
         (random()*8)::int + 2, ((random()*80)::int + 30), ARRAY['mind','creation','body']
  FROM generate_series(0,6) i
  ON CONFLICT DO NOTHING;

  -- Friendships (skip if any direction already exists)
  IF NOT EXISTS (SELECT 1 FROM public.friendships WHERE (requester_id=luna AND recipient_id=me) OR (requester_id=me AND recipient_id=luna)) THEN
    INSERT INTO public.friendships (requester_id, recipient_id, status, share_from_requester, share_from_recipient, promises)
    VALUES (luna, me, 'accepted', true, true, '["Train Wing Chun 3x/week","Read 20 pages daily","No phone after 10pm"]'::jsonb);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.friendships WHERE (requester_id=kai AND recipient_id=me) OR (requester_id=me AND recipient_id=kai)) THEN
    INSERT INTO public.friendships (requester_id, recipient_id, status, share_from_requester, share_from_recipient, promises)
    VALUES (me, kai, 'accepted', false, true, '["Ship one feature per week","",""]'::jsonb);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.friendships WHERE (requester_id=mira AND recipient_id=me) OR (requester_id=me AND recipient_id=mira)) THEN
    INSERT INTO public.friendships (requester_id, recipient_id, status)
    VALUES (mira, me, 'pending');
  END IF;

  -- Task suggestions
  IF NOT EXISTS (SELECT 1 FROM public.friend_suggestions WHERE sender_id=luna AND recipient_id=me AND title='Try cold shower for 7 days') THEN
    INSERT INTO public.friend_suggestions (sender_id, recipient_id, title, note, source, status)
    VALUES (luna, me, 'Try cold shower for 7 days', 'Game changer for morning energy. Start at 30 seconds.', 'planning', 'pending');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.friend_suggestions WHERE sender_id=kai AND recipient_id=me AND title='Read Atomic Habits chapter 3') THEN
    INSERT INTO public.friend_suggestions (sender_id, recipient_id, title, note, source, status)
    VALUES (kai, me, 'Read Atomic Habits chapter 3', 'The part about habit stacking will help your morning routine.', 'planning', 'pending');
  END IF;
END $$;
