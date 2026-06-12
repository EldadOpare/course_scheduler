import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Timetable from "@/pages/Timetable";
import Courses from "@/pages/Courses";
import FacultyPage from "@/pages/Faculty";
import Rooms from "@/pages/Rooms";
import StudentsPage from "@/pages/Students";
import { Toaster } from "@/components/ui/toaster";
import { useTimetable } from "@/store/timetable";
import { loadDataset, ensureDefaultSession, loadSessionPlacements, supabase } from "@/lib/supabase";
import AppLoader from "@/components/AppLoader";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function AppInit({ onReady }: { onReady: () => void }) {
  const { setDataset, setPlacements, setSemesterId, semesterId } = useTimetable();

  useEffect(() => {
    let settled = false;
    const settle = () => { if (!settled) { settled = true; onReady(); } };

    const minDelay = new Promise<void>(res => setTimeout(res, 2000));

    Promise.all([
      loadDataset().then(ds => { if (ds) setDataset(ds); }),
      ensureDefaultSession().then(async id => {
        setSemesterId(id);
        if (id !== "offline") {
          const saved = await loadSessionPlacements(id);
          if (saved.length) setPlacements(saved);
        }
      }),
      minDelay,
    ])
      .catch(console.error)
      .finally(settle);

    // Don't block indefinitely if Supabase is slow. Show the app after 4 s.
    const fallback = setTimeout(settle, 4000);
    return () => clearTimeout(fallback);
  }, []);

  // I subscribed to live placement changes so two people editing the
  // same timetable see each other's moves without refreshing.
  useEffect(() => {
    if (!semesterId || semesterId === "offline") return;
    const channel = supabase
      .channel(`placements:${semesterId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "placements",
          filter: `semester_id=eq.${semesterId}`,
        },
        () => {
          loadSessionPlacements(semesterId).then(saved => {
            if (saved.length) setPlacements(saved);
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [semesterId]);

  return null;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [loaderGone, setLoaderGone] = useState(false);

  const handleReady = () => {
    setReady(true);
    // let the fade-out animation finish before unmounting
    setTimeout(() => setLoaderGone(true), 480);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {!loaderGone && <AppLoader exiting={ready} />}
        <AppInit onReady={handleReady} />
        <Routes>
          <Route element={<Layout><Dashboard /></Layout>} path="/dashboard" />
          <Route element={<Layout><Timetable /></Layout>} path="/timetable" />
          <Route element={<Layout><Courses /></Layout>} path="/courses" />
          <Route element={<Layout><FacultyPage /></Layout>} path="/faculty" />
          <Route element={<Layout><Rooms /></Layout>} path="/classrooms" />
          <Route element={<Layout><StudentsPage /></Layout>} path="/students" />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
