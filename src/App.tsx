import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { Game } from "./components/Game";
import { SignIn } from "./components/SignIn";
import { supabase } from "./lib/supabase";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabase) return <Game userId={null} />; // no env vars: device-only mode
  if (!ready) return null;
  if (!session) return <SignIn />;
  return <Game key={session.user.id} userId={session.user.id} onSignOut={() => void supabase!.auth.signOut()} />;
}
