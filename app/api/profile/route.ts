import {NextRequest,NextResponse} from "next/server";
import {sql} from "@/lib/db";
import {actorFor,COOKIE,hashPassword,makeSession,sessionCookieOptions,verifyPassword} from "@/lib/auth";

export async function PATCH(request:NextRequest){
  const actor=await actorFor(request);
  if(!actor)return NextResponse.json({error:"Sign in required."},{status:401});
  const body=await request.json().catch(()=>null);
  if(!body)return NextResponse.json({error:"Invalid profile update."},{status:400});
  const fullName=String(body.full_name||"").trim();
  const email=String(body.email||"").trim().toLowerCase();
  const currentPassword=String(body.current_password||"");
  const newPassword=String(body.new_password||"");
  if(!fullName)return NextResponse.json({error:"Full name is required."},{status:400});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({error:"Enter a valid email address."},{status:400});
  try{
    const rows=await sql`SELECT id,email,full_name,role,status,agent_code,agency_id,password_hash,auth_version FROM profiles WHERE id=${actor.id} LIMIT 1`;
    const current=rows[0];
    if(!current)return NextResponse.json({error:"Account not found."},{status:404});
    const emailChanged=email!==current.email;
    if(emailChanged){
      const duplicate=await sql`SELECT id FROM profiles WHERE email=${email} AND id<>${actor.id} LIMIT 1`;
      if(duplicate.length)return NextResponse.json({error:"That email address is already used by another Galini account."},{status:409});
    }
    if(newPassword){
      if(newPassword.length<10)return NextResponse.json({error:"New password must contain at least 10 characters."},{status:400});
      if(!currentPassword||!verifyPassword(currentPassword,current.password_hash))return NextResponse.json({error:"Enter your current password correctly to change it."},{status:403});
    }
    const updated=await sql`UPDATE profiles SET full_name=${fullName},email=${email},password_hash=${newPassword?hashPassword(newPassword):current.password_hash},auth_version=auth_version+${newPassword?1:0},updated_at=now() WHERE id=${actor.id} RETURNING id,email,full_name,role,status,agent_code,agency_id,auth_version`;
    const user=updated[0];
    const response=NextResponse.json({user:{id:user.id,email:user.email,full_name:user.full_name,role:user.role,status:user.status,agent_code:user.agent_code,agency_id:user.agency_id},message:"Profile updated successfully."});
    response.cookies.set(COOKIE,makeSession(user.id,Number(user.auth_version??0)),sessionCookieOptions());
    return response;
  }catch(error:any){return NextResponse.json({error:error?.message||"Could not update your profile."},{status:503});}
}
