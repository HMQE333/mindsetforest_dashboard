-- search_archive_blocks is SECURITY DEFINER and filters only by the
-- match_user_id it is given, so any caller could read any user's archive by
-- passing their id (a match_threshold of -1 returns every block). Its one
-- legitimate caller is the ai-embed-block edge function, which runs with the
-- service role and always passes the signed-in user's own id. Only the
-- service role may execute it.
REVOKE EXECUTE ON FUNCTION public.search_archive_blocks(public.vector, uuid, double precision, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_archive_blocks(public.vector, uuid, double precision, integer) TO service_role;
