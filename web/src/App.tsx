import { useEffect, useState, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Layout from "@/components/Layout";
import { Toaster } from "@/components/ui/toaster";
import { useTimetable } from "@/store/timetable";
import { loadDataset, listSessions, loadSessionPlacements, supabase } from "@/lib/supabase";
import AppLoader from "@/components/AppLoader";

// Each page is its own chunk so the first paint ships only what it needs. The
// timetable page in particular pulls in drag-and-drop and the scheduling grid,
// which no longer weigh down the dashboard, data pages, or first load.
const Dashboard    = lazy(() => import("@/pages/Dashboard"));
const Timetable    = lazy(() => import("@/pages/Timetable"));
const Courses      = lazy(() => import("@/pages/Courses"));
const FacultyPage  = lazy(() => import("@/pages/Faculty"));
const Rooms        = lazy(() => import("@/pages/Rooms"));
const StudentsPage = lazy(() => import("@/pages/Students"));
const HowToUse     = lazy(() => import("@/pages/HowToUse"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function AppInit({ onReady }: { onReady: () => void }) {
  const { setDataset, setPlacements, setSessions, setCurrentSession, semesterId } = useTimetable();

  useEffect(() => {
    let settled = false;
    const settle = () => { if (!settled) { settled = true; onReady(); } };

    const minDelay = new Promise<void>(res => setTimeout(res, 2000));

    Promise.all([
      loadDataset().then(ds => { if (ds) setDataset(ds); }),
      // Load the named sessions, open the most recent one (or one remembered
      // from last visit), and pull its placements + picks.
      listSessions().then(async sessions => {
        if (!sessions.length) return;
        setSessions(sessions);
        const remembered = localStorage.getItem("currentSessionId");
        const current = sessions.find(s => s.id === remembered) ?? sessions[0];
        setCurrentSession(current);
        const saved = await loadSessionPlacements(current.id);
        setPlacements(saved);
      }),
      minDelay,
    ])
      .catch(console.error)
      .finally(settle);

    // Don't block indefinitely if Supabase is slow. Show the app after 4 s.
    const fallback = setTimeout(settle, 4000);
    return () => clearTimeout(fallback);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps  -- run once on mount

  // Remember which session was open so a refresh returns to it.
  useEffect(() => {
    if (semesterId && semesterId !== "offline") {
      localStorage.setItem("currentSessionId", semesterId);
    }
  }, [semesterId]);

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
  }, [semesterId]); // eslint-disable-line react-hooks/exhaustive-deps  -- resubscribe only when the session changes

  return null;
}

// Shown briefly while a page's chunk loads on first navigation to it.
function PageFallback() {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
    </div>
  );
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
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route element={<Layout><Dashboard /></Layout>} path="/dashboard" />
            <Route element={<Layout><Timetable /></Layout>} path="/timetable" />
            <Route element={<Layout><Courses /></Layout>} path="/courses" />
            <Route element={<Layout><FacultyPage /></Layout>} path="/faculty" />
            <Route element={<Layout><Rooms /></Layout>} path="/classrooms" />
            <Route element={<Layout><StudentsPage /></Layout>} path="/students" />
            <Route element={<Layout><HowToUse /></Layout>} path="/how-to-use" />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
