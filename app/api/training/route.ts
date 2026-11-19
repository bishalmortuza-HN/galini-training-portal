import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { actorFor } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const actor = await actorFor(request);
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!["active","approved"].includes(actor.status)) return NextResponse.json({ error: "Your account is awaiting approval." }, { status: 403 });
  try {
    const courses = actor.role === "platform_admin"
      ? await sql`SELECT * FROM training_courses ORDER BY created_at DESC`
      : await sql`SELECT * FROM training_courses WHERE is_published=true ORDER BY created_at DESC`;
    const lessons = await sql`SELECT l.*, EXISTS(SELECT 1 FROM training_lesson_completions x WHERE x.lesson_id=l.id AND x.user_id=${actor.id}) AS completed FROM training_lessons l JOIN training_courses c ON c.id=l.course_id WHERE ${actor.role === "platform_admin"} OR (c.is_published=true AND l.is_published=true) ORDER BY l.course_id,l.sort_order`;
    const enrollments = actor.role === "platform_admin"
      ? await sql`SELECT e.*, c.title AS course_title, c.description AS course_description, c.category, c.duration_minutes, p.full_name AS member_name, p.email AS member_email, a.agency_name FROM training_enrollments e JOIN training_courses c ON c.id=e.course_id LEFT JOIN profiles p ON p.id=e.user_id LEFT JOIN agencies a ON a.id=e.agency_id ORDER BY e.enrolled_at DESC`
      : actor.role === "agency_admin"
      ? await sql`SELECT e.*, c.title AS course_title, c.description AS course_description, c.category, c.duration_minutes, p.full_name AS member_name, p.email AS member_email, a.agency_name FROM training_enrollments e JOIN training_courses c ON c.id=e.course_id LEFT JOIN profiles p ON p.id=e.user_id LEFT JOIN agencies a ON a.id=e.agency_id WHERE e.agency_id=${actor.agency_id} ORDER BY e.enrolled_at DESC`
      : await sql`SELECT e.*, c.title AS course_title, c.description AS course_description, c.category, c.duration_minutes FROM training_enrollments e JOIN training_courses c ON c.id=e.course_id WHERE e.user_id=${actor.id} ORDER BY e.enrolled_at DESC`;
    const results = await sql`SELECT * FROM training_results WHERE user_id=${actor.id} ORDER BY submitted_at DESC`;
    return NextResponse.json({ courses, lessons, enrollments, results });
  } catch (error: any) { return NextResponse.json({ error: "Training database is not ready. Apply both Neon migrations.", detail: error?.message }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  const actor = await actorFor(request);
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!["active","approved"].includes(actor.status)) return NextResponse.json({ error: "Account approval is required." }, { status: 403 });
  const body = await request.json().catch(() => null);
  try {
    if (body?.action === "create_course") {
      if (actor.role !== "platform_admin") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
      const title = String(body.title || "").trim();
      if (!title) return NextResponse.json({ error: "Course title is required." }, { status: 400 });
      const rows = await sql`INSERT INTO training_courses (title,description,category,level,duration_minutes,is_published,created_by) VALUES (${title},${String(body.description||"")},${String(body.category||"General")},${String(body.level||"Beginner")},${Math.max(1,Number(body.duration_minutes)||30)},${Boolean(body.is_published)},${actor.id}) RETURNING *`;
      return NextResponse.json({ course: rows[0] });
    }
    if (body?.action === "assign_course") {
      if (!["platform_admin","agency_admin"].includes(actor.role)) return NextResponse.json({ error: "Agency administrator access required." }, { status: 403 });
      const courseId = String(body.course_id||"");
      const ids = Array.isArray(body.user_ids) ? body.user_ids.map(String) : [];
      if (!courseId || !ids.length) return NextResponse.json({ error: "Choose a course and agents." }, { status: 400 });
      const course = await sql`SELECT id FROM training_courses WHERE id=${courseId} AND is_published=true`;
      if (!course.length) return NextResponse.json({ error: "Published course not found." }, { status: 404 });
      let count=0;
      for (const userId of ids) {
        const member = actor.role === "platform_admin"
          ? await sql`SELECT id,agency_id FROM profiles WHERE id=${userId} AND role='agent' AND status IN ('active','approved')`
          : await sql`SELECT id,agency_id FROM profiles WHERE id=${userId} AND agency_id=${actor.agency_id} AND role='agent' AND status IN ('active','approved')`;
        if (!member.length) continue;
        await sql`INSERT INTO training_enrollments (course_id,user_id,agency_id,assigned_by) VALUES (${courseId},${userId},${member[0].agency_id},${actor.id}) ON CONFLICT (course_id,user_id) DO NOTHING`;
        count++;
      }
      return NextResponse.json({ ok:true, assigned:count });
    }
    if (body?.action === "complete_lesson") {
      const lessonId=String(body.lesson_id||"");
      const lesson=await sql`SELECT l.id,l.course_id FROM training_lessons l JOIN training_courses c ON c.id=l.course_id WHERE l.id=${lessonId} AND l.is_published=true AND c.is_published=true`;
      if (!lesson.length) return NextResponse.json({error:"Lesson not found."},{status:404});
      const enrollment=await sql`SELECT id FROM training_enrollments WHERE course_id=${lesson[0].course_id} AND user_id=${actor.id}`;
      if (!enrollment.length) return NextResponse.json({error:"This lesson is not assigned to your account."},{status:403});
      const done=await sql`INSERT INTO training_lesson_completions (lesson_id,user_id) VALUES (${lessonId},${actor.id}) ON CONFLICT (lesson_id,user_id) DO NOTHING RETURNING id`;
      const totals=await sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM training_lesson_completions x WHERE x.lesson_id=l.id AND x.user_id=${actor.id}))::int AS completed FROM training_lessons l WHERE l.course_id=${lesson[0].course_id} AND l.is_published=true`;
      const percent=totals[0].total ? Math.round(totals[0].completed*100/totals[0].total) : 0;
      await sql`UPDATE training_enrollments SET progress_percent=${percent}, status=${percent===100?"completed":"in_progress"}, completed_at=CASE WHEN ${percent===100} THEN now() ELSE NULL END WHERE id=${enrollment[0].id}`;
      return NextResponse.json({ok:true,progress_percent:percent,already_completed:!done.length});
    }
    return NextResponse.json({ error: "Unknown training action." }, { status: 400 });
  } catch (error:any) { return NextResponse.json({error:error?.message||"Training action failed."},{status:503}); }
}
export async function PATCH(request: NextRequest) {
  const actor = await actorFor(request);
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (actor.role !== "platform_admin" || !["active","approved"].includes(actor.status)) return NextResponse.json({ error: "Only an active platform administrator can manually correct course progress. Agents must complete lessons to update progress." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const id=String(body?.enrollment_id||"");
  const progress=Math.max(0,Math.min(100,Number(body?.progress_percent)||0));
  if(!id) return NextResponse.json({error:"Enrollment is required."},{status:400});
  try {
    const rows=actor.role==="platform_admin"
      ? await sql`SELECT id,user_id,agency_id FROM training_enrollments WHERE id=${id}`
      : actor.role==="agency_admin"
      ? await sql`SELECT id,user_id,agency_id FROM training_enrollments WHERE id=${id} AND agency_id=${actor.agency_id}`
      : await sql`SELECT id,user_id,agency_id FROM training_enrollments WHERE id=${id} AND user_id=${actor.id}`;
    if(!rows.length) return NextResponse.json({error:"Training assignment not found or access denied."},{status:404});
    const status=progress===100?"completed":progress>0?"in_progress":"assigned";
    await sql`UPDATE training_enrollments SET progress_percent=${progress},status=${status},completed_at=CASE WHEN ${progress===100} THEN now() ELSE NULL END WHERE id=${id}`;
    return NextResponse.json({ok:true,status,progress_percent:progress});
  } catch(error:any){return NextResponse.json({error:error?.message||"Progress update failed."},{status:503});}
}
