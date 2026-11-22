"use client";
import { FormEvent, useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setToken(new URLSearchParams(window.location.search).get("token") || ""); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage(""); setError("");
    if (password !== confirm) { setError("The passwords do not match."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not reset the password.");
      setMessage(data.message || "Password reset successful.");
    } catch (e: any) { setError(e.message || "Reset failed."); }
    finally { setBusy(false); }
  }
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f3f6f2" }}>
    <section style={{ width: "100%", maxWidth: 440, background: "#fff", padding: 32, borderRadius: 18, boxShadow: "0 12px 40px rgba(20,50,35,.08)" }}>
      <p style={{ color: "#397052", fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>GALINI TRAINING PORTAL</p>
      <h1 style={{ color: "#18392c", fontSize: 28, margin: "12px 0" }}>Create a new password</h1>
      {!token ? <p role="alert" style={{ color: "#a32e2e" }}>This reset link is missing or invalid. Request a new link.</p> : <form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 24 }}>
        <label style={{ display: "grid", gap: 7, color: "#243c30", fontWeight: 600 }}>New password
          <input type="password" required minLength={10} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" style={{ padding: 12, border: "1px solid #cbd8ce", borderRadius: 9, font: "inherit" }} />
        </label>
        <label style={{ display: "grid", gap: 7, color: "#243c30", fontWeight: 600 }}>Confirm new password
          <input type="password" required minLength={10} maxLength={128} value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" style={{ padding: 12, border: "1px solid #cbd8ce", borderRadius: 9, font: "inherit" }} />
        </label>
        <button disabled={busy} style={{ padding: 13, border: 0, borderRadius: 9, color: "white", background: "#214f3c", fontWeight: 700, cursor: "pointer" }}>{busy ? "Updating…" : "Reset password"}</button>
      </form>}
      {message && <p role="status" style={{ marginTop: 18, color: "#21613f" }}>{message}</p>}
      {error && <p role="alert" style={{ marginTop: 18, color: "#a32e2e" }}>{error}</p>}
      <p style={{ marginTop: 22 }}><a href="/" style={{ color: "#245a40" }}>← Back to sign in</a></p>
    </section>
  </main>;
}
