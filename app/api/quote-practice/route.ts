import {NextRequest,NextResponse} from "next/server";
import {sql} from "@/lib/db";
import {actorFor} from "@/lib/auth";
import {ratePractice} from "@/lib/practice-rating";

const supported=["Personal Homeowners","Personal Auto","Personal Umbrella","Personal Renters","Personal Condo","Personal Motorcycle","Commercial Package (BOP)","Commercial Package Policy (CPP)","Commercial Auto","General Liability","Workers Compensation","Commercial Umbrella","Professional Liability (E&O)","Cyber Liability","Liquor Liability","Garage Liability","Inland Marine"];

export async function GET(req:NextRequest){
 const a=await actorFor(req);if(!a)return NextResponse.json({error:"Sign in required."},{status:401});
 try{
  const rows=a.role==="platform_admin"
   ?await sql`SELECT q.*,p.full_name AS agent_name,p.email,g.agency_name,rv.full_name AS reviewer_name FROM quote_practice_submissions q JOIN profiles p ON p.id=q.agent_id LEFT JOIN agencies g ON g.id=q.agency_id LEFT JOIN profiles rv ON rv.id=q.reviewed_by ORDER BY q.created_at DESC`
   :a.role==="agency_admin"
   ?await sql`SELECT q.*,p.full_name AS agent_name,p.email,g.agency_name,rv.full_name AS reviewer_name FROM quote_practice_submissions q JOIN profiles p ON p.id=q.agent_id LEFT JOIN agencies g ON g.id=q.agency_id LEFT JOIN profiles rv ON rv.id=q.reviewed_by WHERE q.agency_id=${a.agency_id} ORDER BY q.created_at DESC`
   :await sql`SELECT * FROM quote_practice_submissions WHERE agent_id=${a.id} ORDER BY created_at DESC`;
  return NextResponse.json({submissions:rows});
 }catch(e:any){return NextResponse.json({error:e?.message||"Quote practice data could not be loaded."},{status:503});}
}

export async function POST(req:NextRequest){
 const a=await actorFor(req);if(!a)return NextResponse.json({error:"Sign in required."},{status:401});
 if(!["active","approved"].includes(a.status))return NextResponse.json({error:"Account approval is required."},{status:403});
 const b=await req.json().catch(()=>null);
 if(!b?.customer_name||!b?.line_of_business)return NextResponse.json({error:"Applicant and line of business are required."},{status:400});
 if(!supported.includes(String(b.line_of_business)))return NextResponse.json({error:"Choose a supported practice line."},{status:400});
 try{
  const risk=b.risk_data&&typeof b.risk_data==="object"?b.risk_data:{};
  const rating=ratePractice(String(b.line_of_business),risk);
  const stored={...risk,practice_rating:rating,workflow_history:[{action:"draft_created",actor_id:a.id,actor_role:a.role,at:new Date().toISOString()}]};
  const rows=await sql`INSERT INTO quote_practice_submissions(agency_id,agent_id,customer_name,line_of_business,effective_date,risk_data,exercise_type,status) VALUES(${a.agency_id},${a.id},${String(b.customer_name).slice(0,180)},${String(b.line_of_business)},${b.effective_date||null},${JSON.stringify(stored)}::jsonb,'practice','draft') RETURNING *`;
  for(const [key,title] of [["intake","Applicant intake"],["exposure","Exposure and risk details"],["coverage","Coverage selection"],["rating","Practice rating and premium breakdown"],["underwriting","Underwriting review"],["proposal","Proposal comparison and bind checklist"]])await sql`INSERT INTO quote_practice_steps(submission_id,step_key,step_title) VALUES(${rows[0].id},${key},${title}) ON CONFLICT(submission_id,step_key) DO NOTHING`;
  return NextResponse.json({submission:rows[0],rating});
 }catch(e:any){return NextResponse.json({error:e?.message||"Could not create practice rating."},{status:503});}
}

export async function PATCH(req:NextRequest){
 const a=await actorFor(req);if(!a)return NextResponse.json({error:"Sign in required."},{status:401});
 const b=await req.json().catch(()=>null);if(!b?.id)return NextResponse.json({error:"Submission id required."},{status:400});
 const note=String(b.note||"").slice(0,2000);
 try{
  if(["platform_admin","agency_admin"].includes(a.role)){
   const allowed=["reviewed","needs_revision","completed"];
   if(!allowed.includes(String(b.status)))return NextResponse.json({error:"Choose approve, request revision, or complete review."},{status:400});
   if(b.status==="needs_revision"&&!note.trim())return NextResponse.json({error:"Add a clear reviewer note describing what the agent must correct."},{status:400});
   const rows=a.role==="platform_admin"
    ?await sql`UPDATE quote_practice_submissions SET status=${b.status},reviewer_note=${note},reviewed_by=${a.id},reviewed_at=now(),updated_at=now(),risk_data=jsonb_set(COALESCE(risk_data,'{}'::jsonb),'{workflow_history}',COALESCE(risk_data->'workflow_history','[]'::jsonb)||jsonb_build_array(jsonb_build_object('action',${String(b.status)}::text,'note',${note}::text,'actor_id',${String(a.id)}::uuid,'actor_role',${String(a.role)}::text,'at',now()))) WHERE id=${b.id} AND ((${b.status}='completed' AND status='reviewed') OR (${b.status}<>'completed' AND status='submitted')) RETURNING id,status`
    :await sql`UPDATE quote_practice_submissions SET status=${b.status},reviewer_note=${note},reviewed_by=${a.id},reviewed_at=now(),updated_at=now(),risk_data=jsonb_set(COALESCE(risk_data,'{}'::jsonb),'{workflow_history}',COALESCE(risk_data->'workflow_history','[]'::jsonb)||jsonb_build_array(jsonb_build_object('action',${String(b.status)}::text,'note',${note}::text,'actor_id',${String(a.id)}::uuid,'actor_role',${String(a.role)}::text,'at',now()))) WHERE id=${b.id} AND agency_id=${a.agency_id} AND ((${b.status}='completed' AND status='reviewed') OR (${b.status}<>'completed' AND status='submitted')) RETURNING id,status`;
   if(!rows.length)return NextResponse.json({error:"Submission not found in your review scope."},{status:404});
   return NextResponse.json({ok:true,status:rows[0].status});
  }
  if(a.role!=="agent")return NextResponse.json({error:"You do not have permission to update this submission."},{status:403});
  const current=await sql`SELECT status FROM quote_practice_submissions WHERE id=${b.id} AND agent_id=${a.id}`;
  if(!current.length)return NextResponse.json({error:"Submission not found."},{status:404});
  if(!["draft","needs_revision"].includes(current[0].status))return NextResponse.json({error:"Only a draft or a submission returned for revision can be resubmitted."},{status:409});
  const nextStatus=b.submit===true?"submitted":"draft";
  const revised=b.risk_data&&typeof b.risk_data==="object"?{...b.risk_data,practice_rating:ratePractice(String(b.line_of_business||""),b.risk_data)}:null;
  const updatedRisk=revised?JSON.stringify(revised):null;
  const rows=updatedRisk
   ?await sql`UPDATE quote_practice_submissions SET customer_name=${String(b.customer_name||"").slice(0,180)||"Applicant"},line_of_business=${String(b.line_of_business||"General Liability")},effective_date=${b.effective_date||null},status=${nextStatus},updated_at=now(),risk_data=jsonb_set(${updatedRisk}::jsonb,'{workflow_history}',COALESCE(risk_data->'workflow_history','[]'::jsonb)||jsonb_build_array(jsonb_build_object('action',${String(nextStatus)}::text,'actor_id',${String(a.id)}::uuid,'actor_role',${String(a.role)}::text,'at',now()))) WHERE id=${b.id} AND agent_id=${a.id} RETURNING status`
   :await sql`UPDATE quote_practice_submissions SET status=${nextStatus},updated_at=now(),risk_data=jsonb_set(COALESCE(risk_data,'{}'::jsonb),'{workflow_history}',COALESCE(risk_data->'workflow_history','[]'::jsonb)||jsonb_build_array(jsonb_build_object('action',${String(nextStatus)}::text,'actor_id',${String(a.id)}::uuid,'actor_role',${String(a.role)}::text,'at',now()))) WHERE id=${b.id} AND agent_id=${a.id} RETURNING status`;
  return NextResponse.json({ok:true,status:rows[0].status,rating:revised?.practice_rating||null});
 }catch(e:any){return NextResponse.json({error:e?.message||"Quote workflow update failed."},{status:503});}
}
