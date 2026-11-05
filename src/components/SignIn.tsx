import { useState } from "react";
import { supabase } from "../lib/supabase";

// Magic-link sign-in. One account; the session is remembered on this device.
export function SignIn() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !email.trim()) return;
    setBusy(true);
    setMsg("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    setMsg(error ? error.message : "Check your email for a sign-in link.");
  };

  return (
    <div className="signin">
      <form className="signin-card" onSubmit={send}>
        <h1>Two Paths</h1>
        <p className="note">Sign in to load your character.</p>
        <label>
          Email
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <button className="btn primary" disabled={busy}>
          {busy ? "Sending…" : "Send sign-in link"}
        </button>
        {msg && <p className="note">{msg}</p>}
      </form>
    </div>
  );
}
