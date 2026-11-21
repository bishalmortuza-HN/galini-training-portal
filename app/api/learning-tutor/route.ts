import {NextRequest,NextResponse} from "next/server";
import {actorFor} from "@/lib/auth";
import {hasPaidAccess,paymentRequiredResponse} from "@/lib/membership-access";

export async function POST(req:NextRequest){
 const actor=await actorFor(req);
 if(!actor)return NextResponse.json({error:"Sign in to use the Insurance Learning Tutor."},{status:401});
 if(!["active","approved"].includes(actor.status))return NextResponse.json({error:"Your account is awaiting approval."},{status:403});
 if(!(await hasPaidAccess(actor)))return NextResponse.json(paymentRequiredResponse(),{status:402});
 if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:"AI tutor setup is not finished. Add OPENAI_API_KEY to the Galini Training Vercel project environment, then redeploy the preview."},{status:503});
 const body=await req.json().catch(()=>null);
 const question=String(body?.question||"").trim().slice(0,4000);
 if(!question)return NextResponse.json({error:"Enter a question for your tutor."},{status:400});
 const course=String(body?.course||"General insurance learning").slice(0,180);
 const lesson=String(body?.lesson||"").slice(0,180);
 try{
  const response=await fetch("https://api.openai.com/v1/responses",{
   method:"POST",
   headers:{Authorization:"Bearer "+process.env.OPENAI_API_KEY,"Content-Type":"application/json"},
   body:JSON.stringify({
    model:"gpt-4.1-mini",
    instructions:"You are Galini Insurance Learning Tutor, a patient instructor for US property and casualty insurance agency staff. Teach step by step in plain English. Use realistic fictional examples, simple tables or numbered workflows when useful. Explain insurance terms, coverage structure, exposure data, underwriting submissions, rating concepts, quote comparisons, ACORD data collection, and policy quality control. Distinguish general educational guidance from state law, carrier appetite, underwriting rules, and actual rates. Never invent carrier rules, class-code approvals, premiums, or binding authority. Ask for the state or line of business when it materially changes the answer. For calculations, show assumptions and arithmetic. End with one short knowledge-check question when appropriate. Remind learners that practice estimates are not carrier quotes and only written carrier authorization can bind coverage.",
    input:"Course: "+course+"\nLesson: "+lesson+"\nLearner question: "+question,
    max_output_tokens:900
   })
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)return NextResponse.json({error:data?.error?.message||"The AI tutor could not respond right now."},{status:502});
  const answer=String(data.output_text||data.output?.flatMap((item:any)=>item.content||[]).filter((part:any)=>part.type==="output_text").map((part:any)=>part.text).join("\n")||"I could not generate an answer. Please try again.").trim();
  return NextResponse.json({answer});
 }catch(e:any){return NextResponse.json({error:"AI tutor connection failed. Please try again."},{status:502});}
}
