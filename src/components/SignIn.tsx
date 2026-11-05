import { useState } from "react";
import { supabase } from "../lib/supabase";

// Email + password. Sign-ups are restricted to the owner's email in the database,
// so "Create account" only works once, for you. The session is remembered on this device.
export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMsg("");
    const creds = { email: email.trim(), password };
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword(creds);
      if (error) setMsg(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp(creds);
      if (error) setMsg(error.message.includes("Database error") ? "Sign-ups are closed." : error.message);
      else if (!data.session) setMsg("Account created. Confirm the email Supabase sent you, then sign in.");
    }
    setBusy(false);
  };

  return (
    <div className="signin">
      <form className="signin-card" onSubmit={submit}>
        <h1>Two Paths</h1>
        <p className="note">{mode === "in" ? "Sign in to load your character." : "Create your account (first time only)."}</p>
        <label>
          Email
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button className="btn primary" disabled={busy}>
          {busy ? "…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
        <button type="button" className="btn sm" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(""); }}>
          {mode === "in" ? "First time? Create account" : "Have an account? Sign in"}
        </button>
        {msg && <p className="note">{msg}</p>}
      </form>
    </div>
  );
}
