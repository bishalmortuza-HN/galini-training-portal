import {NextRequest,NextResponse} from "next/server";
import {createHmac,timingSafeEqual} from "node:crypto";
import {sql} from "@/lib/db";
export const runtime="nodejs";

function validSignature(raw:string,header:string,secret:string){
 const parts=header.split(",").map(x=>x.split("="));
 const timestamp=parts.find(x=>x[0]==="t")?.[1];
 const signatures=parts.filter(x=>x[0]==="v1").map(x=>x[1]);
 if(!timestamp||!signatures.length||Math.abs(Date.now()/1000-Number(timestamp))>300)return false;
 const expected=createHmac("sha256",secret).update(timestamp+"."+raw).digest();
 return signatures.some(sig=>{try{const actual=Buffer.from(sig,"hex");return actual.length===expected.length&&timingSafeEqual(actual,expected);}catch{return false;}});
}
async function activate(paymentId:string,session:any){
 const rows=await sql`UPDATE payment_transactions SET status='verified',stripe_customer_id=COALESCE(${typeof session.customer==="string"?session.customer:null},stripe_customer_id),stripe_subscription_id=COALESCE(${typeof session.subscription==="string"?session.subscription:null},stripe_subscription_id),stripe_payment_intent_id=COALESCE(${typeof session.payment_intent==="string"?session.payment_intent:null},stripe_payment_intent_id),payment_method='Stripe Checkout',admin_note='Payment confirmed by Stripe webhook.',reviewed_at=now() WHERE id=${paymentId} RETURNING agency_id,user_id,plan`;
 if(rows.length&&rows[0].agency_id&&!rows[0].user_id)await sql`UPDATE agencies SET membership_status='active',plan=${rows[0].plan},updated_at=now() WHERE id=${rows[0].agency_id}`;
}
export async function POST(req:NextRequest){
 const secret=process.env.STRIPE_WEBHOOK_SECRET;
 if(!secret)return NextResponse.json({error:"Webhook is not configured."},{status:503});
 const raw=await req.text(),signature=req.headers.get("stripe-signature")||"";
 if(!validSignature(raw,signature,secret))return NextResponse.json({error:"Invalid Stripe signature."},{status:400});
 let event:any;try{event=JSON.parse(raw);}catch{return NextResponse.json({error:"Invalid event body."},{status:400});}
 try{
  const obj=event.data?.object||{};
  if(event.type==="checkout.session.completed"||event.type==="checkout.session.async_payment_succeeded"){
   const paymentId=String(obj.metadata?.payment_id||"");
   if(paymentId){
    if(obj.payment_status==="paid"||event.type==="checkout.session.async_payment_succeeded")await activate(paymentId,obj);
    else await sql`UPDATE payment_transactions SET stripe_customer_id=${typeof obj.customer==="string"?obj.customer:null},stripe_subscription_id=${typeof obj.subscription==="string"?obj.subscription:null},payment_method='Stripe ACH / card',admin_note='Checkout completed. Waiting for bank payment confirmation.' WHERE id=${paymentId}`;
   }
  }
  if(event.type==="invoice.paid"){
   const subId=typeof obj.subscription==="string"?obj.subscription:obj.parent?.subscription_details?.subscription;
   const invoiceId=String(obj.id||"");
   if(subId){
    const source=await sql`SELECT id,agency_id,user_id,plan,plan_code,amount_cents,currency,stripe_customer_id FROM payment_transactions WHERE stripe_subscription_id=${subId} ORDER BY submitted_at ASC LIMIT 1`;
    if(source.length){
     const s=source[0],amount=Number(obj.amount_paid||0);
     if(invoiceId)await sql`INSERT INTO payment_transactions(agency_id,user_id,plan,plan_code,amount_cents,currency,payment_method,payment_reference,status,stripe_customer_id,stripe_subscription_id,stripe_invoice_id,stripe_payment_intent_id,admin_note) VALUES(${s.agency_id},${s.user_id},${s.plan},${s.plan_code},${amount||s.amount_cents},'USD','Stripe subscription',${invoiceId},'verified',${s.stripe_customer_id},${subId},${invoiceId},${typeof obj.payment_intent==="string"?obj.payment_intent:null},'Recurring invoice paid by Stripe') ON CONFLICT DO NOTHING`;
     await sql`UPDATE payment_transactions SET status='verified',admin_note='Subscription payment confirmed by Stripe.',reviewed_at=now() WHERE stripe_subscription_id=${subId}`;
     if(s.agency_id&&!s.user_id)await sql`UPDATE agencies SET membership_status='active',plan=${s.plan},updated_at=now() WHERE id=${s.agency_id}`;
    }
   }
  }
  if(event.type==="invoice.payment_failed"){
   const subId=typeof obj.subscription==="string"?obj.subscription:obj.parent?.subscription_details?.subscription;
   if(subId){
    const rows=await sql`UPDATE payment_transactions SET status='failed',admin_note='Stripe subscription payment failed. Update payment method to restore access.' WHERE stripe_subscription_id=${subId} RETURNING agency_id,user_id`;
    if(rows[0]?.agency_id&&!rows[0]?.user_id)await sql`UPDATE agencies SET membership_status='inactive',updated_at=now() WHERE id=${rows[0].agency_id}`;
   }
  }
  if(event.type==="customer.subscription.deleted"){
   const subId=String(obj.id||"");
   const rows=await sql`UPDATE payment_transactions SET status='failed',admin_note='Stripe subscription cancelled.' WHERE stripe_subscription_id=${subId} RETURNING agency_id,user_id`;
   if(rows[0]?.agency_id&&!rows[0]?.user_id)await sql`UPDATE agencies SET membership_status='inactive',updated_at=now() WHERE id=${rows[0].agency_id}`;
  }
  return NextResponse.json({received:true});
 }catch(e:any){return NextResponse.json({error:e?.message||"Webhook processing failed."},{status:500});}
}
