/**
 * eTabeeb prescription stationery (HTML/CSS) — one template for the WhatsApp
 * image(s) and the PDF. A small in-page paginator flows the content blocks into
 * fixed A4 sheets: sheet 1 carries the full letterhead and the clinical
 * sidebar, continuation sheets a reduced header; every sheet shows the doctor,
 * patient, prescription ID and "Page X of Y".
 *
 * Every value is HTML-escaped; the page loads nothing from the network (fonts,
 * logo and QR are data URIs) and the renderer blocks all requests.
 */
import type { RxDocument, RxMedicine } from './document'

export interface TemplateAssets {
  logoDataUri: string
  naskhFontDataUri: string
  sansFontDataUri: string
  /** QR code as an SVG data URI, or null (drafts). */
  qrDataUri: string | null
}

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** Multi-line doctor text → escaped paragraphs (dir=auto keeps Pashto RTL and English LTR). */
const paras = (text: string | null | undefined): string[] =>
  (text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

const PS = {
  patient: 'د ناروغ معلومات',
  name: 'نوم',
  age: 'عمر',
  sex: 'جنس',
  male: 'نارینه',
  female: 'ښځینه',
  location: 'ځای',
  clinical: 'کلینیکي یادښتونه',
  weight: 'وزن',
  pulse: 'نبض',
  bp: 'د وینې فشار',
  rr: 'تنفس',
  temp: 'تبه',
  complaint: 'اصلي شکایت',
  diagnosis: 'تشخیص',
  date: 'نېټه',
  rxId: 'د نسخې شمېره',
  medicines: 'درمل',
  more: 'نورې لارښوونې',
  investigations: 'معاینات',
  advice: 'مشورې',
  followUp: 'بیا کتنه',
  redFlags: 'بېړنۍ لارښوونه',
  verify: 'د نسخې تایید',
  appointment: 'د آنلاین مشورې لپاره د واټس‌اپ، زنګ یا وېب‌سایټ له لارې وخت واخلئ.',
  whatsapp: 'واټس‌اپ',
  draft: 'مسوده',
  issued: 'د eTabeeb له لارې په ډیجیټل ډول صادره شوې',
} as const

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

function medicineBlock(m: RxMedicine, n: number): string {
  const title = [m.name, m.strength, m.formulation].filter(Boolean).map(esc).join(' ')
  const how = [m.dose, m.frequency, m.route, m.timing].filter(Boolean).map(esc).join(' · ')
  return `<div class="blk med" data-blk>
    <div class="med-n">${n}</div>
    <div class="med-b">
      <div class="med-t" dir="ltr">${title}</div>
      ${how ? `<div class="med-h" dir="ltr">${how}${m.duration ? ` <span class="dur">— ${esc(m.duration)}</span>` : ''}</div>` : m.duration ? `<div class="med-h" dir="ltr"><span class="dur">${esc(m.duration)}</span></div>` : ''}
      ${m.instructions ? `<div class="med-i" dir="auto">${esc(m.instructions)}</div>` : ''}
    </div>
  </div>`
}

function section(key: string, title: string, lines: string[], cls = ''): string[] {
  if (lines.length === 0) return []
  // Heading travels with the first paragraph; long sections paginate by paragraph
  return lines.map(
    (l, i) =>
      `<div class="blk sec ${cls}" data-blk data-sec="${key}">${i === 0 ? `<div class="sec-h"><span>${title}</span></div>` : ''}<p dir="auto">${esc(l)}</p></div>`,
  )
}

export function buildRxHtml(doc: RxDocument, a: TemplateAssets): string {
  const p = doc.patient
  const sex = p.sex === 'MALE' ? PS.male : p.sex === 'FEMALE' ? PS.female : null
  const v = doc.vitals
  const sideRows = (rows: Array<[string, string | number | null | undefined]>) =>
    rows
      .filter(([, val]) => val !== null && val !== undefined && String(val).trim() !== '')
      .map(([k, val]) => `<div class="kv"><span class="k">${k}</span><span class="v" dir="auto">${esc(val)}</span></div>`)
      .join('')
  const patientRows = sideRows([[PS.name, p.name], [PS.age, p.age], [PS.sex, sex], [PS.location, p.location]])
  const clinicalRows = sideRows([
    [PS.weight, v.weight],
    [PS.pulse, v.pulse],
    [PS.bp, v.bp],
    [PS.rr, v.respiratoryRate],
    [PS.temp, v.temperature],
  ])
  const notes = [
    doc.complaint ? `<div class="note"><div class="k">${PS.complaint}</div><div class="v" dir="auto">${esc(doc.complaint)}</div></div>` : '',
    doc.diagnosis ? `<div class="note"><div class="k">${PS.diagnosis}</div><div class="v" dir="auto">${esc(doc.diagnosis)}</div></div>` : '',
  ].join('')

  const followUp = [
    ...(doc.followUpInterval ? [`${doc.followUpInterval}`] : []),
    ...paras(doc.followUp),
  ]
  const blocks = [
    ...doc.medicines.map((m, i) => medicineBlock(m, i + 1)),
    ...section('free', PS.more, paras(doc.freeText)),
    ...section('inv', PS.investigations, paras(doc.investigations)),
    ...section('adv', PS.advice, paras(doc.advice)),
    ...section('fu', PS.followUp, followUp),
    ...section('rf', PS.redFlags, paras(doc.redFlags), 'red'),
  ]
  const signature = `<div class="sign"><div class="sig-line"></div><div class="sig-n" dir="ltr">${esc(doc.doctor.nameEn)}</div><div class="sig-s" dir="rtl">${PS.issued}</div></div>`

  const drName = esc(doc.doctor.nameEn)
  const ref = `${esc(doc.rxNumber)}${doc.revision > 1 ? ` · Rev ${doc.revision}` : ''}`
  const draft = doc.status === 'DRAFT'

  return `<!doctype html><html lang="ps"><head><meta charset="utf-8">
<style>
@font-face{font-family:'Naskh';src:url('${a.naskhFontDataUri}') format('truetype');font-weight:100 900}
@font-face{font-family:'NSans';src:url('${a.sansFontDataUri}') format('truetype');font-weight:100 900;font-stretch:62.5% 100%}
@page{size:A4;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}
body{font-family:'NSans','Naskh',sans-serif;color:#13233a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
[dir=rtl],.ps{font-family:'Naskh','NSans',serif}
p{margin:0}
:root{--navy:#0b2a4a;--navy2:#123d63;--teal:#0e8c9a;--turq:#1cc2c9;--gold:#c9a24b;--ink:#13233a;--mist:#eef7f8}
.sheet{width:794px;height:1123px;position:relative;overflow:hidden;page-break-after:always;break-after:page;background:#fff}
.sheet:last-child{page-break-after:auto;break-after:auto}
/* ---------- full letterhead ---------- */
.hd{position:relative;height:232px}
.hd svg.wave{position:absolute;inset:0;width:794px;height:232px}
.hd .en{position:absolute;left:30px;top:22px;width:270px;color:#fff}
.hd .en .n{font-size:21px;font-weight:700;letter-spacing:.2px}
.hd .en .c{font-size:10.6px;line-height:1.42;opacity:.95;margin-top:5px}
.hd .psd{position:absolute;right:30px;top:16px;width:270px;color:#fff;text-align:right}
.hd .psd .n{font-family:'Naskh';font-size:23px;font-weight:700}
.hd .psd .c{font-family:'Naskh';font-size:12.2px;line-height:1.55;opacity:.95;margin-top:2px}
.logo{position:absolute;left:50%;top:14px;transform:translateX(-50%);width:176px;height:176px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px var(--gold),0 6px 18px rgba(11,42,74,.25);overflow:hidden;display:flex;align-items:center;justify-content:center}
.logo img{width:168px;height:168px;object-fit:contain}
/* ---------- reduced header (continuation sheets) ---------- */
.hd2{height:78px;background:linear-gradient(90deg,var(--navy),var(--navy2) 60%,var(--teal));color:#fff;display:flex;align-items:center;gap:14px;padding:0 26px;border-bottom:3px solid var(--gold)}
.hd2 img{width:56px;height:56px;border-radius:50%;background:#fff}
.hd2 .t{font-size:15px;font-weight:700}.hd2 .s{font-size:11px;opacity:.9}
/* ---------- body ---------- */
.body{position:absolute;left:0;right:0;top:232px;bottom:96px;display:flex}
.cont .body{top:78px}
.side{width:212px;background:var(--mist);border-right:2px solid rgba(14,140,154,.25);padding:16px 14px 10px;direction:rtl;font-family:'Naskh'}
.side h4{margin:0 0 6px;font-size:14px;color:var(--teal);border-bottom:1.5px solid var(--gold);padding-bottom:3px}
.side .grp{margin-bottom:16px}
.kv{display:flex;justify-content:space-between;gap:8px;font-size:12.6px;padding:4px 0;border-bottom:1px dashed rgba(19,35,58,.15)}
.kv .k{color:#4a5a6e}.kv .v{font-weight:700;color:var(--ink);text-align:left;font-family:'NSans','Naskh'}
.note{padding:5px 0;border-bottom:1px dashed rgba(19,35,58,.15)}
.note .k{font-size:12px;color:#4a5a6e}.note .v{font-size:12.8px;font-weight:600;line-height:1.5;margin-top:1px;font-family:'NSans','Naskh'}
.main{flex:1;padding:12px 30px 8px 26px;position:relative}
.main.cont-main{padding-top:16px}
.top{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:8px}
.rx{font-family:'Naskh',serif;font-size:66px;line-height:.9;color:var(--navy);font-weight:700}
.rx span{color:var(--teal)}
.meta{text-align:right;font-size:11.5px;color:#3d4d61;line-height:1.6}
.meta b{color:var(--ink);font-size:12.5px}
.meta .ps{font-size:12px}
.flow{position:relative}
.med{display:flex;gap:10px;padding:7px 2px;border-bottom:1px solid rgba(14,140,154,.18)}
.med-n{flex:0 0 26px;height:26px;border-radius:50%;background:var(--navy);color:#fff;font-size:12.5px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px}
.med-b{flex:1;min-width:0}
.med-t{font-size:15.5px;font-weight:700;color:var(--ink);word-wrap:break-word;overflow-wrap:anywhere}
.med-h{font-size:13px;color:#2c3e55;margin-top:2px;overflow-wrap:anywhere}
.med-h .dur{color:var(--teal);font-weight:600}
.med-i{font-size:13.5px;color:#2c3e55;margin-top:2px;font-family:'NSans','Naskh';line-height:1.5;overflow-wrap:anywhere}
.sec{padding:2px 0}
.sec-h{display:flex;align-items:center;gap:10px;margin:9px 0 2px;direction:rtl;line-height:1.5}
.sec-h span{font-family:'Naskh';font-size:15.5px;font-weight:700;color:var(--teal);white-space:nowrap}
.sec-h::after{content:'';flex:1;height:1.5px;background:linear-gradient(270deg,var(--gold),rgba(201,162,75,0))}
.sec p{font-size:13.5px;line-height:1.55;font-family:'NSans','Naskh';overflow-wrap:anywhere;text-align:start}
.sec.red .sec-h span{color:#b42318}
.sec.red p{color:#7a1c14}
.sign{position:absolute;right:30px;bottom:10px;width:230px;text-align:center}
.sig-line{height:1px;background:var(--navy);margin-bottom:4px}
.sig-n{font-size:12.5px;font-weight:700}.sig-s{font-family:'Naskh';font-size:10.5px;color:#4a5a6e}
/* ---------- footer ---------- */
.ft{position:absolute;left:0;right:0;bottom:0;height:96px}
.ft svg{position:absolute;inset:0;width:794px;height:96px}
.ft .in{position:absolute;left:26px;right:26px;bottom:12px;top:22px;display:flex;align-items:center;gap:16px;color:#fff}
.ft .qr{width:62px;height:62px;background:#fff;border-radius:6px;padding:4px;flex:0 0 62px}
.ft .qr img{width:54px;height:54px;display:block}
.ft .qrl{font-family:'Naskh';font-size:9.5px;text-align:center;margin-top:1px;color:#fff;opacity:.9}
.ft .c{flex:1;display:flex;gap:22px;align-items:center;font-size:14px;font-weight:700}
.ft .c .it{display:flex;align-items:center;gap:6px}
.ft .c svg.i{position:static;width:18px;height:18px}
.ft .c .lbl{font-family:'Naskh';font-size:11.5px;font-weight:400;opacity:.9}
.ft .g{font-family:'Naskh';font-size:12.5px;text-align:right;direction:rtl;max-width:250px;line-height:1.5}
.pg{position:absolute;bottom:100px;left:238px;font-size:9.5px;color:#6b7a8c}.cont .pg{left:26px}
.pg b{color:var(--ink)}
.wm{position:absolute;left:0;right:0;top:470px;text-align:center;font-size:120px;font-weight:800;color:rgba(180,35,24,.10);transform:rotate(-24deg);pointer-events:none;letter-spacing:6px}
</style></head><body>
<template id="tpl-first">
  <div class="sheet first">
    <div class="hd">
      <svg class="wave" viewBox="0 0 794 232" preserveAspectRatio="none">
        <defs><linearGradient id="g1" x1="0" x2="1"><stop offset="0" stop-color="#0b2a4a"/><stop offset=".55" stop-color="#123d63"/><stop offset="1" stop-color="#0e8c9a"/></linearGradient></defs>
        <path d="M0 0H794V150C640 210 520 150 397 172C270 194 150 222 0 168Z" fill="url(#g1)"/>
        <path d="M0 168C150 222 270 194 397 172C520 150 640 210 794 150V164C640 222 520 164 397 186C270 208 150 236 0 182Z" fill="#1cc2c9" opacity=".85"/>
        <path d="M0 182C150 236 270 208 397 186C520 164 640 222 794 164" fill="none" stroke="#c9a24b" stroke-width="2.2"/>
      </svg>
      <div class="en" dir="ltr"><div class="n">${drName}</div><div class="c">${doc.doctor.credentialsEn.map(esc).join('<br>')}</div></div>
      <div class="logo"><img src="${a.logoDataUri}" alt="eTabeeb"></div>
      <div class="psd" dir="rtl"><div class="n">${esc(doc.doctor.namePs)}</div><div class="c">${doc.doctor.credentialsPs.map(esc).join('<br>')}</div></div>
    </div>
    <div class="body">
      <aside class="side">
        ${patientRows ? `<div class="grp"><h4>${PS.patient}</h4>${patientRows}</div>` : ''}
        ${clinicalRows || notes ? `<div class="grp"><h4>${PS.clinical}</h4>${clinicalRows}${notes}</div>` : ''}
      </aside>
      <main class="main">
        <div class="top"><div class="rx" dir="ltr">R<span>x</span></div>
          <div class="meta"><div><span class="ps">${PS.date}:</span> <b dir="ltr">${esc(fmtDate(doc.issuedAt))}</b></div><div><span class="ps">${PS.rxId}:</span> <b dir="ltr">${ref}</b></div></div></div>
        <div class="flow" data-flow></div>
      </main>
    </div>
    __FOOTER__
  </div>
</template>
<template id="tpl-cont">
  <div class="sheet cont">
    <div class="hd2"><img src="${a.logoDataUri}" alt=""><div><div class="t" dir="ltr">${drName}</div><div class="s" dir="ltr">${esc(p.name ?? '')} · ${ref}</div></div></div>
    <div class="body"><main class="main cont-main"><div class="flow" data-flow></div></main></div>
    __FOOTER__
  </div>
</template>
<template id="tpl-footer">
  <div class="ft">
    <svg viewBox="0 0 794 96" preserveAspectRatio="none"><defs><linearGradient id="g2" x1="0" x2="1"><stop offset="0" stop-color="#0e8c9a"/><stop offset=".45" stop-color="#123d63"/><stop offset="1" stop-color="#0b2a4a"/></linearGradient></defs>
      <path d="M0 26C180 4 330 30 470 18C600 8 700 2 794 14V96H0Z" fill="url(#g2)"/>
      <path d="M0 26C180 4 330 30 470 18C600 8 700 2 794 14" fill="none" stroke="#c9a24b" stroke-width="2"/></svg>
    <div class="in">
      ${a.qrDataUri ? `<div><div class="qr"><img src="${a.qrDataUri}" alt=""></div><div class="qrl">${PS.verify}</div></div>` : ''}
      <div class="c">
        <div class="it"><svg class="i" viewBox="0 0 24 24"><path fill="#fff" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.3-.5.1-1 .1-1.7-.1-.4-.1-.9-.3-1.5-.6-2.7-1.2-4.4-3.9-4.6-4.1-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.3 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 2 1.1 1 2 1.3 2.3 1.4.3.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.8.9c.3.1.5.2.5.3.1.2.1.7-.1 1.4Z"/></svg><div><div class="lbl">${PS.whatsapp}</div><div dir="ltr">${esc(doc.contact.whatsappDisplay)}</div></div></div>
        <div class="it"><svg class="i" viewBox="0 0 24 24"><path fill="#fff" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 6h-2.9a15.7 15.7 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8ZM12 4a14 14 0 0 1 1.9 4h-3.8A14 14 0 0 1 12 4ZM4.3 14a8.2 8.2 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4Zm.8 2h2.9a15.7 15.7 0 0 0 1.4 3.6A8 8 0 0 1 5.1 16ZM8 8H5.1a8 8 0 0 1 4.3-3.6A15.7 15.7 0 0 0 8 8Zm4 12a14 14 0 0 1-1.9-4h3.8A14 14 0 0 1 12 20Zm2.3-6H9.7a14.7 14.7 0 0 1 0-4h4.6a14.7 14.7 0 0 1 0 4Zm.3 5.6A15.7 15.7 0 0 0 16 16h2.9a8 8 0 0 1-4.3 3.6Zm1.7-5.6a16.5 16.5 0 0 0 0-4h3.4a8.2 8.2 0 0 1 0 4Z"/></svg><div dir="ltr">${esc(doc.contact.website)}</div></div>
      </div>
      <div class="g">${PS.appointment}</div>
    </div>
  </div>
</template>
<div id="pages"></div>
<div id="src" hidden>${blocks.join('')}</div>
<div id="sig" hidden>${signature}</div>
<script>
(function(){
  var footer = document.getElementById('tpl-footer').innerHTML;
  var pages = document.getElementById('pages');
  function sheet(kind){
    var html = document.getElementById(kind === 1 ? 'tpl-first' : 'tpl-cont').innerHTML.replace('__FOOTER__', footer);
    var w = document.createElement('div'); w.innerHTML = html.trim();
    var s = w.firstChild; pages.appendChild(s);
    ${draft ? `var wm=document.createElement('div');wm.className='wm';wm.innerHTML='DRAFT<br>${PS.draft}';s.appendChild(wm);` : ''}
    return s;
  }
  function room(s){ var m = s.querySelector('.main'); var f = s.querySelector('[data-flow]');
    // keep 64px free at the bottom of every sheet for the signature (drawn on the last one)
    return (m.getBoundingClientRect().bottom - 72) - f.getBoundingClientRect().bottom; }
  var src = Array.prototype.slice.call(document.getElementById('src').children);
  var cur = sheet(1), flow = cur.querySelector('[data-flow]');
  src.forEach(function(b){
    flow.appendChild(b);
    if (room(cur) < 0 && flow.children.length > 1) {
      flow.removeChild(b); cur = sheet(2); flow = cur.querySelector('[data-flow]'); flow.appendChild(b);
      // continuation of a section repeats its heading
      if (b.dataset.sec && !b.querySelector('.sec-h')) {
        var h = document.querySelector('[data-sec="'+b.dataset.sec+'"] .sec-h');
        if (h) b.insertBefore(h.cloneNode(true), b.firstChild);
      }
    }
  });
  var all = pages.querySelectorAll('.sheet');
  all[all.length - 1].querySelector('.main').insertAdjacentHTML('beforeend', document.getElementById('sig').innerHTML);
  for (var i = 0; i < all.length; i++) {
    var pg = document.createElement('div'); pg.className = 'pg';
    pg.innerHTML = 'Page <b>' + (i + 1) + '</b> of <b>' + all.length + '</b> · ${ref}';
    all[i].appendChild(pg);
  }
  window.__RX_PAGES = all.length; window.__RX_READY = true;
})();
</script>
</body></html>`
}
