import {NextRequest,NextResponse} from "next/server";
import {sql} from "@/lib/db";
import {actorFor} from "@/lib/auth";
import {ratePractice} from "@/lib/practice-rating";
import {hasPaidAccess,paymentRequiredResponse} from "@/lib/membership-access";

function safeRisk(value:any){if(!value||typeof value!=="object"||Array.isArray(value))return value;const copy={...value};if(Array.isArray(copy.workflow_history))copy.workflow_history=copy.workflow_history.map((item:any)=>{const {actor_id,...safe}=item||{};return safe;});return copy;}
function safeRows(rows:any[]){return rows.map(row=>({...row,risk_data:safeRisk(row.risk_data)}));}

const supported=["Personal Homeowners","Personal Auto","Personal Umbrella","Personal Renters","Personal Condo","Personal Motorcycle","Commercial Package (BOP)","Commercial Package Policy (CPP)","Commercial Auto","General Liability","Workers Compensation","Commercial Umbrella","Professional Liability (E&O)","Cyber Liability","Liquor Liability","Garage Liability","Inland Marine"];

export async function GET(req:NextRequest){
 const a=await actorFor(req);
 if(!a)return NextResponse.json({error:"Sign in required."},{status:401});
 if(!(await hasPaidAccess(a)))return NextResponse.json(paymentRequiredResponse(),{status:402});
 try{
  const rows=a.role==="platform_admin"
   ?await sql`SELECT q.id,q.customer_name,q.line_of_business,q.effective_date,q.risk_data,q.exercise_type,q.status,q.reviewer_note,q.reviewed_at,q.created_at,q.updated_at,p.full_name AS agent_name,p.agent_code,g.agency_name,rv.full_name AS reviewer_name FROM quote_practice_submissions q JOIN profiles p ON p.id=q.agent_id LEFT JOIN agencies g ON g.id=q.agency_id LEFT JOIN profiles rv ON rv.id=q.reviewed_by ORDER BY q.created_at DESC`
   :a.role==="agency_admin"
   ?await sql`SELECT q.id,q.customer_name,q.line_of_business,q.effective_date,q.risk_data,q.exercise_type,q.status,q.reviewer_note,q.reviewed_at,q.created_at,q.updated_at,p.full_name AS agent_name,p.agent_code,g.agency_name,rv.full_name AS reviewer_name FROM quote_practice_submissions q JOIN profiles p ON p.id=q.agent_id LEFT JOIN agencies g ON g.id=q.agency_id LEFT JOIN profiles rv ON rv.id=q.reviewed_by WHERE q.agency_id=${a.agency_id} ORDER BY q.created_at DESC`
   :await sql`SELECT q.id,q.customer_name,q.line_of_business,q.effective_date,q.risk_data,q.exercise_type,q.status,q.reviewer_note,q.reviewed_at,q.created_at,q.updated_at,rv.full_name AS reviewer_name FROM quote_practice_submissions q LEFT JOIN profiles rv ON rv.id=q.reviewed_by WHERE q.agent_id=${a.id} ORDER BY q.created_at DESC`;
  return NextResponse.json({submissions:safeRows(rows)});
 }catch(e:any){return NextResponse.json({error:e?.message||"Quote practice data could not be loaded."},{status:503});}
}

export async function POST(req:NextRequest){
 const a=await actorFor(req);
 if(!a)return NextResponse.json({error:"Sign in required."},{status:401});
 if(!["active","approved"].includes(a.status))return NextResponse.json({error:"Account approval is required."},{status:403});
 if(!(await hasPaidAccess(a)))return NextResponse.json(paymentRequiredResponse(),{status:402});
 const b=await req.json().catch(()=>null);
 if(!b?.customer_name||!b?.line_of_business)return NextResponse.json({error:"Applicant and line of business are required."},{status:400});
 if(!supported.includes(String(b.line_of_business)))return NextResponse.json({error:"Choose a supported practice line."},{status:400});
 try{
  const risk=b.risk_data&&typeof b.risk_data==="object"?b.risk_data:{};
  const rating=ratePractice(String(b.line_of_business),risk);
  const stored={...risk,practice_rating:rating,workflow_history:[{action:"draft_created",actor_id:a.id,actor_role:a.role,at:new Date().toISOString()}]};
  const rows=await sql`INSERT INTO quote_practice_submissions(agency_id,agent_id,customer_name,line_of_business,effective_date,risk_data,exercise_type,status) VALUES(${a.agency_id},${a.id},${String(b.customer_name).slice(0,180)},${String(b.line_of_business)},${b.effective_date||null},${JSON.stringify(stored)}::jsonb,'practice','draft') RETURNING id,status,customer_name,line_of_business,effective_date,risk_data,created_at,updated_at`;
  for(const [key,title] of [["intake","Applicant intake"],["exposure","Exposure and risk details"],["coverage","Coverage selection"],["rating","Practice rating and premium breakdown"],["underwriting","Underwriting review"],["proposal","Proposal comparison and bind checklist"]])await sql`INSERT INTO quote_practice_steps(submission_id,step_key,step_title) VALUES(${rows[0].id},${key},${title}) ON CONFLICT(submission_id,step_key) DO NOTHING`;
  return NextResponse.json({submission:safeRows(rows)[0],rating});
 }catch(e:any){return NextResponse.json({error:e?.message||"Could not create practice rating."},{status:503});}
}

export async function PATCH(req:NextRequest){
 const a=await actorFor(req);
 if(!a)return NextResponse.json({error:"Sign in required."},{status:401});
 if(!(await hasPaidAccess(a)))return NextResponse.json(paymentRequiredResponse(),{status:402});
 const b=await req.json().catch(()=>null);
 if(!b?.id)return NextResponse.json({error:"Submission id required."},{status:400});
 const note=String(b.note||"").trim().slice(0,2000);
 try{
  if(["platform_admin","agency_admin"].includes(a.role)){
   if(b.action==="edit"){
    const customer=String(b.customer_name||"").trim();
    const line=String(b.line_of_business||"");
    const risk=b.risk_data&&typeof b.risk_data==="object"&&!Array.isArray(b.risk_data)?b.risk_data:null;
    if(!customer||!supported.includes(line)||!risk)return NextResponse.json({error:"Applicant, supported line of business and complete quote details are required."},{status:400});
    const rating=ratePractice(line,risk);
    const revised={...risk,practice_rating:rating};
    const updatedRisk=JSON.stringify(revised);
    const rows=a.role==="platform_admin"
     ?await sql`UPDATE quote_practice_submissions SET customer_name=${customer.slice(0,180)},line_of_business=${line},effective_date=${b.effective_date||null},risk_data=jsonb_set(${updatedRisk}::jsonb,'{workflow_history}',COALESCE(risk_data->'workflow_history','[]'::jsonb)||jsonb_build_array(jsonb_build_object('action','admin_quote_edited','actor_id',${String(a.id)}::uuid,'actor_role',${String(a.role)}::text,'at',now()))),status='submitted',reviewer_note=NULL,reviewed_by=NULL,reviewed_at=NULL,updated_at=now() WHERE id=${b.id} AND status<>'completed' RETURNING id,status,customer_name,line_of_business,effective_date,risk_data,updated_at`
     :await sql`UPDATE quote_practice_submissions SET customer_name=${customer.slice(0,180)},line_of_business=${line},effective_date=${b.effective_date||null},risk_data=jsonb_set(${updatedRisk}::jsonb,'{workflow_history}',COALESCE(risk_data->'workflow_history','[]'::jsonb)||jsonb_build_array(jsonb_build_object('action','admin_quote_edited','actor_id',${String(a.id)}::uuid,'actor_role',${String(a.role)}::text,'at',now()))),status='submitted',reviewer_note=NULL,reviewed_by=NULL,reviewed_at=NULL,updated_at=now() WHERE id=${b.id} AND agency_id=${a.agency_id} AND status<>'completed' RETURNING id,status,customer_name,line_of_business,effective_date,risk_data,updated_at`;
    if(!rows.length)return NextResponse.json({error:"Quote not found in your review scope, or it is locked after completion."},{status:404});
    return NextResponse.json({ok:true,submission:safeRows(rows)[0],status:rows[0].status,rating});
   }
   const allowed=["reviewed","rejected","needs_revision","completed"];
   if(!allowed.includes(String(b.status)))return NextResponse.json({error:"Choose approve, reject, request revision, or complete review."},{status:400});
   if(["rejected","needs_revision"].includes(String(b.status))&&!note)return NextResponse.json({error:"A reason is required for rejection or a revision request."},{status:400});
   const rows=a.role==="platform_admin"
    ?await sql`UPDATE quote_practice_submissions SET status=${b.status},reviewer_note=${note||null},reviewed_by=${a.id},reviewed_at=now(),updated_at=now(),risk_data=jsonb_set(COALESCE(risk_data,'{}'::jsonb),'{workflow_history}',COALESCE(risk_data->'workflow_history','[]'::jsonb)||jsonb_build_array(jsonb_build_object('action',${String(b.status)}::text,'note',${note}::text,'actor_id',${String(a.id)}::uuid,'actor_role',${String(a.role)}::text,'at',now()))) WHERE id=${b.id} AND ((${b.status}='completed' AND status='reviewed') OR (${b.status}<>'completed' AND status='submitted')) RETURNING id,status`
    :await sql`UPDATE quote_practice_submissions SET status=${b.status},reviewer_note=${note||null},reviewed_by=${a.id},reviewed_at=now(),updated_at=now(),risk_data=jsonb_set(COALESCE(risk_data,'{}'::jsonb),'{workflow_history}',COALESCE(risk_data->'workflow_history','[]'::jsonb)||jsonb_build_array(jsonb_build_object('action',${String(b.status)}::text,'note',${note}::text,'actor_id',${String(a.id)}::uuid,'actor_role',${String(a.role)}::text,'at',now()))) WHERE id=${b.id} AND agency_id=${a.agency_id} AND ((${b.status}='completed' AND status='reviewed') OR (${b.status}<>'completed' AND status='submitted')) RETURNING id,status`;
   if(!rows.length)return NextResponse.json({error:"Submission not found in your review scope, or its status has changed."},{status:404});
   return NextResponse.json({ok:true,status:rows[0].status});
  }
  if(a.role!=="agent")return NextResponse.json({error:"You do not have permission to update this submission."},{status:403});
  const current=await sql`SELECT status FROM quote_practice_submissions WHERE id=${b.id} AND agent_id=${a.id}`;
  if(!current.length)return NextResponse.json({error:"Submission not found."},{status:404});
  if(!["draft","needs_revision","rejected"].includes(current[0].status))return NextResponse.json({error:"Only your own draft, rejected quote, or submission returned for revision can be edited."},{status:409});
  const hasRisk=b.risk_data&&typeof b.risk_data==="object";
  const customer=String(b.customer_name||"").trim();
  const line=String(b.line_of_business||"");
  if(hasRisk&&(!customer||!supported.includes(line)))return NextResponse.json({error:"Enter an applicant name and choose a supported line of business."},{status:400});
  const nextStatus=b.submit===true?"submitted":"draft";
  const revised=hasRisk?{...b.risk_data,practice_rating:ratePractice(line,b.risk_data)}:null;
  const updatedRisk=revised?JSON.stringify(revised):null;
  const rows=updatedRisk
   ?await sql`UPDATE quote_practice_submissions SET customer_name=${customer.slice(0,180)},line_of_business=${line},effective_date=${b.effective_date||null},status=${nextStatus},updated_at=now(),risk_data=jsonb_set(${updatedRisk}::jsonb,'{workflow_history}',COALESCE(risk_data->'workflow_history','[]'::jsonb)||jsonb_build_array(jsonb_build_object('action',${String(nextStatus)}::text,'actor_id',${String(a.id)}::uuid,'actor_role',${String(a.role)}::text,'at',now()))) WHERE id=${b.id} AND agent_id=${a.id} RETURNING id,status,customer_name,line_of_business,effective_date,risk_data,updated_at`
   :await sql`UPDATE quote_practice_submissions SET status=${nextStatus},updated_at=now(),risk_data=jsonb_set(COALESCE(risk_data,'{}'::jsonb),'{workflow_history}',COALESCE(risk_data->'workflow_history','[]'::jsonb)||jsonb_build_array(jsonb_build_object('action',${String(nextStatus)}::text,'actor_id',${String(a.id)}::uuid,'actor_role',${String(a.role)}::text,'at',now()))) WHERE id=${b.id} AND agent_id=${a.id} RETURNING id,status,customer_name,line_of_business,effective_date,risk_data,updated_at`;
  return NextResponse.json({ok:true,submission:safeRows(rows)[0],status:rows[0].status,rating:revised?.practice_rating||null});
 }catch(e:any){return NextResponse.json({error:e?.message||"Quote workflow update failed."},{status:503});}
}
