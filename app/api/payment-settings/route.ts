import {NextRequest,NextResponse} from "next/server";
import {sql} from "@/lib/db";
import {actorFor} from "@/lib/auth";

export async function GET(request:NextRequest){
  const actor=await actorFor(request);
  if(!actor)return NextResponse.json({error:"Sign in required."},{status:401});
  try{
    const rows=await sql`SELECT setting_value FROM portal_settings WHERE setting_key='payment_instructions' LIMIT 1`;
    const value=rows[0]?.setting_value;
    return NextResponse.json({instructions:typeof value==="string"?value:value?.instructions||""});
  }catch(error:any){return NextResponse.json({error:error?.message||"Payment settings unavailable."},{status:503});}
}
export async function PUT(request:NextRequest){
  const actor=await actorFor(request);
  if(!actor)return NextResponse.json({error:"Sign in required."},{status:401});
  if(actor.role!=="platform_admin")return NextResponse.json({error:"Only the site administrator can update payment settings."},{status:403});
  const body=await request.json().catch(()=>null);
  const instructions=String(body?.instructions||"").trim();
  if(instructions.length>5000)return NextResponse.json({error:"Payment instructions must be 5,000 characters or fewer."},{status:400});
  try{
    await sql`INSERT INTO portal_settings(setting_key,setting_value,updated_by,updated_at) VALUES('payment_instructions',${JSON.stringify({instructions})}::jsonb,${actor.id},now()) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_by=EXCLUDED.updated_by,updated_at=now()`;
    return NextResponse.json({ok:true,instructions});
  }catch(error:any){return NextResponse.json({error:error?.message||"Could not save payment settings."},{status:503});}
}
