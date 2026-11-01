/* AmirKala storefront + admin panel — talks to the real backend (/api). Loaded after the inline script. */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
async function api(u,o={}){
  const fd=o.body instanceof FormData;
  const r=await fetch(u,{credentials:'same-origin',...o,headers:{...(o.body&&!fd?{'Content-Type':'application/json'}:{}),...o.headers},body:o.body&&!fd?JSON.stringify(o.body):o.body});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(j.error||'خطا در ارتباط با سرور'),{status:r.status});
  return j}
const CT=['همه','دیجیتال','مد و ورزش','خانه و آشپزخانه','زیبایی','کتاب'];
const CIX={'همه':12,'دیجیتال':0,'مد و ورزش':4,'خانه و آشپزخانه':6,'زیبایی':9,'کتاب':11};
const SC={pending:['در انتظار','y'],shipped:['ارسال شد','g'],done:['تحویل شد','g'],canceled:['لغو شد','r']};
let cu=null,isAdm=false,cat='همه',promo=null,PD={sub:0,disc:0},edi=0,reg=0,pendingChk=0,ci={},AP=[],ORD=[],lastLog=0;

/* ---------- SVG product art (used when a product has no photo) ---------- */
const IC=[
`<rect x='20' y='6' width='24' height='52' rx='5' fill='@d'/><rect x='23' y='11' width='18' height='38' rx='2' fill='@w'/><circle cx='32' cy='54' r='1.8' fill='@w'/>`,
`<path d='M12 38V32a20 20 0 0 1 40 0v6' fill='none' stroke='@d' stroke-width='5' stroke-linecap='round'/><rect x='8' y='36' width='12' height='18' rx='5' fill='@d'/><rect x='44' y='36' width='12' height='18' rx='5' fill='@d'/><rect x='11' y='40' width='3' height='9' rx='1.5' fill='@w'/><rect x='50' y='40' width='3' height='9' rx='1.5' fill='@w'/>`,
`<rect x='22' y='4' width='20' height='10' rx='3' fill='@d'/><rect x='22' y='50' width='20' height='10' rx='3' fill='@d'/><rect x='16' y='12' width='32' height='40' rx='10' fill='@d'/><rect x='20' y='16' width='24' height='32' rx='7' fill='@w'/><path d='M32 22v10l6 4' stroke='@d' stroke-width='3' fill='none' stroke-linecap='round'/>`,
`<rect x='12' y='14' width='40' height='28' rx='3' fill='@d'/><rect x='15' y='17' width='34' height='22' rx='1.5' fill='@w'/><path d='M6 46h52l-4 6H10z' fill='@d'/>`,
`<path d='M6 44c0-6 4-8 8-9l8-2 4-8 6 4 10 2c6 1 12 4 12 12v3H6z' fill='@d'/><rect x='6' y='46' width='52' height='6' rx='3' fill='@w'/><path d='M26 28l4 5M32 30l4 5' stroke='@w' stroke-width='2.5' stroke-linecap='round'/>`,
`<rect x='6' y='18' width='52' height='34' rx='7' fill='@d'/><path d='M22 18l3-7h14l3 7z' fill='@d'/><circle cx='32' cy='35' r='12' fill='@w'/><circle cx='32' cy='35' r='7' fill='@d'/><circle cx='49' cy='26' r='2.5' fill='@w'/>`,
`<path d='M12 22h34v18a14 14 0 0 1-14 14h-6a14 14 0 0 1-14-14z' fill='@d'/><path d='M46 26h4a7 7 0 0 1 0 14h-4' fill='none' stroke='@d' stroke-width='4'/><path d='M22 6c-3 4 3 6 0 10M32 6c-3 4 3 6 0 10M42 6c-3 4 3 6 0 10' stroke='@d' stroke-opacity='.5' stroke-width='3' fill='none' stroke-linecap='round'/>`,
`<path d='M16 20h32a12 12 0 0 1 12 12l2 12a7 7 0 0 1-12 5l-6-7H20l-6 7a7 7 0 0 1-12-5l2-12a12 12 0 0 1 12-12z' fill='@d'/><path d='M20 28v8M16 32h8' stroke='@w' stroke-width='3' stroke-linecap='round'/><circle cx='42' cy='30' r='2.5' fill='@w'/><circle cx='48' cy='35' r='2.5' fill='@w'/>`,
`<path d='M24 12a8 8 0 0 1 16 0' fill='none' stroke='@d' stroke-width='4'/><rect x='12' y='12' width='40' height='46' rx='14' fill='@d'/><rect x='20' y='34' width='24' height='16' rx='5' fill='@w'/><path d='M20 24h24' stroke='@w' stroke-width='3' stroke-linecap='round'/>`,
`<rect x='26' y='4' width='12' height='10' rx='2' fill='@d'/><rect x='29' y='14' width='6' height='6' fill='@d'/><rect x='14' y='20' width='36' height='38' rx='9' fill='@d'/><rect x='20' y='30' width='24' height='18' rx='4' fill='@w'/><path d='M26 39h12' stroke='@d' stroke-width='3' stroke-linecap='round'/>`,
`<circle cx='14' cy='42' r='10' fill='none' stroke='@d' stroke-width='4'/><circle cx='50' cy='42' r='10' fill='none' stroke='@d' stroke-width='4'/><path d='M14 42l12-18h16l8 18M26 24l10 18h-22M22 18h8M40 24l-2-8h8' fill='none' stroke='@d' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/>`,
`<path d='M8 12h22a6 6 0 0 1 2 .5V54a6 6 0 0 0-2-.5H8z' fill='@d'/><path d='M56 12H34a6 6 0 0 0-2 .5V54a6 6 0 0 1 2-.5h22z' fill='@d' fill-opacity='.8'/><path d='M14 22h12M14 30h12M38 22h12M38 30h12' stroke='@w' stroke-width='3' stroke-linecap='round'/>`,
`<path d='M32 6l22 12v28L32 58 10 46V18z' fill='@d'/><path d='M32 6l22 12-22 12-22-12z' fill='@w' fill-opacity='.9'/><path d='M32 30v28' stroke='@w' stroke-width='3'/>`,
`<path d='M32 4l6 20 20 8-20 8-6 20-6-20-20-8 20-8z' fill='@d'/>`];
const ic=(i,d='rgba(35,24,90,.9)',w='#fff')=>`<svg viewBox='0 0 64 64' aria-hidden='true'>${(IC[i]||IC[12]).replace(/@d/g,d).replace(/@w/g,w)}</svg>`;

/* ---------- storefront ---------- */
// P row: [name, visual, price, discount, gradient, hidden, category, stock, id, rating, ratingCount, icon]
async function load(){
  try{const l=await api('/api/products');P.length=0;
    l.forEach(p=>P.push([esc(p.name),p.image?`<img src="${esc(p.image)}" alt="" loading="lazy">`:ic(p.icon),p.price,p.discount,p.gradient,0,p.category,p.stock,p.id,p.rating||0,p.rc||0,p.icon]));
    render($('q').value.trim())}catch{toast('خطا در دریافت محصولات')}}
function cats(){$('cats').innerHTML=CT.map(c=>`<div class="cat" style="${c==cat?'border-color:var(--brand2);box-shadow:var(--shadow)':''}" onclick="cat='${c}';cats();render($('q').value.trim())"><i>${ic(CIX[c],'#7c3aed','#ff2e63')}</i>${c}</div>`).join('')}
function render(f=''){
  const l=P.map((p,i)=>({p,i})).filter(o=>!o.p[5]&&(cat=='همه'||CT[o.p[6]]==cat)&&o.p[0].includes(f)).sort((a,b)=>so=='a'?a.p[2]-b.p[2]:so=='d'?b.p[2]-a.p[2]:so=='o'?b.p[3]-a.p[3]:0);
  $('rc').textContent=fa(l.length)+' کالا';
  $('grid').innerHTML=l.map(({p,i})=>{const old=Math.round(p[2]/(1-p[3]/100));
    return `<article class="card rv" style="transition-delay:${(i%6)*70}ms">${p[3]?`<span class="off">${fa(p[3])}٪</span>`:''}<button class="hr" onclick="fv(this)">♡</button><div class="img" style="background:${p[4]};cursor:pointer" onclick="det(${i})"><span>${p[1]}</span></div><h3 style="cursor:pointer" onclick="det(${i})">${p[0]}</h3><div class="meta"><span>⭐ ${p[10]?fa(Number(p[9]).toFixed(1))+' ('+fa(p[10])+')':'بدون نظر'}</span><span>${p[7]>0?CT[p[6]]:'ناموجود'}</span></div><div class="price"><div>${p[3]?`<s>${fa(old)}</s>`:''}<b>${fa(p[2])} <small>تومان</small></b></div><button class="add" onclick="add(${i})">+</button></div></article>`}).join('');
  obs()}
function add(i){const p=P[i];if(cart.filter(x=>x==i).length>=p[7])return toast(p[7]>0?'به سقف موجودی رسیدید':'این کالا ناموجود است');
  cart.push(i);draw();toast('به سبد خرید اضافه شد ✅');const c=$('cnt');c.classList.add('pop');setTimeout(()=>c.classList.remove('pop'),250)}
const stars=n=>'★'.repeat(n)+'☆'.repeat(5-n);
async function det(i){const p=P[i];qt=1;
  mo(`<button class='ib mxb' onclick='mx()'>✕</button><div class='img' style='background:${p[4]};height:180px;font-size:100px'><span>${p[1]}</span></div><h2 style='margin:12px 0 4px'>${p[0]}</h2><div style='color:var(--muted);font-size:13px'>${CT[p[6]]} • ⭐ ${p[10]?fa(Number(p[9]).toFixed(1))+' از '+fa(p[10])+' نظر':'هنوز نظری ثبت نشده'} • موجودی ${fa(p[7])}</div><div class='price'><b style='font-size:21px'>${fa(p[2])} تومان</b><div class='qt'><button onclick='q(-1)'>−</button><span id='qn'>۱</span><button onclick='q(1)'>+</button></div></div><button class='cta fw' onclick='for(let k=0;k<qt;k++)add(${i});mx()'>افزودن به سبد</button><h3 style='margin:18px 0 8px'>نظرات</h3><div id='rvs'><p style='color:var(--muted);font-size:13px'>در حال بارگذاری…</p></div>${cu?`<div class='pf' style='margin-top:10px'><select id='rs' class='sl'>${[5,4,3,2,1].map(n=>`<option value='${n}'>${stars(n)}</option>`).join('')}</select><input id='rt' placeholder='نظر شما…' maxlength='300'><button class='add' style='width:auto;padding:0 14px' onclick='addRv(${i})'>ثبت</button></div>`:`<p style='font-size:13px;color:var(--muted)'>برای ثبت نظر <a style='color:var(--brand);cursor:pointer' onclick='authUI()'>وارد شوید</a></p>`}`);
  try{const l=await api('/api/products/'+p[8]+'/reviews');if($('rvs'))$('rvs').innerHTML=l.map(x=>`<div style='border-top:1px solid var(--line);padding:8px 0;font-size:13px'><b>${esc(x.username)}</b> <span style='color:#f59e0b'>${stars(x.stars)}</span><br>${esc(x.text)}</div>`).join('')||'<p style="color:var(--muted);font-size:13px">اولین نظر را شما بنویسید</p>'}catch{}}
async function addRv(i){try{await api('/api/products/'+P[i][8]+'/reviews',{method:'POST',body:{stars:+$('rs').value,text:$('rt').value}});toast('نظر شما ثبت شد ⭐');await load();det(i)}catch(e){toast(e.message)}}

/* ---------- customer accounts ---------- */
async function who(){try{cu=await api('/api/c/me')}catch{cu=null}uBtn()}
function uBtn(){let b=$('ub');if(!b){$('cb').insertAdjacentHTML('beforebegin',"<button class='ib' id='ub'>👤</button>");b=$('ub');b.onclick=()=>cu?acct():authUI()}b.title=cu?cu.username:'ورود';b.textContent=cu?'😊':'👤'}
function authUI(m){reg=0;mo(`<button class='ib mxb' onclick='mx()'>✕</button><h2>${m||'ورود / ثبت‌نام'}</h2><div class='st'><i class='on' id='t1' style='cursor:pointer' onclick='tab(0)'>ورود</i><i id='t2' style='cursor:pointer' onclick='tab(1)'>ثبت‌نام</i></div><div class='pf' style='flex-direction:column'><input id='au' placeholder='نام کاربری (انگلیسی)' autocomplete='username'><input id='ap2' type='password' placeholder='رمز عبور (حداقل ۶ حرف)' autocomplete='current-password'><input id='ph' placeholder='شماره موبایل ۰۹…' style='display:none'></div><button class='cta fw' id='ab' onclick='doAuth()'>ورود</button>`);$('ap2').onkeydown=e=>e.key=='Enter'&&doAuth()}
function tab(r){reg=r;$('t1').classList.toggle('on',!r);$('t2').classList.toggle('on',!!r);$('ph').style.display=r?'':'none';$('ab').textContent=r?'ساخت حساب':'ورود'}
async function doAuth(){try{cu=await api(reg?'/api/c/register':'/api/c/login',{method:'POST',body:{username:$('au').value.trim(),password:$('ap2').value,phone:reg?$('ph').value:undefined}});mx();uBtn();toast('خوش آمدید '+cu.username+' 👋');if(pendingChk){pendingChk=0;chk()}}catch(e){toast(e.message)}}
async function outC(){await api('/api/c/logout',{method:'POST'}).catch(()=>{});cu=null;uBtn();mx();toast('از حساب خارج شدید')}
async function acct(){let l=[];try{l=await api('/api/c/orders')}catch{}
  mo(`<button class='ib mxb' onclick='mx()'>✕</button><h2>👤 ${esc(cu.username)}</h2><p style='color:var(--muted);font-size:13px'>${fa(l.length)} سفارش</p><div style='max-height:50vh;overflow:auto'>${l.map(o=>`<div style='border:1px solid var(--line);border-radius:14px;padding:10px;margin:8px 0;font-size:13px'><b>#${fa(o.id)}</b> <span class='bd ${SC[o.status][1]}'>${SC[o.status][0]}</span><br>${esc(o.items)}<br><b>${fa(o.total)} تومان</b>${o.code?` <small>(کد ${esc(o.code)})</small>`:''}<br><small style='color:var(--muted)'>${new Date(o.created).toLocaleDateString('fa-IR')}</small></div>`).join('')||'<p>هنوز سفارشی ندارید</p>'}</div><button class='cta fw' onclick='outC()'>خروج از حساب</button>`)}

/* ---------- cart, promo codes, checkout ---------- */
const cartItems=()=>{const c={};cart.forEach(i=>c[P[i][8]]=(c[P[i][8]]||0)+1);return Object.entries(c).map(([id,qty])=>({id:+id,qty}))};
function paint(){const s=cart.reduce((a,i)=>a+P[i][2],0),d=PD.sub===s?PD.disc:0;$('tot').textContent=fa(s-d)+' تومان';$('pmsg').textContent=d?`کد ${promo} اعمال شد: −${fa(d)} تومان`:''}
async function refPromo(){if(!promo||!cart.length){PD={sub:0,disc:0};return paint()}
  try{const r=await api('/api/promo',{method:'POST',body:{items:cartItems(),code:promo}});PD={sub:r.subtotal,disc:r.discount}}catch(e){promo=null;PD={sub:0,disc:0};toast(e.message)}paint()}
function draw(){$('cnt').textContent=fa(cart.length);
  $('items').innerHTML=cart.length?cart.map((i,k)=>`<div class="it"><em>${P[i][1]}</em><div>${P[i][0]}<br><b>${fa(P[i][2])} تومان</b></div><button onclick="rm(${k})">🗑</button></div>`).join(''):'<p style="text-align:center;color:var(--muted);margin-top:40px">سبد خرید خالی است 🛍️</p>';
  paint();if(promo)refPromo()}
$('items').insertAdjacentHTML('afterend',"<div class='pf' style='margin:0 0 6px'><input id='pcd' placeholder='کد تخفیف' dir='ltr'><button class='add' style='width:auto;padding:0 14px' onclick='applyCode()'>اعمال</button></div><div id='pmsg' style='font-size:12px;color:#10b981;margin-bottom:8px'></div>");
async function applyCode(){const c=$('pcd').value.trim().toUpperCase();if(!c||!cart.length)return toast('ابتدا کالا به سبد اضافه کنید و کد را بنویسید');
  try{const r=await api('/api/promo',{method:'POST',body:{items:cartItems(),code:c}});promo=c;PD={sub:r.subtotal,disc:r.discount};paint();toast('کد تخفیف اعمال شد 🎁')}catch(e){toast(e.message)}}
function chk(){if(!cart.length)return toast('سبد خرید خالی است');tg(false);if(!cu){pendingChk=1;return authUI('برای ثبت سفارش وارد شوید')}
  mo(`<button class='ib mxb' onclick='mx()'>✕</button><h2>تکمیل سفارش</h2><div class='st'><i>۱ آدرس</i><i>۲ پرداخت</i><i>۳ تایید</i></div><div id='sb'></div>`);s1();if(cu.phone)$('ap').value=cu.phone}
document.querySelector('#drawer .cta').onclick=chk;
function s2(){const n=$('an').value.trim(),ph=$('ap').value.replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/\s/g,''),a=$('aa').value.trim();
  if(n.length<3||!/^09\d{9}$/.test(ph)||a.length<8)return toast('نام، موبایل (۰۹…) و آدرس کامل را وارد کنید');
  ci={n,ph,a};stp(1);const s=cart.reduce((x,i)=>x+P[i][2],0),d=PD.sub===s?PD.disc:0;
  $('sb').innerHTML=`<p style='margin:14px 0;line-height:2'>جمع: ${fa(s)}<br>تخفیف: ${fa(d)}<br><b>قابل پرداخت: ${fa(s-d)} تومان</b></p><label class='opt'><input type='radio' name='pm' value='cod' checked> پرداخت در محل</label><label class='opt' style='margin-top:8px'><input type='radio' name='pm' value='card'> کارت‌به‌کارت</label><button class='cta fw' id='fin' onclick='s3()'>ثبت نهایی سفارش</button>`}
async function s3(){const b=$('fin');b.disabled=true;const m=document.querySelector('input[name=pm]:checked').value;
  try{const r=await api('/api/orders',{method:'POST',body:{name:ci.n,phone:ci.ph,address:ci.a,pay:m,code:promo||'',items:cartItems()}});
    cart=[];promo=null;PD={sub:0,disc:0};draw();stp(2);
    $('sb').innerHTML=`<div class='ok'><svg viewBox='0 0 52 52' width='96'><circle class='cc' cx='26' cy='26' r='24' fill='none' stroke='#10b981' stroke-width='3' pathLength='1'/><path class='cp' d='M14 27l8 8 16-17' fill='none' stroke='#10b981' stroke-width='4' pathLength='1'/></svg><h3>سفارش ثبت شد 🎉</h3><p style='color:var(--muted)'>شماره سفارش #${fa(r.id)} — از «حساب من» پیگیری کنید</p>${r.card?`<p style='margin-top:10px'>مبلغ ${fa(r.total)} تومان را به کارت <b dir='ltr'>${esc(r.card)}</b> واریز و رسید را برای پشتیبانی ارسال کنید.</p>`:''}</div>`;cf();load()}
  catch(e){b.disabled=false;toast(e.message)}}

/* ---------- admin panel ---------- */
function loginUI(){mo(`<button class='ib mxb' onclick='mx();location.hash=""'>✕</button><h2>ورود مدیر</h2><div class='pf' style='flex-direction:column;margin-top:14px'><input id='lu' placeholder='نام کاربری' autocomplete='username'><input id='lp' type='password' placeholder='رمز عبور' autocomplete='current-password'></div><button class='cta fw' onclick='doLogin()'>ورود</button>`);$('lp').onkeydown=e=>e.key=='Enter'&&doLogin()}
async function doLogin(){try{await api('/api/login',{method:'POST',body:{username:$('lu').value,password:$('lp').value}});isAdm=true;mx();route()}catch(e){toast(e.message)}}
async function route(){const o=location.hash==='#admin';
  if(o&&!isAdm){try{await api('/api/me');isAdm=true}catch{isAdm=false}}
  if(o&&!isAdm){A.classList.remove('open');document.body.style.overflow='';return loginUI()}
  A.classList.toggle('open',o);document.body.style.overflow=o?'hidden':'';if(o)refresh()}
onhashchange=route;
$('lo').onclick=async()=>{await api('/api/logout',{method:'POST'}).catch(()=>{});isAdm=false;location.hash='';route()};
function count(){document.querySelectorAll('.kc b').forEach(e=>{const to=+e.dataset.v,from=e._v||0,t0=performance.now();e._v=to;(function f(t){const k=Math.min(1,(t-t0)/1000),x=1-Math.pow(1-k,3);e.textContent=fa(Math.round(from+(to-from)*x));if(k<1)requestAnimationFrame(f)})(t0)})}
function kp(s){const L=[['فروش امروز (تومان)',s.sales],['سفارش‌های امروز',s.orders],['مشتریان ثبت‌نام‌شده',s.customers],['سفارش‌های در انتظار',s.pending]];
  document.querySelectorAll('.kc').forEach((k,i)=>{k.querySelector('small').textContent=L[i][0];k.querySelector('em').textContent='';k.querySelector('b').dataset.v=L[i][1]});count()}
function ro(){$('ot').innerHTML=ORD.map(o=>`<tr><td>#${fa(o.id)}</td><td>${esc(o.name)}<br><small style='color:var(--muted)'>${esc(o.phone)} — ${esc(o.address)}</small><br><small style='color:var(--muted)'>${esc(o.items)}${o.code?' • کد '+esc(o.code):''}${o.pay=='card'?' • کارت‌به‌کارت':''}</small></td><td>${fa(o.total)}</td><td><select class='sl' ${o.status=='canceled'?'disabled':''} onchange='setSt(${o.id},this.value)'>${Object.entries(SC).map(([k,v])=>`<option value='${k}' ${k==o.status?'selected':''}>${v[0]}</option>`).join('')}</select></td></tr>`).join('')}
async function setSt(id,s){try{await api('/api/admin/orders/'+id,{method:'PATCH',body:{status:s}});toast('وضعیت سفارش بروز شد')}catch(e){toast(e.message)}refresh()}
function pl(){$('pt').innerHTML=AP.map(p=>`<tr><td><span class='th'>${p.image?`<img src='${esc(p.image)}' alt=''>`:ic(p.icon)}</span></td><td>${esc(p.name)}</td><td>${fa(p.price)}</td><td>${fa(p.discount)}٪</td><td>${fa(p.stock)} • ${CT[p.category]||''}</td><td><button class='ib' style='width:34px;height:34px;font-size:14px' onclick='ed(${p.id})'>✏️</button> <button class='ib' style='width:34px;height:34px;font-size:14px' onclick='delP(${p.id})'>🗑</button></td></tr>`).join('')}
function ed(id){const p=AP.find(x=>x.id==id);if(!p)return;edi=id;$('pn').value=p.name;$('pp').value=p.price;$('pd').value=p.discount;$('ps').value=p.stock;$('pc').value=p.category;$('pa').textContent='ذخیره';$('pn').focus();toast('برای تغییر عکس، فایل جدید انتخاب کنید')}
async function delP(id){if(!confirm('این محصول حذف شود؟'))return;try{await api('/api/admin/products/'+id,{method:'DELETE'});toast('حذف شد');await load();refresh()}catch(e){toast(e.message)}}
$('pe').style.display='none';
$('pe').insertAdjacentHTML('afterend',"<input id='pf' type='file' accept='image/png,image/jpeg,image/webp' title='عکس محصول' style='max-width:210px'><input id='ps' type='number' placeholder='موجودی' style='max-width:100px'>");
$('pa').insertAdjacentHTML('beforebegin',`<select id='pc' class='sl'>${CT.slice(1).map((c,k)=>`<option value='${k+1}'>${c}</option>`).join('')}</select>`);
$('pa').onclick=async()=>{const n=$('pn').value.trim(),pr=+$('pp').value;if(n.length<2||!(pr>=1000))return toast('نام و قیمت (حداقل ۱٬۰۰۰) را درست وارد کنید');
  try{let image='';const f=$('pf').files[0];if(f){const fd=new FormData();fd.append('image',f);image=(await api('/api/admin/upload',{method:'POST',body:fd})).url}
    const body={name:n,price:pr,discount:$('pd').value||0,stock:$('ps').value,category:+$('pc').value,image};
    if(edi)await api('/api/admin/products/'+edi,{method:'PUT',body});else await api('/api/admin/products',{method:'POST',body});
    edi=0;$('pa').textContent='افزودن';['pn','pp','pd','ps','pf'].forEach(k=>$(k).value='');toast('ذخیره شد ✅');await load();refresh()}catch(e){toast(e.message)}};
$('ot').closest('.pn').querySelector('h3').insertAdjacentHTML('beforeend',"<button class='add' style='width:auto;padding:0 12px;margin-right:10px;font-size:13px' onclick=\"location.href='/api/admin/orders.csv'\">⬇ خروجی اکسل</button>");
$('pt').closest('.pn').insertAdjacentHTML('afterend',"<div class='pn' style='margin-top:14px'><h3>کدهای تخفیف</h3><div class='pf'><input id='cc' placeholder='کد (مثلاً EID20)' dir='ltr' maxlength='12'><input id='cp' type='number' placeholder='درصد تخفیف' style='max-width:130px'><button class='add' style='width:auto;padding:0 18px' onclick='addCode()'>افزودن</button></div><table><tbody id='ct'></tbody></table></div>");
function cl(l){$('ct').innerHTML=l.map(c=>`<tr><td dir='ltr'><b>${esc(c.code)}</b></td><td>${c.pct?fa(c.pct)+'٪':fa(c.amt)+' تومان'}</td><td><button class='ib' style='width:34px;height:34px;font-size:14px' onclick='delCode("${esc(c.code)}")'>🗑</button></td></tr>`).join('')||'<tr><td>هنوز کدی ساخته نشده</td></tr>'}
async function addCode(){try{await api('/api/admin/codes',{method:'POST',body:{code:$('cc').value,pct:$('cp').value}});$('cc').value=$('cp').value='';toast('کد اضافه شد');refresh()}catch(e){toast(e.message)}}
async function delCode(c){try{await api('/api/admin/codes/'+encodeURIComponent(c),{method:'DELETE'});refresh()}catch(e){toast(e.message)}}
async function refresh(){if(!A.classList.contains('open'))return;
  try{const[s,o,p,c]=await Promise.all([api('/api/admin/stats'),api('/api/admin/orders'),api('/api/admin/products'),api('/api/admin/codes')]);
    kp(s);const mxv=Math.max(1,...s.series);D=s.series.map(v=>12+v/mxv*165);ch();ORD=o;ro();AP=p;pl();cl(c)}
  catch(e){if(e.status==401){isAdm=false;route()}}}
async function logs(){if(!A.classList.contains('open'))return;
  try{const r=await api('/api/admin/logs?after='+lastLog),lg=$('lg');
    r.forEach(x=>{lastLog=Math.max(lastLog,x.id);const c={INFO:'#38bdf8',OK:'#34d399',WARN:'#fbbf24',ERROR:'#fb7185'}[x.level]||'#94a3b8',d=document.createElement('div');d.innerHTML=`<span style='color:#64748b'>${new Date(x.ts).toTimeString().slice(0,8)}</span> <b style='color:${c}'>${esc(x.level)}</b> ${esc(x.msg)}`;lg.appendChild(d)});
    while(lg.children.length>80)lg.firstChild.remove();if(r.length)lg.scrollTop=lg.scrollHeight}catch{}}
setInterval(logs,2000);setInterval(refresh,10000);

/* ---------- hero art, footer, init ---------- */
const hf=(s,i)=>{const e=document.querySelector(s);if(e)e.innerHTML=ic(i,'#fff','rgba(124,58,237,.9)')};hf('.float:not(.f2):not(.f3)',0);hf('.f2',1);hf('.f3',13);
document.querySelector('footer').innerHTML='ساخته شده توسط موسوی<br>هرگونه کپی‌برداری ممنوع است. با تشکر';
cats();who();load();route();
