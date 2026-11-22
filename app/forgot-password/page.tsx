"use client";
import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/auth/password-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not request a reset link.");
      setMessage(data.message || "If an account matches that email, a reset link will be sent shortly.");
    } catch (e: any) { setError(e.message || "Request failed."); }
    finally { setBusy(false); }
  }
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f3f6f2" }}>
    <section style={{ width: "100%", maxWidth: 440, background: "#fff", padding: 32, borderRadius: 18, boxShadow: "0 12px 40px rgba(20,50,35,.08)" }}>
      <p style={{ color: "#397052", fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>GALINI TRAINING PORTAL</p>
      <h1 style={{ color: "#18392c", fontSize: 28, margin: "12px 0" }}>Forgot your password?</h1>
      <p style={{ color: "#627168", lineHeight: 1.6 }}>Enter the email address on your account. If it matches an account, we will send a one-time reset link.</p>
      <form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 24 }}>
        <label style={{ display: "grid", gap: 7, color: "#243c30", fontWeight: 600 }}>Email address
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" style={{ padding: 12, border: "1px solid #cbd8ce", borderRadius: 9, font: "inherit" }} />
        </label>
        <button disabled={busy} style={{ padding: 13, border: 0, borderRadius: 9, color: "white", background: "#214f3c", fontWeight: 700, cursor: "pointer" }}>{busy ? "Sending…" : "Send reset link"}</button>
      </form>
      {message && <p role="status" style={{ marginTop: 18, color: "#21613f" }}>{message}</p>}
      {error && <p role="alert" style={{ marginTop: 18, color: "#a32e2e" }}>{error}</p>}
      <p style={{ marginTop: 22 }}><a href="/" style={{ color: "#245a40" }}>← Back to sign in</a></p>
    </section>
  </main>;
}
