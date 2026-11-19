"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";

type Profile = { id: string; full_name?: string | null; email?: string | null; role?: string | null; agent_code?: string | null; agency_id?: string | null; status?: string | null };
type Agency = { id: string; agency_name?: string | null; agency_code?: string | null; status?: string | null; membership_status?: string | null; plan?: string | null };
type Result = { id: string; course_name?: string | null; score?: number | null; status?: string | null; created_at?: string | null };

const labelRole = (role?: string | null) => role === "platform_admin" ? "Platform administrator" : role === "agency_admin" ? "Agency administrator" : "Training agent";
const nice = (value?: string | null) => value ? value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()) : "Pending";

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sessionReady, setSessionReady] = useState(false);

  const loadWorkspace = useCallback(async (userId: string) => {
    if (!supabase) return;
    const p = await supabase.from("profiles").select("id,full_name,email,role,agent_code,agency_id,status").eq("id", userId).maybeSingle();
    if (p.error) { setMessage("Signed in, but the profile could not be loaded: " + p.error.message); return; }
    const current = p.data as Profile | null;
    setProfile(current);
    if (!current) { setMessage("Your account is signed in, but no Galini profile exists yet. Please contact the site administrator."); return; }
    if (current.agency_id) {
      const a = await supabase.from("agencies").select("id,agency_name,agency_code,status,membership_status,plan").eq("id", current.agency_id).maybeSingle();
      setAgency((a.data as Agency | null) || null);
    }
    if (current.role === "platform_admin") {
      const [a, u] = await Promise.all([
        supabase.from("agencies").select("id,agency_name,agency_code,status,membership_status,plan").order("agency_name"),
        supabase.from("profiles").select("id,full_name,email,role,agent_code,agency_id,status").order("full_name")
      ]);
      setAgencies((a.data as Agency[]) || []);
      setPeople((u.data as Profile[]) || []);
    } else if (current.role === "agency_admin" && current.agency_id) {
      const u = await supabase.from("profiles").select("id,full_name,email,role,agent_code,agency_id,status").eq("agency_id", current.agency_id).order("full_name");
      setPeople((u.data as Profile[]) || []);
    } else {
      const r = await supabase.from("training_results").select("id,course_name,score,status,created_at").eq("user_id", userId).order("created_at", { ascending: false });
      setResults((r.data as Result[]) || []);
    }
  }, []);

  useEffect(() => {
    if (!supabase) { setSessionReady(true); return; }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) void loadWorkspace(data.session.user.id);
      setSessionReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) void loadWorkspace(session.user.id);
      else { setProfile(null); setAgency(null); setAgencies([]); setPeople([]); setResults([]); }
    });
    return () => listener.subscription.unsubscribe();
  }, [loadWorkspace]);

  const pendingAgencies = useMemo(() => agencies.filter(a => (a.status || a.membership_status) === "pending").length, [agencies]);
  const pendingPeople = useMemo(() => people.filter(p => p.status === "pending" && p.role !== "platform_admin").length, [people]);

  async function authenticate(e: FormEvent) {
    e.preventDefault(); if (!supabase) return;
    setBusy(true); setMessage("");
    const response = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (response.error) setMessage(response.error.message);
    else if (mode === "signup" && !response.data.session) setMessage("Registration received. Check your email to verify your account, then sign in.");
    else setMessage(mode === "signup" ? "Account created. Your Galini access may require administrator approval." : "Welcome back.");
    setBusy(false);
  }

  async function signOut() { await supabase?.auth.signOut(); setProfile(null); setMessage("You have signed out."); }
  async function approve(kind: "agency" | "profile", id: string) {
    const { data } = await supabase?.auth.getSession() || { data: { session: null } };
    const token = data.session?.access_token;
    if (!token) { setMessage("Please sign in again."); return; }
    setBusy(true); setMessage("");
    const response = await fetch("/api/admin/approve", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ kind, id }) });
    const payload = await response.json();
    setMessage(response.ok ? "Approval saved." : (payload.error || "Approval could not be saved."));
    if (response.ok && profile) await loadWorkspace(profile.id);
    setBusy(false);
  }

  if (!sessionReady) return <main className="center"><div className="loader" />Loading Galini…</main>;
  if (!profile) return <main className="authShell">
    <section className="authIntro"><div className="brand"><span className="brandMark">G</span> GALINI <span className="brandSub">LEARNING</span></div><div className="introCopy"><p className="eyebrow">ONE PORTAL. EVERY STEP FORWARD.</p><h1>Build stronger agencies through better training.</h1><p>One secure workspace for agency approvals, memberships, learning, and progress tracking.</p></div><div className="introFoot">Galini Training Portal · {new Date().getFullYear()}</div></section>
    <section className="authPanel"><div className="authCard"><p className="eyebrow">YOUR TRAINING WORKSPACE</p><h2>{mode === "signin" ? "Welcome back" : "Create your account"}</h2><p className="muted">Sign in to continue to your Galini dashboard.</p>
      {!hasSupabaseConfig && <div className="notice error">Supabase is not configured for this deployment. Add the existing Galini Supabase URL and anon key to the Vercel project environment.</div>}
      <form onSubmit={authenticate} className="form">
        {mode === "signup" && <label>Full name<input value={fullName} onChange={e => setFullName(e.target.value)} required placeholder="Your full name" /></label>}
        <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@agency.com" /></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="Enter your password" /></label>
        <button className="primary full" disabled={busy || !hasSupabaseConfig}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button>
      </form>
      <p className="switchMode">{mode === "signin" ? "New to Galini?" : "Already registered?"} <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }}>{mode === "signin" ? "Create an account" : "Sign in"}</button></p>
      {message && <div className="notice">{message}</div>}
    </div></section>
  </main>;

  const isAdmin = profile.role === "platform_admin";
  const isAgency = profile.role === "agency_admin";
  const title = tab === "overview" ? "Overview" : tab === "members" ? "People & access" : tab === "agencies" ? "Agency approvals" : tab === "learning" ? "My learning" : "Payments";
  return <main className="appShell">
    <aside className="sidebar"><div className="brand"><span className="brandMark">G</span><span>GALINI<small>TRAINING PORTAL</small></span></div><div className="workspaceTag">WORKSPACE</div><nav>
      <button className={tab === "overview" ? "navItem active" : "navItem"} onClick={() => setTab("overview")}>▦ <span>Overview</span></button>
      {(isAdmin || isAgency) && <button className={tab === "members" ? "navItem active" : "navItem"} onClick={() => setTab("members")}>♙ <span>People & access</span></button>}
      {isAdmin && <button className={tab === "agencies" ? "navItem active" : "navItem"} onClick={() => setTab("agencies")}>▤ <span>Agencies</span>{pendingAgencies > 0 && <b>{pendingAgencies}</b>}</button>}
      {!isAdmin && !isAgency && <button className={tab === "learning" ? "navItem active" : "navItem"} onClick={() => setTab("learning")}>▣ <span>My learning</span></button>}
      {isAdmin && <button className={tab === "payments" ? "navItem active" : "navItem"} onClick={() => setTab("payments")}>＄ <span>Payments</span></button>}
    </nav><div className="sideBottom"><div className="helpBox"><strong>Need help?</strong><p>Contact your Galini portal administrator for account or training support.</p></div><button className="signout" onClick={signOut}>↪ Sign out</button></div></aside>
    <section className="mainArea"><header className="topbar"><div><span className="crumb">GALINI /</span> {title}</div><div className="userPill"><span className="avatar">{(profile.full_name || profile.email || "G").slice(0,1).toUpperCase()}</span><span><strong>{profile.full_name || profile.email}</strong><small>{labelRole(profile.role)}</small></span></div></header>
      <div className="content"><div className="pageHeading"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>{isAdmin ? "Good to see you, Admin." : `Welcome, ${profile.full_name?.split(" ")[0] || "there"}.`}</h1><p className="muted">{isAdmin ? "Manage Galini memberships, agency access, and training activity from one place." : "Your training and agency activity, all in one place."}</p></div><span className={profile.status === "active" || profile.status === "approved" ? "status active" : "status pending"}>{nice(profile.status)}</span></div>
      {message && <div className="notice">{message}</div>}
      {profile.status !== "active" && profile.status !== "approved" && <div className="notice warning">Your account is awaiting approval. Some portal features may remain unavailable until an administrator activates your access.</div>}
      {tab === "overview" && <>
        <div className="statGrid">
          <article className="statCard"><span className="statIcon violet">▤</span><p>{isAdmin ? "Agencies" : "Agency"}</p><strong>{isAdmin ? agencies.length : agency?.agency_name || "Not assigned"}</strong><small>{isAdmin ? `${pendingAgencies} awaiting approval` : agency?.agency_code || "Contact your administrator"}</small></article>
          <article className="statCard"><span className="statIcon blue">♙</span><p>{isAdmin || isAgency ? "People" : "My status"}</p><strong>{isAdmin || isAgency ? people.length : nice(profile.status)}</strong><small>{isAdmin || isAgency ? `${pendingPeople} pending approval` : "Account access"}</small></article>
          <article className="statCard"><span className="statIcon green">✓</span><p>Training records</p><strong>{isAdmin || isAgency ? "—" : results.length}</strong><small>{isAdmin || isAgency ? "Progress overview" : "Your recorded activity"}</small></article>
          <article className="statCard"><span className="statIcon amber">◇</span><p>Membership plan</p><strong>{agency?.plan || "—"}</strong><small>{nice(agency?.membership_status || agency?.status)}</small></article>
        </div>
        {isAdmin && <section className="panel"><div className="panelHead"><div><h3>Needs your attention</h3><p>Review new access requests.</p></div><span className="count">{pendingAgencies + pendingPeople} pending</span></div><div className="attentionGrid"><button onClick={() => setTab("agencies")}><span className="attentionIcon">▤</span><span><strong>{pendingAgencies} agencies</strong><small>Waiting for approval</small></span><b>→</b></button><button onClick={() => setTab("members")}><span className="attentionIcon">♙</span><span><strong>{pendingPeople} people</strong><small>Waiting for approval</small></span><b>→</b></button></div></section>}
        {(isAgency || isAdmin) && <section className="panel"><div className="panelHead"><div><h3>{isAdmin ? "Recently registered agencies" : "Your agency team"}</h3><p>{isAdmin ? "Agency membership and access status." : "People connected to your agency."}</p></div><button className="textButton" onClick={() => setTab(isAdmin ? "agencies" : "members")}>View all →</button></div><div className="tableWrap"><table><thead><tr><th>{isAdmin ? "Agency" : "Name"}</th><th>Code / email</th><th>Status</th></tr></thead><tbody>{(isAdmin ? agencies.slice(0,5) : people.slice(0,5)).map((item: any) => <tr key={item.id}><td>{item.agency_name || item.full_name || "—"}</td><td>{item.agency_code || item.email || "—"}</td><td><span className="miniStatus">{nice(item.status || item.membership_status)}</span></td></tr>)}{(isAdmin ? agencies : people).length === 0 && <tr><td colSpan={3} className="empty">No records found yet.</td></tr>}</tbody></table></div></section>}
        {!isAdmin && !isAgency && <section className="panel"><div className="panelHead"><div><h3>Continue your learning</h3><p>Your completed and in-progress training records.</p></div><button className="textButton" onClick={() => setTab("learning")}>View activity →</button></div><div className="emptyState">Your training activity will appear here as you complete courses assigned by your agency.</div></section>}
      </>}
      {tab === "agencies" && isAdmin && <section className="panel"><div className="panelHead"><div><h3>Agency membership requests</h3><p>Approve agencies to grant access to the Galini training workspace.</p></div></div><div className="tableWrap"><table><thead><tr><th>Agency</th><th>Agency code</th><th>Plan</th><th>Status</th><th>Action</th></tr></thead><tbody>{agencies.map(a => <tr key={a.id}><td>{a.agency_name || "Unnamed agency"}</td><td>{a.agency_code || "—"}</td><td>{a.plan || "—"}</td><td><span className="miniStatus">{nice(a.status || a.membership_status)}</span></td><td>{(a.status || a.membership_status) === "pending" ? <button className="smallPrimary" disabled={busy} onClick={() => approve("agency",a.id)}>Approve</button> : "—"}</td></tr>)}{agencies.length === 0 && <tr><td colSpan={5} className="empty">No agencies found.</td></tr>}</tbody></table></div></section>}
      {tab === "members" && (isAdmin || isAgency) && <section className="panel"><div className="panelHead"><div><h3>{isAdmin ? "All portal members" : "Agency team members"}</h3><p>{isAdmin ? "Review account access and agent membership." : "Monitor agents connected to your agency."}</p></div></div><div className="tableWrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Agent code</th><th>Status</th><th>Action</th></tr></thead><tbody>{people.map(p => <tr key={p.id}><td>{p.full_name || "—"}</td><td>{p.email || "—"}</td><td>{nice(p.role)}</td><td>{p.agent_code || "—"}</td><td><span className="miniStatus">{nice(p.status)}</span></td><td>{isAdmin && p.status === "pending" && p.role !== "platform_admin" ? <button className="smallPrimary" disabled={busy} onClick={() => approve("profile",p.id)}>Approve</button> : "—"}</td></tr>)}{people.length === 0 && <tr><td colSpan={6} className="empty">No members found.</td></tr>}</tbody></table></div></section>}
      {tab === "learning" && !isAdmin && !isAgency && <section className="panel"><div className="panelHead"><div><h3>My training activity</h3><p>Course results recorded for your account.</p></div></div><div className="tableWrap"><table><thead><tr><th>Course</th><th>Score</th><th>Status</th><th>Date</th></tr></thead><tbody>{results.map(r => <tr key={r.id}><td>{r.course_name || "Training activity"}</td><td>{r.score ?? "—"}</td><td>{nice(r.status)}</td><td>{r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}</td></tr>)}{results.length === 0 && <tr><td colSpan={4} className="empty">No training records are available yet.</td></tr>}</tbody></table></div></section>}
      {tab === "payments" && isAdmin && <section className="panel"><div className="panelHead"><div><h3>Membership payments</h3><p>Payment review will appear here once the Galini payment records table and payment workflow are confirmed.</p></div></div><div className="emptyState">No payment records are connected yet. This area is intentionally read-only until the payment data source is verified; no payment will be marked paid automatically.</div></section>}
      <footer className="footer">Galini Training Portal <span>Secure role-based workspace</span></footer></div>
    </section>
  </main>;
}