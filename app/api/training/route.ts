import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function clients() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_galiniSUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_galiniSUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !anon || !service) return null;
  return {
    auth: createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } }),
    admin: createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  };
}

async function actorFor(request: NextRequest) {
  const c = clients();
  if (!c) return { error: "Server-side Supabase configuration is incomplete.", status: 503 as const };
  const token = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "");
  if (!token) return { error: "Sign in required.", status: 401 as const };
  const { data, error } = await c.auth.auth.getUser(token);
  if (error || !data.user) return { error: "Session expired. Please sign in again.", status: 401 as const };
  const { data: profile, error: profileError } = await c.admin.from("profiles")
    .select("id,role,status,agency_id").eq("id", data.user.id).maybeSingle();
  if (profileError || !profile) return { error: "Galini profile not found.", status: 403 as const };
  if (!["active","approved"].includes(profile.status || "")) return { error: "Your account is awaiting approval.", status: 403 as const };
  return { c, user: data.user, profile };
}

export async function GET(request: NextRequest) {
  const actor = await actorFor(request);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { admin } = actor.c;
  const role = actor.profile.role;
  let courses = admin.from("training_courses").select("*").order("created_at", { ascending: false });
  if (role !== "platform_admin") courses = courses.eq("is_published", true);
  const { data: courseRows, error: courseError } = await courses;
  if (courseError) return NextResponse.json({ error: "Training tables are not ready. Run the Galini training migration in Supabase.", detail: courseError.message }, { status: 503 });

  let enrollments = admin.from("training_enrollments").select("*,training_courses(title,description,category,level,duration_minutes,content_url)");
  if (role !== "platform_admin") {
    if (role === "agency_admin" && actor.profile.agency_id) enrollments = enrollments.eq("agency_id", actor.profile.agency_id);
    else enrollments = enrollments.eq("user_id", actor.user.id);
  }
  const { data: enrollmentRows, error: enrollmentError } = await enrollments.order("enrolled_at", { ascending: false });
  if (enrollmentError) return NextResponse.json({ error: enrollmentError.message }, { status: 503 });
  return NextResponse.json({ courses: courseRows || [], enrollments: enrollmentRows || [] });
}

export async function POST(request: NextRequest) {
  const actor = await actorFor(request);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { admin } = actor.c;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  if (body.action === "create_course") {
    if (actor.profile.role !== "platform_admin") return NextResponse.json({ error: "Only platform administrators can create courses." }, { status: 403 });
    const title = String(body.title || "").trim();
    if (!title) return NextResponse.json({ error: "Course title is required." }, { status: 400 });
    const { data, error } = await admin.from("training_courses").insert({
      title, description: String(body.description || ""), category: String(body.category || "General"),
      level: String(body.level || "All levels"), duration_minutes: Math.max(1, Number(body.duration_minutes) || 30),
      content_url: body.content_url ? String(body.content_url) : null, is_published: Boolean(body.is_published),
      created_by: actor.user.id
    }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ course: data });
  }

  if (body.action === "assign_course") {
    const role = actor.profile.role;
    if (!["platform_admin","agency_admin"].includes(role)) return NextResponse.json({ error: "You do not have permission to assign training." }, { status: 403 });
    const courseId = String(body.course_id || "");
    const userIds = Array.isArray(body.user_ids) ? body.user_ids.map(String) : [];
    if (!courseId || !userIds.length) return NextResponse.json({ error: "Choose a course and at least one agent." }, { status: 400 });
    if (role === "agency_admin") {
      const { data: members, error } = await admin.from("profiles").select("id").eq("agency_id", actor.profile.agency_id).in("id", userIds);
      if (error || (members || []).length !== userIds.length) return NextResponse.json({ error: "You can only assign training to members of your agency." }, { status: 403 });
    }
    const { data: course, error: courseError } = await admin.from("training_courses").select("id").eq("id", courseId).maybeSingle();
    if (courseError || !course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    const rows = userIds.map(user_id => ({ course_id: courseId, user_id, agency_id: actor.profile.role === "agency_admin" ? actor.profile.agency_id : body.agency_id || null, assigned_by: actor.user.id }));
    const { error } = await admin.from("training_enrollments").upsert(rows, { onConflict: "course_id,user_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, assigned: rows.length });
  }
  return NextResponse.json({ error: "Unknown training action." }, { status: 400 });
}

export async function PATCH(request: NextRequest) {
  const actor = await actorFor(request);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = await request.json().catch(() => null);
  const enrollmentId = String(body?.enrollment_id || "");
  const progress = Math.min(100, Math.max(0, Number(body?.progress_percent) || 0));
  if (!enrollmentId) return NextResponse.json({ error: "Enrollment is required." }, { status: 400 });
  const { admin } = actor.c;
  const { data: enrollment, error: lookupError } = await admin.from("training_enrollments").select("id,user_id,agency_id").eq("id", enrollmentId).maybeSingle();
  if (lookupError || !enrollment) return NextResponse.json({ error: "Training assignment not found." }, { status: 404 });
  if (actor.profile.role !== "platform_admin" && enrollment.user_id !== actor.user.id &&
      !(actor.profile.role === "agency_admin" && actor.profile.agency_id === enrollment.agency_id)) {
    return NextResponse.json({ error: "You cannot update this training record." }, { status: 403 });
  }
  const status = progress >= 100 ? "completed" : progress > 0 ? "in_progress" : "assigned";
  const { error } = await admin.from("training_enrollments").update({
    progress_percent: progress, status, completed_at: progress >= 100 ? new Date().toISOString() : null
  }).eq("id", enrollmentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, status, progress_percent: progress });
}
