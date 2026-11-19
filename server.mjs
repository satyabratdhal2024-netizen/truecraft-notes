// TrueCraft Notes server: zero dependencies, Node 20+. Emails every order (with files) to the owner.
import http from 'node:http';
import {readFileSync,readdirSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import tls from 'node:tls';
import net from 'node:net';
import {randomBytes} from 'node:crypto';

if(existsSync('.env'))for(const l of readFileSync('.env','utf8').split(/\r?\n/)){
  const m=l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if(m&&!(m[1] in process.env))process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');
}

const E=process.env;
const PORT=+E.PORT||4318;
const MAX=8*1024*1024;
const GMAIL=E.GMAIL_USER||'truecraftnotes.ss@gmail.com';
const APP=(E.GMAIL_APP_PASSWORD||'').replace(/\s/g,'');
const RESEND_KEY=(E.RESEND_API_KEY||'').trim();
const RESEND_FROM=(E.RESEND_FROM||'TrueCraft Notes <onboarding@resend.dev>').trim();
const TO=E.OWNER_EMAIL||GMAIL;
const RATE=4;

const KINDS=['College','School','Office'];
const SIG=[
  ['application/pdf','pdf',[37,80,68,70,45]],
  ['image/jpeg','jpg',[255,216,255]],
  ['image/png','png',[137,80,78,71,13,10,26,10]]
];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const b64=b=>Buffer.from(b).toString('base64').replace(/.{76}/g,'$&\r\n');
const enc=t=>'=?UTF-8?B?'+Buffer.from(t).toString('base64')+'?=';
const clean=s=>String(s||'').replace(/[\r\n\0]/g,' ').trim();

function mime({replyTo,subject,html,files}){
  const B='tc'+randomBytes(8).toString('hex');
  let m=`From: ${enc('TrueCraft Orders')} <${GMAIL}>\r\nTo: <${TO}>\r\n`+
    (replyTo?`Reply-To: <${replyTo}>\r\n`:'')+
    `Subject: ${enc(subject)}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=${B}\r\n\r\n`+
    `--${B}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(html)}\r\n`;
  for(const f of files){
    m+=`--${B}\r\nContent-Type: ${f.type}; name="${f.safe}"\r\nContent-Disposition: attachment; filename="${f.safe}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(f.buf)}\r\n`;
  }
  return m+`--${B}--`;
}

function smtp(msg){
  return new Promise((res,rej)=>{
    if(!GMAIL||!TO)return rej(new Error('GMAIL_USER is not set in .env'));
    if(!APP&&!E.SMTP_HOST)return rej(new Error('GMAIL_APP_PASSWORD is missing in .env'));
    const host=E.SMTP_HOST||'smtp.gmail.com',port=+E.SMTP_PORT||465;
    const s=(E.SMTP_TLS==='0'?net.connect:tls.connect)({host,port,servername:host});
    const cmds=[null,'EHLO truecraft.local',...(APP?['AUTH PLAIN '+Buffer.from('\0'+GMAIL+'\0'+APP).toString('base64')]:[]),`MAIL FROM:<${GMAIL}>`,`RCPT TO:<${TO}>`,'DATA',msg.replace(/^\./gm,'..')+'\r\n.','QUIT'];
    const ok=[220,250,...(APP?[235]:[]),250,250,354,250,221];
    let i=0,buf='';
    s.setTimeout(60000,()=>s.destroy(new Error('SMTP timeout (host may block port '+port+')')));
    s.on('error',rej);
    s.on('data',d=>{
      buf+=d;let n;
      while((n=buf.indexOf('\r\n'))>=0){
        const line=buf.slice(0,n);buf=buf.slice(n+2);
        if(line[3]==='-')continue;
        if(+line.slice(0,3)!==ok[i]){s.destroy();return rej(new Error('SMTP: '+line))}
        if(++i<cmds.length)s.write(cmds[i]+'\r\n');else{s.end();res()}
      }
    });
  });
}

async function sendResend({replyTo,subject,html,files}){
  if(!TO)throw new Error('Recipient email is missing');
  const payload={
    from:RESEND_FROM,
    to:[TO],
    subject,
    html,
    ...(replyTo?{reply_to:replyTo}:{}),
    ...(files&&files.length?{
      attachments:files.map(f=>({
        filename:f.safe||f.name,
        content:Buffer.from(f.buf).toString('base64')
      }))
    }:{})
  };
  const r=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{
      'Authorization':'Bearer '+RESEND_KEY,
      'Content-Type':'application/json'
    },
    body:JSON.stringify(payload)
  });
  const text=await r.text();
  if(!r.ok)throw new Error(`Resend HTTP ${r.status}: ${text}`);
}

function orderMail(o,files){
  const row=(k,v)=>`<tr><td style="padding:10px 14px;border-bottom:1px solid #e6ecf5;color:#5a6685;font-weight:700;width:160px;vertical-align:top">${k}</td><td style="padding:10px 14px;border-bottom:1px solid #e6ecf5;color:#162447">${v}</td></tr>`;
  const fileList=files.map((f,i)=>`${i+1}. <b>${esc(f.name)}</b> <span style="color:#5a6685">(${(f.buf.length/1048576).toFixed(2)} MB)</span>`).join('<br>');
  return {
    replyTo:o.email,
    subject:`[TrueCraft Order #${o.ref}] ${o.kind} · ${o.sides} sides · ₹${o.total} · ${o.name}`,
    files,
    html:`<div style="font:15px/1.6 Arial,sans-serif;background:#eef3fa;padding:24px">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d7e2f2">
        <div style="background:#162447;color:#ffffff;padding:22px 26px">
          <div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#ffe14d;font-weight:700">TrueCraft Notes · New Customer Order</div>
          <h2 style="margin:6px 0 0;font-size:24px">Order #${o.ref} &nbsp;·&nbsp; <span style="color:#ffe14d">₹${o.total}</span></h2>
        </div>
        <div style="padding:18px 20px">
          <table style="width:100%;border-collapse:collapse">
            ${row('Customer Name',`<b>${esc(o.name)}</b>`)}
            ${row('Customer Email',`<a href="mailto:${esc(o.email)}" style="color:#1f3a8a;font-weight:700">${esc(o.email)}</a>`)}
            ${row('Phone / WhatsApp',esc(o.phone)||'Not provided')}
            ${row('Work Type',`<b>${esc(o.kind)}</b>`)}
            ${row('Written Sides',`<b>${o.sides}</b> sides (₹4/side)`)}
            ${row('Estimated Total',`<b style="font-size:17px;color:#12906f">₹${o.total}</b>`)}
            ${row('Needed By',esc(o.deadline)||'Flexible / Not specified')}
            ${row('Instructions',esc(o.notes).replace(/\n/g,'<br>')||'None')}
            ${row('Attached Files',fileList)}
            ${row('Submitted At',new Date(o.created).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}))}
          </table>
          <p style="margin:18px 0 6px;font-size:13px;color:#5a6685">All uploaded documents are attached to this email. Simply hit <b>Reply</b> to message the customer directly.</p>
        </div>
      </div>
    </div>`
  };
}

async function sendMail(mail){
  if(RESEND_KEY)return await sendResend(mail);
  await smtp(mime(mail));
}

async function deliver(dir,mail){
  for(const wait of [0,20e3,90e3,300e3]){
    await new Promise(r=>setTimeout(r,wait));
    try{
      await sendMail(mail);
      writeFileSync(dir+'/sent.flag',new Date().toISOString());
      console.log('Emailed',dir,'to',TO);
      return;
    }catch(e){console.error('Email failed:',e.message)}
  }
  console.error('GAVE UP emailing',dir,'- files are saved there. Fix .env or RESEND_API_KEY and restart; unsent orders are retried on start.');
}

mkdirSync('orders',{recursive:true});
function resend(){
  for(const d of readdirSync('orders')){
    const dir='orders/'+d;
    if(existsSync(dir+'/order.json')&&!existsSync(dir+'/sent.flag')){
      const o=JSON.parse(readFileSync(dir+'/order.json','utf8'));
      const files=o.files.map(f=>({...f,buf:readFileSync(dir+'/'+f.safe)}));
      deliver(dir,orderMail(o,files));
    }
  }
}

const pages=Object.fromEntries(readdirSync('public').map(n=>[n,readFileSync('public/'+n)]));
const types={html:'text/html; charset=utf-8',svg:'image/svg+xml',jpg:'image/jpeg',png:'image/png',css:'text/css',js:'text/javascript'};
const hits=new Map();
const json=(res,code,o)=>res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(o));
const fail=(res,code,error)=>json(res,code,{error});

async function order(req,res){
  const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
  const now=Date.now(),recent=(hits.get(ip)||[]).filter(t=>now-t<6e5);
  if(recent.length>=RATE)return fail(res,429,'Too many orders from this connection. Please try again in a few minutes.');
  let size=0;const chunks=[];
  for await(const c of req){size+=c.length;if(size>3*MAX+131072)return fail(res,413,'Files are too large. Each file must be under 8 MB.');chunks.push(c)}
  let f;try{f=await new Response(Buffer.concat(chunks),{headers:{'content-type':req.headers['content-type']||''}}).formData()}catch{return fail(res,400,'Please use the order form on the website.')}
  if(f.get('website'))return json(res,200,{ok:true,ref:'SPAM0000',total:0});

  const o={
    name:clean(f.get('name')).slice(0,80),
    email:clean(f.get('email')).toLowerCase(),
    phone:clean(f.get('phone')).slice(0,24),
    kind:f.get('kind'),
    sides:Number(f.get('sides')),
    deadline:clean(f.get('deadline')).slice(0,40),
    notes:String(f.get('notes')||'').slice(0,1800)
  };
  if(o.name.length<2)return fail(res,400,'Please enter your name.');
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(o.email)||o.email.length>254)return fail(res,400,'Please enter a valid email so the studio can reach you.');
  if(!KINDS.includes(o.kind))return fail(res,400,'Choose School, College or Office.');
  if(!Number.isInteger(o.sides)||o.sides<1||o.sides>1000)return fail(res,400,'Written sides must be a whole number from 1 to 1000.');

  const up=f.getAll('file').filter(x=>x&&typeof x.arrayBuffer==='function'&&x.size);
  if(!up.length||up.length>3)return fail(res,400,'Attach 1 to 3 files (PDF, JPG or PNG).');
  const files=[];
  for(const [i,x] of up.entries()){
    if(x.size>MAX)return fail(res,413,`"${x.name}" is over 8 MB.`);
    const buf=Buffer.from(await x.arrayBuffer());
    const t=SIG.find(([,,sig])=>sig.every((b,j)=>buf[j]===b));
    if(!t)return fail(res,400,`"${x.name}" is not a real PDF, JPG or PNG.`);
    files.push({name:clean(x.name).slice(0,120),safe:`file${i+1}.${t[1]}`,type:t[0],buf});
  }
  o.total=o.sides*4;o.ref=randomBytes(4).toString('hex').toUpperCase();o.created=new Date().toISOString();
  const dir=`orders/${o.created.slice(0,10)}-${o.ref}`;mkdirSync(dir,{recursive:true});
  for(const x of files)writeFileSync(`${dir}/${x.safe}`,x.buf);
  writeFileSync(dir+'/order.json',JSON.stringify({...o,files:files.map(({buf,...r})=>r)},null,1));
  hits.set(ip,[...recent,now]);
  deliver(dir,orderMail(o,files));
  json(res,201,{ok:true,ref:o.ref,total:o.total});
}

if(process.argv.includes('--test-mail')){
  try{
    await sendMail({subject:'TrueCraft test email',html:'<p>Your email connection works. Orders will arrive here automatically.</p>',files:[]});
    console.log('Test email sent to',TO);
  }catch(e){console.error('FAILED:',e.message)}
  process.exit();
}

http.createServer(async(req,res)=>{
  try{
    const p=new URL(req.url,'http://x').pathname;
    if(req.method==='POST'&&p==='/api/order')return await order(req,res);
    const name=p==='/'?'index.html':p.slice(1),page=Object.hasOwn(pages,name)&&pages[name];
    if(!page)return res.writeHead(404).end('Not found');
    res.writeHead(200,{'Content-Type':types[name.split('.').pop()]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}).end(page);
  }catch(e){console.error(e);if(!res.headersSent)fail(res,500,'Something went wrong. Please try again.')}
}).listen(PORT,()=>{
  console.log(`\nTrueCraft Notes is live at http://localhost:${PORT}`);
  console.log(RESEND_KEY?`Orders will be emailed to ${TO} via Resend`:(GMAIL&&(APP||E.SMTP_HOST)?`Orders will be emailed to ${TO}`:'!! EMAIL NOT SET UP: add RESEND_API_KEY or GMAIL_APP_PASSWORD (see README.txt). Orders are still saved in the orders folder.'));
  resend();
});
