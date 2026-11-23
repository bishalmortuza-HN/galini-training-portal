import {NextRequest,NextResponse} from "next/server";
import {sql} from "@/lib/db";
import {actorFor} from "@/lib/auth";

const split=(value:any)=>Array.isArray(value)?value.map((x:any)=>String(x).trim()).filter(Boolean):String(value||"").split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
const amount=(value:any)=>value==null||value===""?null:Number.isFinite(Number(value))?Number(value):null;
const canContribute=(actor:any)=>actor?.role==="platform_admin"||actor?.role==="agency_admin";
function clean(body:any){
 return {
  carrier_name:String(body?.carrier_name||"").trim().slice(0,180),
  program_name:String(body?.program_name||"").trim().slice(0,180),
  line_of_business:String(body?.line_of_business||"").trim().slice(0,180),
  class_codes:split(body?.class_codes),naics_codes:split(body?.naics_codes),
  states:split(body?.states).map((x:string)=>x.toUpperCase()),business_keywords:split(body?.business_keywords),
  appetite_status:["writes","refer","declines"].includes(body?.appetite_status)?body.appetite_status:"writes",
  binding_status:["eligible","refer","not_available"].includes(body?.binding_status)?body.binding_status:"refer",
  min_revenue:amount(body?.min_revenue),max_revenue:amount(body?.max_revenue),max_payroll:amount(body?.max_payroll),
  notes:String(body?.notes||"").trim().slice(0,5000),underwriting_guidelines:String(body?.underwriting_guidelines||"").trim().slice(0,5000),
  source:String(body?.source||"").trim().slice(0,1000),is_active:body?.is_active!==false
 };
}
export async function GET(request:NextRequest){
 const actor=await actorFor(request);
 if(!actor)return NextResponse.json({error:"Sign in required."},{status:401});
 try{
  const rows=actor.role==="platform_admin"
   ?await sql`SELECT e.*,p.full_name AS submitted_by,g.agency_name AS agency_name FROM carrier_appetite_entries e LEFT JOIN profiles p ON p.id=e.created_by LEFT JOIN agencies g ON g.id=e.agency_id ORDER BY e.carrier_name,e.program_name`
   :await sql`SELECT e.*,p.full_name AS submitted_by,g.agency_name AS agency_name FROM carrier_appetite_entries e LEFT JOIN profiles p ON p.id=e.created_by LEFT JOIN agencies g ON g.id=e.agency_id WHERE e.is_active=true OR e.created_by=${actor.id} ORDER BY e.carrier_name,e.program_name`;
  return NextResponse.json({entries:rows});
 }catch(error:any){return NextResponse.json({error:error?.message||"Carrier appetite list is unavailable."},{status:503});}
}
export async function POST(request:NextRequest){
 const actor=await actorFor(request);
 if(!actor)return NextResponse.json({error:"Sign in required."},{status:401});
 if(!canContribute(actor))return NextResponse.json({error:"Only agency administrators can contribute carrier appetite records."},{status:403});
 const body=await request.json().catch(()=>null),v=clean(body);
 if(!v.carrier_name)return NextResponse.json({error:"Enter an insurance company name."},{status:400});
 try{
  const rows=await sql`INSERT INTO carrier_appetite_entries(carrier_name,program_name,line_of_business,class_codes,naics_codes,states,business_keywords,appetite_status,binding_status,min_revenue,max_revenue,max_payroll,notes,underwriting_guidelines,source,is_active,created_by,agency_id,updated_at)
  VALUES(${v.carrier_name},${v.program_name},${v.line_of_business},${JSON.stringify(v.class_codes)}::jsonb,${JSON.stringify(v.naics_codes)}::jsonb,${JSON.stringify(v.states)}::jsonb,${JSON.stringify(v.business_keywords)}::jsonb,${v.appetite_status},${v.binding_status},${v.min_revenue},${v.max_revenue},${v.max_payroll},${v.notes},${v.underwriting_guidelines},${v.source},${v.is_active},${actor.id},${actor.agency_id||null},now()) RETURNING *`;
  return NextResponse.json({entry:rows[0]},{status:201});
 }catch(error:any){return NextResponse.json({error:error?.message||"Could not save carrier appetite record."},{status:503});}
}
export async function PATCH(request:NextRequest){
 const actor=await actorFor(request);
 if(!actor)return NextResponse.json({error:"Sign in required."},{status:401});
 if(!canContribute(actor))return NextResponse.json({error:"Only agency administrators can manage carrier appetite records."},{status:403});
 const body=await request.json().catch(()=>null),id=String(body?.id||"").trim(),v=clean(body);
 if(!id||!v.carrier_name)return NextResponse.json({error:"A record ID and insurance company name are required."},{status:400});
 try{
  const rows=actor.role==="platform_admin"
   ?await sql`UPDATE carrier_appetite_entries SET carrier_name=${v.carrier_name},program_name=${v.program_name},line_of_business=${v.line_of_business},class_codes=${JSON.stringify(v.class_codes)}::jsonb,naics_codes=${JSON.stringify(v.naics_codes)}::jsonb,states=${JSON.stringify(v.states)}::jsonb,business_keywords=${JSON.stringify(v.business_keywords)}::jsonb,appetite_status=${v.appetite_status},binding_status=${v.binding_status},min_revenue=${v.min_revenue},max_revenue=${v.max_revenue},max_payroll=${v.max_payroll},notes=${v.notes},underwriting_guidelines=${v.underwriting_guidelines},source=${v.source},is_active=${v.is_active},updated_at=now() WHERE id=${id} RETURNING *`
   :await sql`UPDATE carrier_appetite_entries SET carrier_name=${v.carrier_name},program_name=${v.program_name},line_of_business=${v.line_of_business},class_codes=${JSON.stringify(v.class_codes)}::jsonb,naics_codes=${JSON.stringify(v.naics_codes)}::jsonb,states=${JSON.stringify(v.states)}::jsonb,business_keywords=${JSON.stringify(v.business_keywords)}::jsonb,appetite_status=${v.appetite_status},binding_status=${v.binding_status},min_revenue=${v.min_revenue},max_revenue=${v.max_revenue},max_payroll=${v.max_payroll},notes=${v.notes},underwriting_guidelines=${v.underwriting_guidelines},source=${v.source},is_active=${v.is_active},updated_at=now() WHERE id=${id} AND created_by=${actor.id} RETURNING *`;
  if(!rows.length)return NextResponse.json({error:"Record not found, or you do not have permission to edit another agency's submission."},{status:404});
  return NextResponse.json({entry:rows[0]});
 }catch(error:any){return NextResponse.json({error:error?.message||"Could not update carrier appetite record."},{status:503});}
}
