import {NextRequest,NextResponse} from "next/server";
import {sql} from "@/lib/db";
import {actorFor} from "@/lib/auth";

const emptyDetails={bankName:"",accountHolder:"",accountNumber:"",iban:"",routingNumber:"",swiftCode:"",bankBranch:"",bankAddress:"",payoneerEmail:"",payoneerLink:"",otherInstructions:""};
function normalizeDetails(value:any){
  const source=value?.details&&typeof value.details==="object"?value.details:value;
  return Object.fromEntries(Object.keys(emptyDetails).map(key=>[key,typeof source?.[key]==="string"?source[key].trim():""])) as typeof emptyDetails;
}
export async function GET(request:NextRequest){
  const actor=await actorFor(request);
  if(!actor)return NextResponse.json({error:"Sign in required."},{status:401});
  try{
    const rows=await sql`SELECT setting_value FROM portal_settings WHERE setting_key='payment_instructions' LIMIT 1`;
    const value=rows[0]?.setting_value;
    const details=normalizeDetails(value);
    const instructions=typeof value==="string"?value:(typeof value?.instructions==="string"?value.instructions:"");
    return NextResponse.json({details,instructions});
  }catch(error:any){return NextResponse.json({error:error?.message||"Payment settings unavailable."},{status:503});}
}
export async function PUT(request:NextRequest){
  const actor=await actorFor(request);
  if(!actor)return NextResponse.json({error:"Sign in required."},{status:401});
  if(actor.role!=="platform_admin")return NextResponse.json({error:"Only the site administrator can update payment settings."},{status:403});
  const body=await request.json().catch(()=>null);
  const details=normalizeDetails(body);
  const instructions=String(body?.instructions||"").trim();
  if(Object.values(details).some(value=>value.length>1000)||instructions.length>5000)
    return NextResponse.json({error:"Payment details are too long. Each field must be 1,000 characters or fewer."},{status:400});
  try{
    await sql`INSERT INTO portal_settings(setting_key,setting_value,updated_by,updated_at) VALUES('payment_instructions',${JSON.stringify({details,instructions})}::jsonb,${actor.id},now()) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_by=EXCLUDED.updated_by,updated_at=now()`;
    return NextResponse.json({ok:true,details,instructions});
  }catch(error:any){return NextResponse.json({error:error?.message||"Could not save payment settings."},{status:503});}
}
