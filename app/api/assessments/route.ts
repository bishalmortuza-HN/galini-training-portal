import {NextRequest,NextResponse} from "next/server";
import {randomBytes} from "node:crypto";
import {sql} from "@/lib/db";
import {actorFor} from "@/lib/auth";
import {hasPaidAccess,paymentRequiredResponse} from "@/lib/membership-access";

type Question={prompt:string;choices:string[];correct:number;explanation?:string};

export async function GET(req:NextRequest){
 const a=await actorFor(req);
 if(!a)return NextResponse.json({error:"Sign in required."},{status:401});
 if(!["active","approved"].includes(a.status))return NextResponse.json({error:"Your account is awaiting approval."},{status:403});
 if(!(await hasPaidAccess(a)))return NextResponse.json(paymentRequiredResponse(),{status:402});
 try{
  const rows=a.role==="platform_admin"
   ?await sql`SELECT id,course_id,title,instructions,passing_score,questions FROM training_assessments WHERE is_published=true ORDER BY title`
   :a.role==="agency_admin"
   ?await sql`SELECT DISTINCT x.id,x.course_id,x.title,x.instructions,x.passing_score,x.questions FROM training_assessments x JOIN training_enrollments e ON e.course_id=x.course_id JOIN profiles p ON p.id=e.user_id WHERE p.agency_id=${a.agency_id} AND x.is_published=true ORDER BY x.title`
   :await sql`SELECT DISTINCT x.id,x.course_id,x.title,x.instructions,x.passing_score,x.questions FROM training_assessments x JOIN training_enrollments e ON e.course_id=x.course_id WHERE e.user_id=${a.id} AND x.is_published=true ORDER BY x.title`;
  const assessments=rows.map((r:any)=>({...r,questions:(r.questions as Question[]).map(q=>({prompt:q.prompt,choices:q.choices}))}));
  const certificates=a.role==="platform_admin"
   ?await sql`SELECT c.id,c.certificate_code,c.issued_at,p.full_name,p.email,t.title AS course_title FROM training_certificates c JOIN profiles p ON p.id=c.user_id JOIN training_courses t ON t.id=c.course_id ORDER BY c.issued_at DESC`
   :a.role==="agency_admin"
   ?await sql`SELECT c.id,c.certificate_code,c.issued_at,p.full_name,p.email,t.title AS course_title FROM training_certificates c JOIN profiles p ON p.id=c.user_id JOIN training_courses t ON t.id=c.course_id WHERE p.agency_id=${a.agency_id} ORDER BY c.issued_at DESC`
   :await sql`SELECT c.id,c.certificate_code,c.issued_at,t.title AS course_title FROM training_certificates c JOIN training_courses t ON t.id=c.course_id WHERE c.user_id=${a.id} ORDER BY c.issued_at DESC`;
  const attempts=a.role==="platform_admin"
   ?await sql`SELECT x.id,x.score,x.passed,x.submitted_at,p.full_name,p.email,g.agency_name,t.title AS course_title,q.title AS assessment_title,q.passing_score FROM training_assessment_attempts x JOIN profiles p ON p.id=x.user_id JOIN training_assessments q ON q.id=x.assessment_id JOIN training_courses t ON t.id=q.course_id LEFT JOIN agencies g ON g.id=p.agency_id ORDER BY x.submitted_at DESC`
   :a.role==="agency_admin"
   ?await sql`SELECT x.id,x.score,x.passed,x.submitted_at,x.user_id,p.full_name,p.email,g.agency_name,t.title AS course_title,q.title AS assessment_title,q.passing_score FROM training_assessment_attempts x JOIN profiles p ON p.id=x.user_id JOIN training_assessments q ON q.id=x.assessment_id JOIN training_courses t ON t.id=q.course_id LEFT JOIN agencies g ON g.id=p.agency_id WHERE p.agency_id=${a.agency_id} ORDER BY x.submitted_at DESC`
   :await sql`SELECT x.id,x.score,x.passed,x.submitted_at,t.title AS course_title,q.title AS assessment_title,q.passing_score FROM training_assessment_attempts x JOIN training_assessments q ON q.id=x.assessment_id JOIN training_courses t ON t.id=q.course_id WHERE x.user_id=${a.id} ORDER BY x.submitted_at DESC`;
  return NextResponse.json({assessments,certificates,attempts});
 }catch(e:any){return NextResponse.json({error:e?.message||"Assessments are not ready."},{status:503});}
}

export async function POST(req:NextRequest){
 const a=await actorFor(req);
 if(!a)return NextResponse.json({error:"Sign in required."},{status:401});
 if(!["active","approved"].includes(a.status))return NextResponse.json({error:"Account approval is required."},{status:403});
 if(!(await hasPaidAccess(a)))return NextResponse.json(paymentRequiredResponse(),{status:402});
 const b=await req.json().catch(()=>null);
 if(!b?.assessment_id||!b?.answers||typeof b.answers!=="object")return NextResponse.json({error:"Complete the exam before submitting."},{status:400});
 try{
  const found=await sql`SELECT id,course_id,title,passing_score,questions FROM training_assessments WHERE id=${b.assessment_id} AND is_published=true`;
  if(!found.length)return NextResponse.json({error:"Assessment not found."},{status:404});
  const assessment=found[0],questions=assessment.questions as Question[];
  const enrolled=await sql`SELECT id,progress_percent FROM training_enrollments WHERE course_id=${assessment.course_id} AND user_id=${a.id}`;
  if(!enrolled.length&&!["platform_admin","agency_admin"].includes(a.role))return NextResponse.json({error:"This assessment is only available to assigned learners."},{status:403});
  const answered=questions.every((q,i)=>b.answers[String(i)]!==undefined&&b.answers[String(i)]!==""&&Number.isInteger(Number(b.answers[String(i)]))&&Number(b.answers[String(i)])>=0&&Number(b.answers[String(i)])<q.choices.length);
  if(!answered)return NextResponse.json({error:"Answer every question before submitting the exam."},{status:400});
  let correct=0;
  questions.forEach((q,i)=>{if(Number(b.answers[String(i)])===q.correct)correct++;});
  const score=Math.round(correct*100/Math.max(questions.length,1));
  const passed=score>=Number(assessment.passing_score);
  await sql`INSERT INTO training_assessment_attempts(assessment_id,user_id,answers,score,passed) VALUES(${assessment.id},${a.id},${JSON.stringify(b.answers)}::jsonb,${score},${passed})`;
  let certificate=null;
  if(passed&&enrolled.length&&Number(enrolled[0].progress_percent)===100){
   const code="GAL-"+randomBytes(5).toString("hex").toUpperCase();
   const issued=await sql`INSERT INTO training_certificates(user_id,course_id,certificate_code) VALUES(${a.id},${assessment.course_id},${code}) ON CONFLICT(user_id,course_id) DO UPDATE SET certificate_code=training_certificates.certificate_code RETURNING id,certificate_code,issued_at`;
   certificate=issued[0];
  }
  return NextResponse.json({score,passed,passing_score:assessment.passing_score,correct,total:questions.length,certificate,certificate_unlocked:!!certificate,message:passed?(certificate?"Exam passed. Your certificate is ready.":"Exam passed. Complete all course lessons to unlock your certificate."):"Review the course material and try again."});
 }catch(e:any){return NextResponse.json({error:e?.message||"Could not submit exam."},{status:503});}
}
