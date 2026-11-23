import {NextRequest,NextResponse} from "next/server";
import {sql} from "@/lib/db";
import {actorFor} from "@/lib/auth";
import {hasPaidAccess} from "@/lib/membership-access";

export const runtime="nodejs";
const plans:Record<string,{label:string;amount:number;interval:"month"|"year"}>={
 standard_monthly:{label:"Standard Pack — Monthly",amount:1500,interval:"month"},
 standard_yearly:{label:"Standard Pack — Yearly",amount:10000,interval:"year"},
 platinum_monthly:{label:"Platinum — Monthly",amount:5500,interval:"month"},
 platinum_yearly:{label:"Platinum — Yearly",amount:60000,interval:"year"}
};
export async function POST(req:NextRequest){
 const actor=await actorFor(req);
 if(!actor)return NextResponse.json({error:"Sign in to continue."},{status:401});
 if(!["agency_admin","agent"].includes(actor.role))return NextResponse.json({error:"This account cannot purchase membership."},{status:403});
 if(!(await hasPaidAccess(actor))===false){}
 if(await hasPaidAccess(actor))return NextResponse.json({error:"Membership is already active for this account. Contact the site administrator if you need to change plans."},{status:409});
 const body=await req.json().catch(()=>null),planCode=String(body?.plan||""),selected=plans[planCode];
 if(!selected)return NextResponse.json({error:"Choose a valid membership plan."},{status:400});
 const secret=process.env.STRIPE_SECRET_KEY;
 if(!secret)return NextResponse.json({error:"Card and ACH checkout is being configured. Please try again shortly."},{status:503});
 const accountId=actor.role==="agency_admin"?null:actor.id;
 const agencyId=actor.agency_id||null;
 if(actor.role==="agency_admin"&&!agencyId)return NextResponse.json({error:"An agency account is required for this subscription."},{status:400});
 const label=selected.label;
 let paymentId:string|undefined;
 try{
  const pending=await sql`INSERT INTO payment_transactions(agency_id,user_id,plan,plan_code,amount_cents,currency,payment_method,payment_reference,status) VALUES(${agencyId},${accountId},${label},${planCode},${selected.amount},'USD','Stripe Checkout','Checkout session pending','pending') RETURNING id`;
  paymentId=pending[0].id;
  const origin=process.env.NEXT_PUBLIC_APP_URL||req.nextUrl.origin;
  const form=new URLSearchParams();
  form.set("mode","subscription");
  form.append("payment_method_types[0]","card");
  form.append("payment_method_types[1]","us_bank_account");
  form.set("line_items[0][quantity]","1");
  form.set("line_items[0][price_data][currency]","usd");
  form.set("line_items[0][price_data][unit_amount]",String(selected.amount));
  form.set("line_items[0][price_data][recurring][interval]",selected.interval);
  form.set("line_items[0][price_data][product_data][name]",label);
  form.set("customer_email",actor.email);
  form.set("client_reference_id",actor.id);
  form.set("success_url",origin+"/?payment=success&session_id={CHECKOUT_SESSION_ID}");
  form.set("cancel_url",origin+"/?payment=cancelled");
  form.set("metadata[payment_id]",String(paymentId));
  form.set("metadata[account_id]",String(actor.id));
  form.set("metadata[agency_id]",String(agencyId||""));
  form.set("metadata[account_type]",actor.role);
  form.set("metadata[plan_code]",planCode);
  form.set("subscription_data[metadata][payment_id]",String(paymentId));
  form.set("subscription_data[metadata][account_id]",String(actor.id));
  form.set("subscription_data[metadata][agency_id]",String(agencyId||""));
  form.set("subscription_data[metadata][account_type]",actor.role);
  form.set("subscription_data[metadata][plan_code]",planCode);
  form.set("payment_method_options[us_bank_account][financial_connections][permissions][0]","payment_method");
  const response=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{Authorization:"Bearer "+secret,"Content-Type":"application/x-www-form-urlencoded"},body:form.toString(),cache:"no-store"});
  const session:any=await response.json();
  if(!response.ok||!session.url)throw new Error(session?.error?.message||"Stripe could not create a checkout session.");
  await sql`UPDATE payment_transactions SET stripe_checkout_session_id=${session.id},stripe_customer_id=${typeof session.customer==="string"?session.customer:null},payment_reference=${session.id},updated_at=now() WHERE id=${paymentId}`.catch(async()=>{await sql`UPDATE payment_transactions SET stripe_checkout_session_id=${session.id},stripe_customer_id=${typeof session.customer==="string"?session.customer:null},payment_reference=${session.id} WHERE id=${paymentId}`;});
  return NextResponse.json({url:session.url});
 }catch(e:any){
  if(paymentId)await sql`UPDATE payment_transactions SET status='failed',admin_note=${String(e?.message||"Stripe checkout failed").slice(0,900)} WHERE id=${paymentId}`.catch(()=>{});
  return NextResponse.json({error:e?.message||"Could not start secure checkout."},{status:502});
 }
}
