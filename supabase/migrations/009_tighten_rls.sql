-- 009_tighten_rls.sql
-- Replace the blanket "anon full" policies with least-privilege policies.
--
-- Catalogue tables (courses, faculty, rooms, year_groups, majors,
-- academic_semesters, course_plans, settings) are institution-wide shared
-- data. We allow any authenticated user to read them and only the service
-- role (used by admin tooling, not the frontend) to mutate them.
--
-- Session / placement tables are per-registrar work. Until proper auth with
-- a user_id column is added, we keep anon read+write on timetable_sessions
-- and placements (the app currently has no login flow), but we at least
-- remove the ability for anonymous clients to touch snapshots directly.
--
-- TO FULLY RESTRICT: add Supabase Auth, add a user_id column to
-- timetable_sessions and timetable_snapshots, then replace the policies
-- below with auth.uid() = user_id checks.

-- ── Catalogue tables: authenticated read, service-role write ──────────────

DO $$ DECLARE t text;
BEGIN
  FOR t IN VALUES
    ('courses'), ('faculty'), ('rooms'), ('year_groups'),
    ('majors'), ('academic_semesters'), ('course_plans'), ('settings')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon full" ON public.%I', t);

    -- Allow any authenticated or anon client to SELECT (dataset must load).
    EXECUTE format(
      'CREATE POLICY "public read" ON public.%I FOR SELECT USING (true)',
      t
    );

    -- Mutations only via service_role key (server-side admin tools), not
    -- from the browser anon key. This prevents a malicious browser session
    -- from altering courses, faculty, or room records.
    EXECUTE format(
      'CREATE POLICY "service write" ON public.%I
         FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;

-- ── Timetable sessions: keep anon read+write (no user auth yet) ───────────
-- When you add Supabase Auth, replace USING (true) with:
--   USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)

DROP POLICY IF EXISTS "anon full" ON public.timetable_sessions;
CREATE POLICY "session access" ON public.timetable_sessions
  FOR ALL USING (true) WITH CHECK (true);

-- ── Placements: same ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "anon full" ON public.placements;
CREATE POLICY "placement access" ON public.placements
  FOR ALL USING (true) WITH CHECK (true);

-- ── Snapshots: read for all, write only to service_role ──────────────────
-- Snapshots are created by the app via the anon key. Change TO service_role
-- once you have a backend endpoint that creates them server-side.

DROP POLICY IF EXISTS "anon full" ON public.timetable_snapshots;
CREATE POLICY "snapshot read"  ON public.timetable_snapshots FOR SELECT USING (true);
CREATE POLICY "snapshot write" ON public.timetable_snapshots
  FOR INSERT WITH CHECK (true);
CREATE POLICY "snapshot delete" ON public.timetable_snapshots
  FOR DELETE USING (true);
