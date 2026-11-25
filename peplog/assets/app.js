
'use strict';

const REPORT_CUTOFF = '23:59';
const routes = { pen: 'SubQ pen', syringe: 'SubQ single-use syringe', nasal: 'Nasal spray', oral: 'Oral' };
const iconPaths = {
  calendar: 'M8 2v4m8-4v4M3 9h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  chart: 'M3 3v18h18M8 16v-4m5 4V7m5 9v-6', settings: 'M4 7h16M4 17h16M9 4v6m6 4v6',
  monthly: 'M3 8h18M7 3v4m10-4v4M3 5h18v16H3ZM7 12h2m2 0h2m2 0h2M7 16h2m2 0h2m2 0h2',
  shield: 'M12 22c-5-2.7-8-5.5-8-11V6l8-4 8 4v5c0 5.5-3 8.3-8 11Zm-3-11 2 2 4-4',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5m-2 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
  moon: 'M20.9 13.3A9 9 0 1 1 10.7 3.1a7 7 0 0 0 10.2 10.2Z',
  microphone: 'M9 4a3 3 0 0 1 6 0v7a3 3 0 1 1-6 0V4Zm-4 6v1a7 7 0 0 0 14 0v-1m-7 8v4m-3 0h6',
  plus: 'M12 5v14M5 12h14', next: 'm9 18 6-6-6-6', prev: 'm15 18-6-6 6-6', down: 'm6 9 6 6 6-6',
  note: 'M5 4h14v16H5zM8 8h8m-8 4h8m-8 4h5',
  application: 'M12 3 7 10a6 6 0 1 0 10 0L12 3Z', weight: 'M4 5h16v15H4zM8 11a4 4 0 0 1 8 0m-4 0 2-2',
  edit: 'm5 16 11-11 3 3L8 19H5v-3Zm9-9 3 3', clock: 'M12 6v6l4 2m5-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  globe: 'M3 12h18m-9-9c2 2 3 5 3 9s-1 7-3 9c-2-2-3-5-3-9s1-7 3-9Zm9 9a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  close: 'm6 6 12 12M6 18 18 6', mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  check: 'm5 12 4 4L19 6', info: 'M12 11v5m0-8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  lock: 'M6 10h12v11H6zM8 10V7a4 4 0 1 1 8 0v3m-4 5v2'
};
let products=[];
let accounts=Object.create(null);
let locales={};
let dictionary={};
let reportRecipient='';
let bf511Metrics={};
let recording=null;
const reportCache=new Map();
const token=document.querySelector('#journal-auth').dataset.token;
let pendingWrite=Promise.resolve();
const state = {
  user:'', lang:'en', page:'calendar', selected:'', month:'',
  adminSection:'users', catalogUser:'', catalogRoute:'pen', entry:null, weightMetric:'weight',
  reportOffsets:{ weekly:0, monthly:0 }
};

const q = (selector, root=document)=>root.querySelector(selector);
const dialog = q('#dialog');
const account = ()=>accounts[state.user];
const t = text=>dictionary[state.lang]?.[text]??text;
const message = (text, values)=>t(text).replace(/\{(\w+)\}/g,(_,key)=>values[key]);
const h = value=>String(value ?? '').replace(/[&<>"']/g, char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const label = value=>h(t(value));
const icon = name=>`<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${iconPaths[name]}"></path></svg>`;
const formatDay = (date, opts)=>new Intl.DateTimeFormat(state.lang,{ timeZone:'UTC', ...opts }).format(new Date(date+'T12:00:00Z'));
const num = (amount, opts={})=>new Intl.NumberFormat(state.lang,opts).format(amount);
const longDate = date=>formatDay(date,{weekday:'long',month:'long',day:'numeric'});
const shortDate = date=>formatDay(date,{month:'short',day:'numeric'});
const calendarName = product=>productName(product).replace(/\s+\([^)]*\)$/, '');

function localClock(timeZone=account().prefs.timeZone, timestamp=new Date()) {
  const format = new Intl.DateTimeFormat('en-CA',{
    timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  });
  const parts=Object.fromEntries(format.formatToParts(timestamp).map(({type,value})=>[type,value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
}

const today = ()=>localClock().date;
const weekdayNumber = date=>new Date(date+'T12:00:00Z').getUTCDay();

function shiftDate(date, days) {
  const result = new Date(date+'T12:00:00Z');
  result.setUTCDate(result.getUTCDate()+days);
  return result.toISOString().slice(0,10);
}
function ageInDays(date, end) {
  return Math.round((Date.parse(end)-Date.parse(date))/86400000);
}
function changeMonth(month, shift) {
  const date = new Date(month+'-01T12:00:00Z');
  date.setUTCMonth(date.getUTCMonth()+shift);
  return date.toISOString().slice(0,7);
}
function findProduct(productId) { return products.find(product=>product.id===productId); }
function methodsFor(items, historicalRoute) {
  const active=new Set(items.map(product=>product.route));
  if (historicalRoute) active.add(historicalRoute);
  return Object.entries(routes).filter(([route])=>active.has(route));
}
function availableProducts(user=account()) {
  return products.filter(product=>user.visible.has(product.id));
}
function productName(product) { return t(product.name); }
function productCaption(product) {
  return productName(product)+(product.label ? ' · '+product.label : '');
}

const typeLabel = { note:'Observation', application:'Application', weight:'Weight' };
const pageInfo = {
  calendar:['Calendar','calendar'], weekly:['Weekly summary','chart','Weekly'],
  monthly:['Monthly summary','monthly','Monthly'], settings:['Settings','settings'],
  weight:['Weight monitoring','weight','Weight'], advancedWeight:['Advanced Weight Monitoring','chart','BF511'],
  admin:['Admin','shield']
};
const pagePermissions={admin:'admin',weight:'weightMonitor',advancedWeight:'advancedWeightMonitor'};
const canOpenPage=page=>!pagePermissions[page]||account()[pagePermissions[page]];
const button = (text, action, {glyph='', variant='', attrs=''}={})=>
  `<button type="button" class="button ${variant ? 'button-'+variant : ''}" data-action="${action}" ${attrs}>${glyph?icon(glyph):''}${label(text)}</button>`;
const iconButton = (text, action, glyph, attrs='')=>
  `<button type="button" class="icon-button" data-action="${action}" title="${label(text)}" aria-label="${label(text)}" ${attrs}>${icon(glyph)}</button>`;
const option = (value, text, selected=false)=>
  `<option value="${h(value)}" ${selected?'selected':''}>${h(text)}</option>`;
const submit = text=>`<button class="button button-primary" type="submit">${label(text)}</button>`;
const field = (text, contents, help='')=>`<label class="field"><span>${label(text)}</span>${contents}${help?`<small>${h(help)}</small>`:''}</label>`;
const info = text=>`<div class="info">${icon('info')}<span>${h(text)}</span></div>`;

function languageOptions(current) {
  return Object.entries(locales).map(([value,name])=>option(value,name,current===value)).join('');
}
function nav() {
  return Object.entries(pageInfo).filter(([page])=>canOpenPage(page)).map(([page,[title,glyph,compact=title]])=>
    `<button class="nav-item" type="button" data-action="page" data-value="${page}" aria-label="${label(title)}" ${state.page===page?'aria-current="page"':''}>${icon(glyph)}<span class="nav-full">${label(title)}</span><span class="nav-compact">${label(compact)}</span></button>`
  ).join('');
}
function renderShell() {
  const who = account();
  document.documentElement.lang=state.lang;
  document.documentElement.dataset.theme=who.prefs.theme;
  q('.skip').textContent=t('Skip to main content');
  for (const selector of ['#side-nav','#mobile-nav']) {
    q(selector).setAttribute('aria-label',t('Main navigation'));
    q(selector).innerHTML=nav();
  }
  q('#demo-label').innerHTML=button('Privacy notice','privacy',{glyph:'lock',variant:'quiet'});
  q('#top-context').textContent=t('Private journal');
  const dark=who.prefs.theme==='dark';
  q('#top-actions').innerHTML=`<label class="locale-control">${icon('globe')}<span class="sr-only">${label('Change language')}</span>
    <select id="locale">${languageOptions(state.lang)}</select></label>
    ${iconButton(dark?'Light theme':'Dark theme','theme',dark?'sun':'moon')}
    <button type="button" class="profile" data-action="account" title="${label('Sign out')}" aria-label="${label('Sign out')} · ${h(who.display)}">
      <span class="avatar" aria-hidden="true">${h(who.display.charAt(0).toUpperCase())}</span><span class="profile-name">${h(who.display)}</span>${icon('down')}
    </button>`;
}
function pageHeader(title, description, actions='') {
  return `<header class="page-head"><div><h1>${label(title)}</h1>${description?`<p class="muted">${h(description)}</p>`:''}</div>
    ${actions?`<div class="toolbar">${actions}</div>`:''}</header>`;
}
function render() {
  renderShell();
  renderMain();
}
function renderMain() {
  const views={
    calendar:renderCalendar, weekly:()=>renderReport('weekly'), monthly:()=>renderReport('monthly'),
    settings:()=>pageHeader('Settings','')+renderPreferences(), weight:renderWeightMonitoring,
    advancedWeight:renderAdvancedWeightMonitoring, admin:renderAdmin
  };
  q('#content').innerHTML=views[state.page]();
}
function setDate(date, focus=false) {
  state.selected=date;
  state.month=date.slice(0,7);
  renderMain();
  if (focus) q(`[data-action="date"][data-value="${date}"]`)?.focus({preventScroll:true});
}
function gotoPage(page) {
  if (!canOpenPage(page)) return;
  state.page=page;
  render();
  q('#content').focus({preventScroll:true});
  window.scrollTo(0,0);
  if (page==='weekly'||page==='monthly') refreshReport();
}
function selectDateForEntry() {
  const current=today();
  return state.selected<=current?state.selected:current;
}

function renderCalendar() {
  const current=today();
  const start = state.month + '-01';
  const offset = (weekdayNumber(start)+6)%7;
  const end = shiftDate(changeMonth(state.month,1)+'-01',-1);
  const cells = Math.ceil((offset+Number(end.slice(-2)))/7)*7;
  const index = new Map();
  for (const entry of account().entries) {
    if (!index.has(entry.date)) index.set(entry.date, []);
    index.get(entry.date).push(entry);
  }
  const weekdays = Array.from({length:7},(_,i)=>
    `<span>${h(formatDay(shiftDate('2026-11-02',i),{weekday:'short'}))}</span>`).join('');
  const grid = Array.from({length:cells},(_,i)=>{
    const date=shiftDate(start,i-offset);
    const entries=index.get(date)??[];
    const otherKinds=[...new Set(entries.filter(entry=>entry.type!=='application').map(entry=>entry.type))];
    const names=[...new Set(entries.filter(entry=>entry.type==='application').map(entry=>calendarName(entry.snapshot)))];
    const applications=names.map(name=>`<span class="marker application" title="${h(name)}">${icon('application')}<span>${h(name)}</span></span>`).join('');
    const otherMarkers=otherKinds.map(kind=>`<span class="marker ${kind}">${icon(kind)}</span>`).join('');
    const classes=['day',date===current?'is-today':'',date===state.selected?'is-selected':'',date.startsWith(state.month)?'':'is-outside'].join(' ');
    const accessible=[longDate(date),date===current?t('Today'):'',...names.map(name=>t('Application')+' '+name),...otherKinds.map(kind=>t(typeLabel[kind]))].filter(Boolean).join(', ');
    return `<button type="button" class="${classes}" aria-label="${h(accessible)}" aria-pressed="${date===state.selected}" ${date===current?'aria-current="date"':''}
      data-action="date" data-value="${date}"><span class="day-number">${Number(date.slice(-2))}</span>
      <span class="markers" aria-hidden="true">${applications}${otherMarkers}</span></button>`;
  }).join('');
  const legend = Object.entries(typeLabel).map(([kind,text])=>`<span class="legend-item ${kind}">${icon(kind)}${label(text)}</span>`).join('');
  return pageHeader('Calendar',t('See your observations, applications and weight by date.'),
    button('Voice note','voice',{glyph:'microphone'})+button('New entry','new',{glyph:'plus',variant:'primary'}))+
    `<div class="calendar-layout"><section class="card calendar-card" aria-label="${label('Calendar')}">
      <div class="cal-top"><h2 class="cal-title">${h(formatDay(start,{month:'long',year:'numeric'}))}</h2>
        <div class="cal-nav">${iconButton('Previous month','prev','prev')}${button('Today','today')}${iconButton('Next month','next','next')}</div></div>
      <div class="cal-weekdays" aria-hidden="true">${weekdays}</div><div class="cal-grid">${grid}</div><div class="legend">${legend}</div>
    </section><aside class="side-stack">${renderDay()}${renderReminder()}
      <section class="report-shortcuts card">${['weekly','monthly'].map(kind=>`<div class="quiet-card">
        <div><h3>${label(pageInfo[kind][0])}</h3><p class="muted small">${h(reportCaption(reportRange(kind,0)))}</p></div>
        ${button('See summary','page',{variant:'quiet',attrs:`data-value="${kind}" aria-label="${label(pageInfo[kind][0])}"`})}</div>`).join('')}</section>
    </aside></div>`;
}
function amountText(entry) {
  if (entry.type==='weight') return num(entry.amount,{minimumFractionDigits:1,maximumFractionDigits:2})+' kg';
  if (entry.amount==null) return t('Not recorded');
  if (entry.unit==='clicks'||entry.unit==='sprays') return num(entry.amount)+' '+t(entry.unit==='clicks'?'Clicks':'Sprays').toLocaleLowerCase(state.lang);
  return num(entry.amount,{maximumFractionDigits:4})+' '+entry.unit;
}
function renderRecord(entry) {
  let title=t(typeLabel[entry.type]);
  let caption=entry.note??'';
  if (entry.type==='application') {
    title=productName(entry.snapshot);
    caption=(entry.time||t('Time not recorded'))+' · '+t(routes[entry.route])+' · '+amountText(entry)+(caption?'\n'+caption:'');
  } else if (entry.type==='weight') {
    caption=amountText(entry);
  }
  return `<article class="record"><span class="tile-icon ${entry.type}">${icon(entry.type)}</span>
    <div><div class="record-title">${h(title)}</div><p>${h(caption)}</p></div>
    ${iconButton('Edit entry','edit','edit',`data-value="${entry.id}"`)}</article>`;
}
function renderDay() {
  const date=state.selected;
  const current=today();
  const entries=account().entries.filter(entry=>entry.date===date)
    .sort((a,b)=>(a.time??'').localeCompare(b.time??''));
  const addable=date<=current;
  let detail=entries.length?entries.map(renderRecord).join(''):`<p class="empty small">${label('No entries for this day.')}</p>`;
  return `<section class="card day-panel" aria-label="${label('Selected day')}"><div class="day-panel-head"><div>
    <span>${label(date===current?'Today':'Selected day')}</span><h2>${h(formatDay(date,{weekday:'long',month:'short',day:'numeric'}))}</h2></div>
    ${addable?iconButton('New entry','new','plus'):''}</div>
    <div class="records">${detail}</div>
    ${addable?`<div class="row-actions day-secondary">${button('Add observation','note',{variant:'quiet'})}${button('Log weight','weight',{variant:'quiet'})}</div>`:''}
  </section>`;
}
function renderReminder() {
  if (!account().prefs.weigh) return '';
  const current=today();
  const last=account().entries.filter(entry=>entry.type==='weight'&&entry.date<=current).sort((a,b)=>b.date.localeCompare(a.date))[0];
  if (last && ageInDays(last.date,current)<6) return '';
  const title=last ? (ageInDays(last.date,current)===6?'Weigh-in tomorrow':'Weekly weigh-in') : 'Weekly weigh-in';
  const caption=last? t('Last entry')+' · '+shortDate(last.date):t('Weight is optional.');
  return `<section class="reminder card"><span class="flag">${icon('clock')}${label('Weight reminder')}</span>
    <h3>${label(title)}</h3><p class="small muted">${h(caption)}</p>
    <p class="small">${label('Weekly measurements help you compare weight over time.')}</p>
    <p class="small">${label('Weigh in the morning, after emptying your bladder and before eating or drinking, without clothes or in light underwear.')}</p>
    ${button('Log weight','weight',{glyph:'plus',attrs:'data-today="true"'})}</section>`;
}


function weightEntries() {
  return account().entries.filter(entry=>entry.type==='weight').sort((a,b)=>a.date.localeCompare(b.date));
}
function renderWeightMonitoring() {
  const measurements=weightEntries();
  const heading=pageHeader('Weight monitoring','',button('Log weight','weight',{glyph:'plus',variant:'primary',attrs:'data-today="true"'}));
  if (measurements.length===0) {
    return heading+`<section class="card panel"><p class="muted">${label('Log a weight to start your chart.')}</p></section>`;
  }
  const first=measurements[0];
  const last=measurements.at(-1);
  const range=shortDate(first.date)+' – '+formatDay(last.date,{year:'numeric',month:'short',day:'numeric'});
  const delta=Math.round((last.amount-first.amount)*100)/100;
  const rows=measurements.slice().reverse().map(entry=>`<tr>
    <td><time datetime="${entry.date}">${h(formatDay(entry.date,{year:'numeric',month:'short',day:'numeric'}))}</time></td>
    <td>${h(amountText(entry))}</td></tr>`).join('');
  return heading+`<section class="card panel weight-panel">
    <h2>${label('Weight over time')}</h2><p class="muted small">${h(range)}</p>
    <div class="stats">
      <div class="stat"><strong>${h(amountText(last))}</strong><span>${label('Latest weight')}</span></div>
      <div class="stat"><strong>${measurements.length>1?h(num(delta,{signDisplay:'exceptZero',maximumFractionDigits:2})+' kg'):'–'}</strong><span>${label('Recorded change')}</span></div>
      <div class="stat"><strong>${measurements.length}</strong><span>${label('Measurements')}</span></div>
    </div>
    ${weightChart(measurements)}
    <details class="weight-table"><summary>${label('Recorded weights')}</summary>
      <table class="catalog"><thead><tr><th scope="col">${label('Date')}</th><th scope="col">${label('Weight')}</th></tr></thead><tbody>${rows}</tbody></table>
    </details>
  </section>`;
}
function bf511Value(amount, metric) {
  return num(amount,{minimumFractionDigits:metric.decimals,maximumFractionDigits:metric.decimals})+metric.unit;
}
function renderAdvancedWeightMonitoring() {
  const measurements=weightEntries();
  const heading=pageHeader('Advanced Weight Monitoring','OMRON BF511',button('Log BF511 readings','log-bf511',{glyph:'plus',variant:'primary'}));
  if (!measurements.length) {
    return heading+`<section class="card panel"><p class="muted">${label('Log a weight to start your chart.')}</p></section>`;
  }
  const metrics=Object.entries(bf511Metrics);
  const metric=bf511Metrics[state.weightMetric];
  const points=metric?measurements.filter(entry=>entry.bf511?.[state.weightMetric]!=null)
    .map(entry=>({date:entry.date,amount:entry.bf511[state.weightMetric]})):measurements;
  const rows=measurements.slice().reverse().map(entry=>`<tr>
    <th scope="row"><time datetime="${h(entry.date)}">${h(formatDay(entry.date,{year:'numeric',month:'short',day:'numeric'}))}</time></th>
    <td>${h(amountText(entry))}</td>${metrics.map(([key,details])=>
      `<td>${entry.bf511?.[key]==null?'–':h(bf511Value(entry.bf511[key],details))}</td>`).join('')}
    <td>${iconButton('Edit entry','edit-bf511','edit',`data-value="${h(entry.id)}"`)}</td>
  </tr>`).join('');
  return heading+`<section class="card panel weight-panel">
    ${tabs([['weight','Weight'],...metrics.map(([name,details])=>[name,details.label])],state.weightMetric,'weight-metric')}
    ${points.length?weightChart(points,metric):`<p class="muted">${label('No BF511 readings for this metric yet.')}</p>`}
    <h2 id="composition-history-title">${label('Weigh-in history')}</h2>
    <div class="composition-table" role="region" aria-labelledby="composition-history-title" tabindex="0">
      <table class="catalog"><thead><tr><th scope="col">${label('Date')}</th><th scope="col">${label('Weight')}</th>
        ${metrics.map(([,details])=>`<th scope="col">${label(details.label)}</th>`).join('')}
        <th scope="col"><span class="sr-only">${label('Edit entry')}</span></th>
      </tr></thead><tbody>${rows}</tbody></table>
    </div>
  </section>`;
}
function weightChart(entries, metric=null) {
  const first=entries[0].date;
  const last=entries.at(-1).date;
  const span=ageInDays(first,last);
  const amounts=entries.map(entry=>entry.amount);
  const ymin=Math.min(...amounts);
  const ymax=Math.max(...amounts);
  const padding=Math.max(.5,(ymax-ymin)*.16);
  const integerTicks=metric?.decimals===0;
  const low=integerTicks?Math.max(metric.min,Math.floor(ymin-padding)):Math.max(0,ymin-padding);
  const high=integerTicks?Math.min(metric.max,Math.ceil(ymax+padding)):ymax+padding;
  const x=day=>67+(span?ageInDays(first,day)/span*650:325);
  const y=amount=>18+201*(high-amount)/(high-low);
  const levels=Array.from({length:5},(_,i)=>low+(high-low)*i/4);
  const ticks=integerTicks?[...new Set(levels.map(Math.round))]:levels;
  const grid=ticks.map(level=>`<line x1="67" x2="717" y1="${y(level)}" y2="${y(level)}"></line>
    <text x="57" y="${y(level)+4}" text-anchor="end">${h(num(level,{maximumFractionDigits:2}))}</text>`).join('');
  const path=entries.map(entry=>`${x(entry.date)},${y(entry.amount)}`).join(' ');
  const dots=entries.map(entry=>`<circle cx="${x(entry.date)}" cy="${y(entry.amount)}" r="4">
    <title>${h(shortDate(entry.date)+' · '+(metric?bf511Value(entry.amount,metric):amountText(entry)))}</title></circle>`).join('');
  const dates=span?[first,last]:[first];
  return `<svg class="weight-chart" role="img" aria-label="${label(metric?.label??'Weight over time')}" viewBox="0 0 745 250">
    <g class="chart-grid">${grid}</g>
    <polyline points="${path}" class="chart-line"></polyline>
    <g class="chart-dots">${dots}</g>
    <g class="chart-axis">${dates.map((date,i)=>`<text x="${x(date)}" y="242" text-anchor="${span?(i?'end':'start'):'middle'}">${h(shortDate(date))}</text>`).join('')}</g>
  </svg>`;
}

function reportRange(kind, offset, clock=localClock()) {
  if (kind==='weekly') {
    const sunday=shiftDate(clock.date,(7-weekdayNumber(clock.date))%7);
    const reachedCutoff=clock.date===sunday&&clock.time>=REPORT_CUTOFF;
    const to=shiftDate(sunday,7*(offset+(reachedCutoff?0:-1)));
    return {from:shiftDate(to,-6),to};
  }
  const currentMonth=clock.date.slice(0,7);
  const last=shiftDate(changeMonth(currentMonth,1)+'-01',-1);
  const reachedCutoff=clock.date===last&&clock.time>=REPORT_CUTOFF;
  const month=changeMonth(currentMonth,offset+(reachedCutoff?0:-1));
  return {from:month+'-01',to:shiftDate(changeMonth(month,1)+'-01',-1)};
}
function reportCaption(range) {
  const spansYears=range.from.slice(0,4)!==range.to.slice(0,4);
  return formatDay(range.from,{month:'short',day:'numeric',year:spansYears?'numeric':undefined})
    +' – '+formatDay(range.to,{month:'short',day:'numeric',year:'numeric'});
}
function reportData(kind) {
  const range=reportRange(kind,state.reportOffsets[kind]);
  const stored=reportCache.get(kind+':'+range.to)?.data;
  if (stored) return {range,days:stored.days_logged,totalDays:stored.days_total,
    notes:stored.notes,weights:stored.weights.map(row=>({...row,type:'weight',amount:row.kg})),
    applications:stored.applications.map(row=>({...row,snapshot:{name:row.product}}))};
  const entries=account().entries.filter(entry=>entry.date>=range.from&&entry.date<=range.to)
    .sort((a,b)=>a.date.localeCompare(b.date)||(a.time??'').localeCompare(b.time??''));
  return {
    range, days:new Set(entries.map(entry=>entry.date)).size, totalDays:ageInDays(range.from,range.to)+1,
    applications:entries.filter(entry=>entry.type==='application'),
    weights:entries.filter(entry=>entry.type==='weight'),
    notes:entries.filter(entry=>entry.note?.trim())
  };
}
function reportAnalysis(data) {
  if (!data.days) return [t('No entries were logged in this period.')];
  const result=[message('{days} of {total} days had entries. Applications: {applications}. Observations: {notes}.',{
    days:data.days,total:data.totalDays,applications:data.applications.length,notes:data.notes.length
  })];
  const names=[...new Set(data.applications.map(entry=>calendarName(entry.snapshot)))];
  const list=new Intl.ListFormat(state.lang);
  if (names.length) {
    result.push(message('Recorded products: {products}.',{products:list.format(names)}));
  }
  const topics={
    sleep:/\b(slept|sleep|rested)\b|spanj|spal|spoč/i,
    energy:/\b(energy|fatigue|tired|exhausted)\b|utruj|energij/i,
    activity:/\b(walk|exercise|workout|training)\b|sprehod|vadb/i,
    appetite:/\b(appetite|hunger|hungry)\b|apetit|lač/i
  };
  const observed=Object.entries(topics).filter(([,pattern])=>data.notes.some(entry=>pattern.test(entry.note))).map(([topic])=>t(topic));
  if (observed.length) {
    result.push(message('Notes mention {topics}.',{topics:list.format(observed)}));
  }
  const first=data.weights[0];
  const last=data.weights.at(-1);
  if (data.weights.length>1) {
    const difference=Math.round((last.amount-first.amount)*100)/100;
    result.push(message('The first weight was {first} and the latest was {last} (change {change}).',{
      first:amountText(first),last:amountText(last),
      change:num(difference,{signDisplay:'exceptZero',maximumFractionDigits:2})+' kg'
    }));
  } else {
    result.push(first?message('One weight measurement was recorded ({weight}).',{weight:amountText(first)})
      :t('No weight measurements were recorded.'));
  }
  return result;
}
function reportNotes(data) {
  if (!data.notes.length) return `<p class="muted small">${label('No observations were logged in this period.')}</p>`;
  return `<ul class="list-clean">${data.notes.map(note=>`<li class="week-note">
    <time datetime="${note.date}">${h(shortDate(note.date))}</time><p>${h(note.note)}</p></li>`).join('')}</ul>`;
}
function reportBf511(composition) {
  const metrics=Object.entries(bf511Metrics).filter(([name])=>composition?.[name]?.readings?.length);
  if (!metrics.length) return '';
  return `<section class="report-composition"><h3>${label('BF511 readings')}</h3>
    ${metrics.map(([name,metric])=>{
      const {readings,change}=composition[name];
      const dates=readings.map(row=>shortDate(row.date)+' · '+bf511Value(row.value,metric));
      const delta=change==null?'':num(change,{signDisplay:'exceptZero',maximumFractionDigits:metric.decimals})
        +(metric.unit==='%'?' '+t('percentage points'):'');
      return `<div><strong>${label(metric.label)}</strong><p>${h(dates.join(' | '))}</p>
        ${delta?`<p class="muted small">${label('Recorded change')} · ${h(delta)}</p>`:''}</div>`;
    }).join('')}
  </section>`;
}
function renderReport(kind) {
  const data=reportData(kind);
  const stored=reportCache.get(kind+':'+data.range.to);
  const schedule=kind==='weekly'?'Every Sunday at 23:59':'Last day of each month at 23:59';
  return pageHeader(pageInfo[kind][0],reportCaption(data.range),button('Email preview','email',{glyph:'mail'}))+
    `<div class="report-layout"><section class="card panel"><div class="report-head">
      <h2>${label('Period overview')}</h2>
      <div class="cal-nav">${iconButton('Previous report','older-report','prev')}
        ${iconButton('Next report','newer-report','next',state.reportOffsets[kind]===0?'disabled':'')}</div></div>
      <div class="stats">
        <div class="stat"><strong>${data.days}/${data.totalDays}</strong><span>${label('Days logged')}</span></div>
        <div class="stat"><strong>${data.applications.length}</strong><span>${label('Applications')}</span></div>
        <div class="stat"><strong>${data.weights.length}</strong><span>${label('Weight entries')}</span></div>
      </div>
      <h3>${label('Recorded observations')}</h3>${reportNotes(data)}
      ${reportBf511(stored?.data?.bf511)}
    </section><section class="card panel"><h2>${label('Delivery')}</h2>
      <dl class="delivery-list"><dt>${label('Recipient')}</dt><dd>${h(reportRecipient)}</dd>
        <dt>${label('Schedule')}</dt><dd>${label(schedule)}</dd>
        <dt>${label('Scheduled cutoff')}</dt><dd>${h(shortDate(data.range.to))} · ${REPORT_CUTOFF}</dd>
        <dt>${label('Your time zone')}</dt><dd>${h(account().prefs.timeZone)}</dd></dl>
      <p class="muted small">${label(stored?.mailState==='sent'?'Email sent':stored?.mailState==='uncertain'?'Email delivery could not be confirmed.':'Scheduled for delivery')}</p>
    </section></div>
    <section class="card panel analysis-panel"><h2>${label('AI analysis')}</h2>
      <div class="analysis-copy">${stored?.analysis?`<p class="analysis-text">${h(stored.analysis)}</p>`:
        `<p class="muted">${label('The scheduled analysis will appear here.')}</p>`}</div>
    </section>`;
}


function checkbox(name, text, checked) {
  return `<label class="checkbox-row"><input type="checkbox" name="${name}" ${checked?'checked':''}><span>${label(text)}</span></label>`;
}
function timezoneOptions(current) {
  return ['Europe/Ljubljana','Europe/Rome','Europe/Berlin','Europe/Paris','Europe/Madrid','Europe/Belgrade','Europe/Zagreb','Europe/Kyiv','Europe/Moscow','Europe/London','UTC']
    .map(zone=>option(zone,zone,current===zone)).join('');
}
function renderPreferences() {
  const prefs=account().prefs;
  return `<form class="stack" id="preferences-form">
    <section class="card panel form-section"><h2>${label('Preferences')}</h2>
      <div class="form-grid">
        ${field('Language',`<select name="lang">${languageOptions(prefs.lang)}</select>`)}
        ${field('Time zone',`<select name="zone">${timezoneOptions(prefs.timeZone)}</select>`)}
      </div>
      ${checkbox('weigh','Show the weight reminder on day six',prefs.weigh)}
    </section>
    <div class="row-actions">${submit('Save preferences')}${button('Privacy notice','privacy',{glyph:'lock'})}</div>
  </form>`;
}
function tabs(items, active, action) {
  return `<div class="tabs">${items.map(([key,text])=>`<button class="tab" type="button" aria-pressed="${active===key}" data-action="${action}" data-value="${key}">${label(text)}</button>`).join('')}</div>`;
}
function productTable(user) {
  const matching=products.filter(product=>product.route===state.catalogRoute);
  const rows=matching.map(product=>{
    const toggle=user?`<td class="product-access"><label class="switch"><input type="checkbox" role="switch"
      data-product="${product.id}" aria-label="${label('Visible')} · ${h(productCaption(product))} · ${h(user.display)}"
      ${user.visible.has(product.id)?'checked':''}></label></td>`:'';
    return `<tr><td><strong>${h(productName(product))}</strong></td><td>${h(product.label||'—')}</td>${toggle}</tr>`;
  }).join('');
  return rows?`<table class="catalog"><thead><tr>
    <th scope="col">${label('Product')}</th><th scope="col">${label('Package label')}</th>
    ${user?`<th scope="col" class="product-access">${label('Visible')}</th>`:''}
  </tr></thead><tbody>${rows}</tbody></table>`:`<p class="empty">${label('No products for this method.')}</p>`;
}
function renderAdminUsers(methodTabs) {
  const selected=accounts[state.catalogUser];
  const users=Object.values(accounts).map(user=>`<button type="button" class="user-choice" data-action="admin-user"
    data-value="${h(user.username)}" aria-pressed="${selected===user}"><span class="avatar" aria-hidden="true">${h(user.display.charAt(0).toUpperCase())}</span>
    <span class="user-title"><strong>${h(user.display)}</strong><small>@${h(user.username)}</small></span></button>`).join('');
  return `<div class="admin-layout">
    <section class="card panel admin-users" aria-labelledby="admin-users-title">
      <h2 id="admin-users-title">${label('Users')}</h2><div class="user-list">${users}</div>
    </section>
    <section class="card panel">
      <div class="admin-panel-head"><div><h2>${h(selected.display)}</h2><p class="muted small">${label(selected.admin?'Administrator':'User')}</p></div>
        ${button('Set PIN','set-pin',{glyph:'lock'})}</div>
      <div class="weight-access">
        <label class="checkbox-row"><input type="checkbox" data-weight-monitor="${selected.id}" ${selected.weightMonitor?'checked':''}>
          <span>${label('Enable weight monitoring')}</span></label>
        <label class="checkbox-row"><input type="checkbox" data-advanced-weight-monitor="${selected.id}" ${selected.advancedWeightMonitor?'checked':''}>
          <span>${label('Enable advanced weight monitoring')}</span></label>
      </div>
      <div class="user-products"><h3>${label('Available products')}</h3>
        <p class="muted small">${label('Select the products this user can log.')}</p>
        ${methodTabs}${productTable(selected)}
      </div>
    </section>
  </div>`;
}
function renderAdmin() {
  if (!account().admin) return '';
  const onCatalog=state.adminSection==='products';
  const methodTabs=tabs(methodsFor(products),state.catalogRoute,'catalog-route');
  const controls=onCatalog?button('Add product','product',{glyph:'plus',variant:'primary'})
    :button('Add user','add-user',{glyph:'plus',variant:'primary'});
  return pageHeader('Admin','',controls)+tabs([['users','Users'],['products','Product catalog']],state.adminSection,'admin-section')+
    (onCatalog?`<section class="card panel admin-catalog"><h2>${label('Product catalog')}</h2>
      ${methodTabs}${productTable()}</section>`:renderAdminUsers(methodTabs));
}
function showDialog(title, description, contents) {
  dialog.innerHTML=`<header class="dialog-head"><div><h2 id="dialog-title">${label(title)}</h2>
      ${description?`<p>${h(description)}</p>`:''}</div>${iconButton('Close','close','close')}</header>
    <div class="dialog-body">${contents}</div>`;
  if (!dialog.open) dialog.showModal();
  else dialog.querySelector('input,textarea,select,button')?.focus();
}
function closeDialog() { if (dialog.open) dialog.close(); }
function formFooter(text, canRemove=false) {
  return `<div class="dialog-foot">
    ${canRemove?button('Remove','remove',{variant:'danger'}):''}
    ${button('Cancel','close')}${submit(text)}</div>`;
}
function openEntry(type='application', existing=null, note='') {
  const enabledMethods=methodsFor(availableProducts(),existing?.route);
  const mode=type==='application'&&enabledMethods.length===0?'note':type;
  const current=localClock();
  const date=existing?.date??(mode==='application'?current.date:selectDateForEntry());
  const time=existing?.time??current.time;
  state.entry={ type:mode, route:existing?.route??enabledMethods[0]?.[0], productId:existing?.productId??'', existing };
  const textarea=`<textarea name="note" rows="3" maxlength="2000" placeholder="${label('Add an observation in your own words')}">${h(existing?.note??note)}</textarea>`;
  showDialog(existing?'Edit entry':'New entry','',`<form id="entry-form" class="form-stack">
    <div class="form-grid">
      ${field('Date',`<input type="date" name="date" required value="${date}" max="${current.date}">`)}
      <div id="entry-time">${field('Time',`<input type="time" name="time" value="${time}" required>`)}</div>
    </div>
    <div id="entry-detail"></div>
    ${field('What did you notice?',textarea)}
    <p class="error" role="alert" id="entry-error" hidden></p>
    ${formFooter('Save entry',!!existing)}</form>`);
  renderEntryDetail();
}
function renderEntryDetail() {
  const entry=state.entry;
  const enabledProducts=availableProducts();
  const productList=enabledProducts.filter(product=>product.route===entry.route);
  const historical=entry.existing?.snapshot;
  if (historical&&historical.route===entry.route&&!productList.some(product=>product.id===historical.id)) {
    productList.push({...historical,historical:true});
  }
  const methods=methodsFor(enabledProducts,historical?.route);
  const typeTabs=methods.length?tabs([['application','Application'],['note','Observation']],entry.type,'entry-type'):'';
  const routeOptions=methods.map(([value,text])=>
    `<button type="button" class="route-button" data-action="entry-route" data-value="${value}" aria-pressed="${entry.route===value}">${label(text)}</button>`
  ).join('');
  q('#entry-detail').className='form-section';
  q('#entry-detail').innerHTML=typeTabs+(entry.type==='application'?`
    <div class="field"><span id="route-label">${label('Application method')}</span><div class="route-buttons" role="group" aria-labelledby="route-label">${routeOptions}</div></div>
    ${field('Product',`<select id="entry-product" name="product" required>
      ${option('',t(productList.length?'Select a product':'No products are enabled for this account and method.'),!entry.productId)}
      ${productList.map(product=>option(product.id,productCaption(product)+(product.historical?' · '+t('Historical product'):''),product.id===entry.productId)).join('')}
    </select>`)}
    <div class="product-fields" id="product-fields"></div>`:'');
  q('#entry-form [name="note"]').required=entry.type==='note';
  const isApplication=entry.type==='application';
  q('#entry-time').hidden=!isApplication;
  q('#entry-time input').disabled=!isApplication;
  if (isApplication) renderProductFields();
}
function amountSelect(title, values, display, previous, allowUnknown) {
  const custom=previous!=null&&!values.includes(previous);
  const selected=custom?'other':previous==null?(allowUnknown&&state.entry.existing?'unknown':''):String(previous);
  return field(title,`<select id="entry-amount" name="amount" required>${option('',t('Choose a value'),!selected)}
    ${values.map(value=>option(value,display(value),selected===String(value))).join('')}
    ${option('other',t('Other value'),custom)}
    ${allowUnknown?option('unknown',t('Not recorded'),selected==='unknown'):''}</select>`)+
    `<div id="custom-amount" ${custom?'':'hidden'}>${field('Other recorded value',`<input name="custom" type="text" inputmode="decimal"
      value="${custom?h(num(previous,{maximumFractionDigits:6,useGrouping:false})):''}" ${custom?'required':'disabled'}>`)}</div>`;
}
function decimalInput(name, value=null, required=true) {
  const display=value==null?'':num(value,{maximumFractionDigits:6,useGrouping:false});
  return `<input type="text" name="${name}" inputmode="decimal" value="${h(display)}" ${required?'required':''}>`;
}
function renderProductFields() {
  const container=q('#product-fields');
  const entry=state.entry;
  const prev=entry.existing?.productId===entry.productId?entry.existing:null;
  const product=findProduct(entry.productId)??prev?.snapshot;
  container.innerHTML='';
  if (!product||product.route!==entry.route) return;
  const ints=Array.from({length:100},(_,i)=>i+1);
  const tenths=Array.from({length:50},(_,i)=>(i+1)/10);
  const units=['mg','µg','mL','units','capsules'];
  const displayCount=value=>num(value);
  const mg=value=>num(value,{minimumFractionDigits:1,maximumFractionDigits:1})+' mg';
  if (entry.route==='pen') {
    container.innerHTML=amountSelect('Recorded clicks',ints,displayCount,prev?.amount,true)
      +info(t('Clicks are saved as a count. A conversion has to be verified for the exact pen.'));
    return;
  }
  if (entry.route==='syringe') {
    container.innerHTML=amountSelect('Recorded amount (mg)',tenths,mg,prev?.amount,true);
    return;
  }
  if (entry.route==='nasal') {
    container.innerHTML=amountSelect('Recorded sprays',ints,displayCount,prev?.amount,false)+
      `<div class="form-grid">${field('Total on label (mg)',decimalInput('mass',prev?.mass))}
        ${field('Bottle volume (mL)',decimalInput('volume',prev?.volume))}</div>
        <p class="help" id="concentration" aria-live="polite"></p>`+
      info(t('An amount per spray requires a verified volume per spray for this pump.'));
    showConcentration();
    return;
  }
  container.innerHTML=`<div class="form-grid">
    ${field('Amount',decimalInput('amount',prev?.amount),t('Enter an amount already recorded.'))}
    ${field('Unit',`<select name="unit" required>${option('',t('Choose a value'),!prev?.unit)}${units.map(unit=>option(unit,unit,unit===prev?.unit)).join('')}</select>`)}
  </div>`;
}
function positiveDecimal(raw) {
  const text=String(raw??'').trim().replace(',','.');
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return null;
  const number=Number(text);
  return Number.isFinite(number)&&number>0?number:null;
}
function showConcentration() {
  const output=q('#concentration');
  if (!output) return;
  const form=q('#entry-form');
  const mass=positiveDecimal(form.elements.mass.value);
  const volume=positiveDecimal(form.elements.volume.value);
  const ratio=mass/volume;
  output.textContent=mass&&volume&&Number.isFinite(ratio)?
    t('Label concentration')+' · '+num(ratio,{maximumSignificantDigits:5})+' mg/mL':'';
}
async function saveEntry(form) {
  const entry=state.entry;
  const formData=new FormData(form);
  const date=String(formData.get('date'));
  const note=String(formData.get('note')??'').trim();
  const record={ id:entry.existing?.id??'', type:entry.type, date, note };
  if (entry.type==='note'&&!note) throw new Error('Enter your observation.');
  if (entry.type==='application') {
    const raw=formData.get('amount');
    const amount=raw==='unknown'?null:positiveDecimal(raw==='other'?formData.get('custom'):raw);
    if (raw!=='unknown'&&amount==null) throw new Error('Enter a positive number.');
    if (['pen','nasal'].includes(entry.route)&&amount!=null&&!Number.isSafeInteger(amount)) throw new Error('Enter a whole number.');
    Object.assign(record,{time:String(formData.get('time')),productId:entry.productId,amount,unit:formData.get('unit')});
    if (entry.route==='nasal') {
      const mass=positiveDecimal(formData.get('mass'));
      const volume=positiveDecimal(formData.get('volume'));
      if (!mass||!volume||!Number.isFinite(mass/volume)) throw new Error('Enter a positive number.');
      Object.assign(record,{mass,volume});
    }
  }
  await write('saveEntry',record);
  closeDialog();
  setDate(date);
  notify('Entry saved');
}
function openWeight(existing=null, today=false, advanced=false) {
  if (advanced&&!account().advancedWeightMonitor) return;
  const current=localClock().date;
  const date=existing?.date??(today?current:selectDateForEntry());
  const saved=existing??(advanced?weightEntries().find(entry=>entry.date===date):undefined);
  state.entry={type:'weight',existing,advanced,originalReadings:saved?.bf511??{}};
  const previous=latestWeight();
  const amount=Math.round((saved?.amount??previous?.amount??0)*100);
  const whole=Math.floor(amount/100);
  const decimal=amount%100;
  const separator=new Intl.NumberFormat(state.lang).formatToParts(0.1).find(part=>part.type==='decimal').value;
  showDialog(existing?'Edit entry':advanced?'Log BF511 readings':'Log weight',longDate(date),`<form id="weight-form" class="form-stack">
    ${field('Date',`<input type="date" name="date" value="${date}" required max="${current}">`)}
    <fieldset class="weight-picker">
      <legend>${label('Weight (kg)')}</legend>
      <div class="weight-wheels">${weightWheel('Whole kilograms','whole',Math.max(500,whole),whole)}
        <span class="wheel-separator" aria-hidden="true">${h(separator)}</span>
        ${weightWheel('Decimals','decimal',99,decimal)}</div>
      <p class="help">${label('Scroll or use the arrow keys to change each value.')}</p>
    </fieldset>
    ${advanced?`<fieldset class="bf511-fields">
      <legend>${label('BF511 readings')}</legend>
      <p class="help">${label('Copy the readings shown on the scale. Leave unavailable readings blank.')}</p>
      <div class="form-grid">${Object.entries(bf511Metrics).map(([name,metric])=>
        field(metric.label,decimalInput(name,saved?.bf511?.[name],false),num(metric.min)+'–'+num(metric.max))
      ).join('')}</div>
    </fieldset>`:''}
    ${info(t('Weigh in the morning, after emptying your bladder and before eating or drinking, without clothes or in light underwear.'))}
    <p class="error" role="alert" id="weight-error" hidden></p>
    ${formFooter('Save entry',!!existing)}
  </form>`);
  for (const wheel of dialog.querySelectorAll('[data-wheel]')) {
    setWheel(wheel,Number(wheel.getAttribute('aria-valuenow')));
    wheel.addEventListener('scroll',()=>updateWheel(wheel),{passive:true});
  }
}
function loadBf511Date(form) {
  const saved=weightEntries().find(entry=>entry.date===form.elements.date.value);
  state.entry.originalReadings=saved?.bf511??{};
  const weight=Math.round((saved?.amount??latestWeight()?.amount??0)*100);
  setWheel(q('[data-wheel="whole"]',form),Math.floor(weight/100));
  setWheel(q('[data-wheel="decimal"]',form),weight%100);
  for (const [name,metric] of Object.entries(bf511Metrics)) {
    const value=saved?.bf511?.[name];
    form.elements[name].value=value==null?'':num(value,{maximumFractionDigits:metric.decimals,useGrouping:false});
  }
}
function latestWeight() {
  return account().entries.filter(entry=>entry.type==='weight')
    .sort((a,b)=>(b.savedAt??0)-(a.savedAt??0)||b.date.localeCompare(a.date))[0];
}
function wheelDisplay(kind, index) {
  return num(index,{minimumIntegerDigits:kind==='decimal'?2:1,useGrouping:false});
}
function weightWheel(title, kind, max, value) {
  const rows=Array.from({length:max+1},(_,i)=>`<span class="wheel-value" data-index="${i}">${wheelDisplay(kind,i)}</span>`).join('');
  return `<div class="wheel-group"><span id="wheel-${kind}-label">${label(title)}</span>
    <div class="wheel-window">
      <div class="wheel-track" tabindex="0" role="spinbutton" aria-labelledby="wheel-${kind}-label"
        aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}" data-wheel="${kind}">
        <div class="wheel-rows" aria-hidden="true">${rows}</div>
      </div>
    </div>
  </div>`;
}
function wheelStep(wheel) {
  return wheel.querySelector('.wheel-value').getBoundingClientRect().height;
}
function updateWheel(wheel) {
  const value=Math.round(wheel.scrollTop/wheelStep(wheel));
  const selected=wheel.querySelector(`[data-index="${value}"]`);
  if (!selected) return;
  const previous=wheel.querySelector('.wheel-selected');
  previous?.classList.remove('wheel-selected');
  selected.classList.add('wheel-selected');
  wheel.setAttribute('aria-valuenow',String(value));
  wheel.setAttribute('aria-valuetext',wheelDisplay(wheel.dataset.wheel,value));
}
function setWheel(wheel, value) {
  const max=Number(wheel.getAttribute('aria-valuemax'));
  wheel.scrollTop=Math.max(0,Math.min(max,value))*wheelStep(wheel);
  updateWheel(wheel);
}
async function saveWeight(form) {
  const selected=kind=>Number(q(`[data-wheel="${kind}"]`,form).getAttribute('aria-valuenow'));
  const amount=(100*selected('whole')+selected('decimal'))/100;
  if (!amount) throw new Error('Choose a weight greater than zero.');
  const date=form.elements.date.value;
  const data={id:state.entry.existing?.id??'',type:'weight',date,amount};
  if (state.entry.advanced) {
    const edits={};
    for (const [name,metric] of Object.entries(bf511Metrics)) {
      const raw=form.elements[name].value.trim();
      const value=raw===''?null:positiveDecimal(raw);
      if (raw!==''&&(value==null||value<metric.min||value>metric.max||Number(value.toFixed(metric.decimals))!==value)) {
        throw new Error('Check the BF511 reading ranges and decimal places.');
      }
      if (value!==(state.entry.originalReadings[name]??null)) edits[name]=value;
    }
    if (Object.keys(edits).length) data.bf511=edits;
  }
  await write('saveEntry',data);
  closeDialog();
  setDate(date);
  notify('Weigh-in saved');
}
function openVoice() {
  showDialog('Voice note',t('Record, upload audio, or paste dictated text. Review the transcript before saving.'),`<form id="voice-form" class="form-stack">
    <div class="row-actions">
      ${button('Start recording','record-voice',{glyph:'microphone'})}
      ${button('Stop recording','stop-voice',{attrs:'hidden'})}
    </div>
    ${field('Upload audio',`<input type="file" name="audio" accept="audio/*,video/mp4,video/webm">`)}
    <p class="help" id="voice-status" role="status"></p>
    ${field('Review transcript',`<textarea name="transcript" rows="5" required maxlength="2000"></textarea>`)}
    <p class="error" role="alert" hidden></p>
    ${formFooter('Use in entry')}
  </form>`);
}
async function transcribeVoice(form, audio, name) {
  const status=q('#voice-status',form);
  const buttons=[...form.querySelectorAll('button')];
  buttons.forEach(b=>{b.disabled=true;});
  status.textContent=t('Transcribing…');
  const data=new FormData();
  data.append('action','transcribe');
  data.append('audio',audio,name);
  try {
    const result=await request('',data);
    form.elements.transcript.value=result.transcript;
    status.textContent=t('Review transcript');
  } catch (error) {
    status.textContent=t(error.message);
  } finally {
    buttons.forEach(b=>{b.disabled=false;});
  }
}
function stopCapture(discard=false) {
  if (!recording) return;
  const capture=recording;
  recording=null;
  capture.discard=discard;
  clearTimeout(capture.timer);
  if (capture.media.state!=='inactive') capture.media.stop();
  capture.stream.getTracks().forEach(track=>track.stop());
}
async function startCapture() {
  const form=q('#voice-form');
  const button=q('[data-action="record-voice"]',form);
  if (!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder) {
    q('#voice-status',form).textContent=t('Microphone unavailable. Upload a recording or paste text.');
    return;
  }
  button.disabled=true;
  let stream;
  try {
    stream=await navigator.mediaDevices.getUserMedia({audio:true});
    if (!form.isConnected||!dialog.open) {
      stream.getTracks().forEach(track=>track.stop());
      return;
    }
    const format=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type));
    const media=new MediaRecorder(stream,format?{mimeType:format}:undefined);
    const chunks=[];
    const capture={media,stream,discard:false,timer:setTimeout(()=>stopCapture(),120000)};
    recording=capture;
    media.addEventListener('dataavailable',event=>{if(event.data.size) chunks.push(event.data);});
    media.addEventListener('stop',()=>{
      if (capture.discard||!form.isConnected) return;
      const data=new Blob(chunks,{type:media.mimeType});
      q('[data-action="record-voice"]',form).hidden=false;
      q('[data-action="stop-voice"]',form).hidden=true;
      transcribeVoice(form,data,media.mimeType.includes('mp4')?'voice.mp4':'voice.webm');
    });
    media.start();
    q('[data-action="record-voice"]',form).hidden=true;
    q('[data-action="stop-voice"]',form).hidden=false;
    q('#voice-status',form).textContent=t('Recording…');
  } catch {
    if (stream) stream.getTracks().forEach(track=>track.stop());
    q('#voice-status',form).textContent=t('Microphone unavailable. Upload a recording or paste text.');
  } finally {
    button.disabled=false;
  }
}
function showEmail() {
  const kind=state.page;
  const data=reportData(kind);
  const stored=reportCache.get(kind+':'+data.range.to);
  const subject=kind==='weekly'?'Weekly journal summary':'Monthly journal summary';
  showDialog('Email preview',t('Preview of the message for this account.'),`<div class="form-stack">
    <dl class="delivery-list">
      <dt>${label('Recipient')}</dt><dd>${h(reportRecipient)}</dd>
      <dt>${label('Subject')}</dt><dd>${label(subject)} · ${h(reportCaption(data.range))}</dd>
      <dt>${label('Account holder')}</dt><dd>${h(account().display)}</dd>
    </dl>
    ${reportAnalysis(data).map(line=>`<p>${h(line)}</p>`).join('')}
    ${reportBf511(stored?.data?.bf511)}
    ${stored?.analysis?`<p class="analysis-text">${h(stored.analysis)}</p>`:''}
    <div>${button('Back to summary','close',{variant:'primary'})}</div>
  </div>`);
}
function openPrivacy() {
  showDialog('Privacy notice','',`<div class="form-stack privacy-copy">
    <p>${label('The journal stores your entries for logging observations and monitoring health and progress.')}</p>
    <p>${h(message('OpenAI can process voice recordings and entries for transcription and analysis. Weekly and monthly summaries for each account are emailed to {recipient} for progress review.',{recipient:reportRecipient}))}</p>
    <div class="dialog-foot">${button('Continue to journal','close',{variant:'primary'})}</div>
  </div>`);
}
function openSignOut() {
  showDialog('Sign out','',`<form method="post" action="./">
    <input type="hidden" name="csrf" value="${h(token)}"><input type="hidden" name="action" value="signout">
    ${formFooter('Sign out')}
  </form>`);
}
function pinField(title='PIN', autocomplete='new-password') {
  return field(title,
    `<input type="password" name="pin" inputmode="numeric" autocomplete="${autocomplete}" pattern="[0-9]{6,12}" required maxlength="12">`,
    t('6–12 digits'));
}
function showAccountError(form, text) {
  const error=form.querySelector('[role="alert"]');
  error.textContent=t(text);
  error.hidden=false;
}
function openAddUser() {
  if (!account().admin) return;
  const choices=methodsFor(products).map(([route,title])=>`<fieldset class="product-choices">
    <legend>${label(title)}</legend>
    <div class="choice-grid">${products.filter(product=>product.route===route).map(product=>`<label class="checkbox-row">
      <input type="checkbox" name="products" value="${product.id}"><span>${h(productCaption(product))}</span>
    </label>`).join('')}</div></fieldset>`).join('');
  showDialog('Add user','',`<form id="add-user-form" class="form-stack">
    <div class="form-grid">
      ${field('Username',`<input name="username" autocomplete="off" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}">`)}
      ${pinField()}
    </div>
    <div class="form-section">
      <div><h3>${label('Available products')}</h3><p class="muted small">${label('Select the products this user can log.')}</p></div>
      <div class="choice-list">${choices}</div>
    </div>
    <p class="error" role="alert" hidden></p>
    ${formFooter('Create account')}
  </form>`);
}
function openSetPin() {
  if (!account().admin) return;
  showDialog('Set PIN',accounts[state.catalogUser].display,`<form id="set-pin-form" class="form-stack">
    ${pinField('New PIN')}
    <p class="error" role="alert" hidden></p>
    ${formFooter('Save PIN')}
  </form>`);
}
async function saveUser(form) {
  const data=new FormData(form);
  const username=String(data.get('username')).trim().toLowerCase();
  await write('addUser',{username,pin:String(data.get('pin')),products:data.getAll('products')});
  state.catalogUser=username;
  state.adminSection='users';
  closeDialog();
  renderMain();
  q('.user-choice[aria-pressed="true"]').focus({preventScroll:true});
  notify('User added');
}
async function savePin(form) {
  await write('setPin',{target:accounts[state.catalogUser].id,pin:form.elements.pin.value});
  closeDialog();
  notify('PIN updated');
}
function openProduct() {
  if (!account().admin) return;
  showDialog('Add product',accounts[state.catalogUser].display,`<form id="product-form" class="form-stack">
    ${field('Product name',`<input name="name" required maxlength="90">`)}
    ${field('Application method',`<select name="route">${Object.entries(routes).map(([route,name])=>option(route,t(name),route===state.catalogRoute)).join('')}</select>`)}
    ${field('Package label',`<input name="package" maxlength="50">`,t('Optional'))}
    ${checkbox('visible','Show for selected account',true)}
    ${formFooter('Save product')}
  </form>`);
}
async function saveProduct(form) {
  const route=form.elements.route.value;
  await write('addProduct',{
    target:accounts[state.catalogUser].id, name:form.elements.name.value,
    route, label:form.elements.package.value, on:form.elements.visible.checked
  });
  state.catalogRoute=route;
  closeDialog();
  renderMain();
  notify('Product added');
}
async function savePreferences(form) {
  const data=new FormData(form);
  await write('preferences',{...account().prefs,lang:data.get('lang'),timeZone:data.get('zone'),weigh:data.has('weigh')});
  render();
  notify('Preferences saved');
}
let toastTimer;
function notify(message) {
  const toast=q('#toast');
  toast.innerHTML=icon('check')+label(message);
  toast.hidden=false;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{ toast.hidden=true; },2800);
}
function moveMonth(delta) {
  const target=changeMonth(state.month,delta);
  const current=today();
  setDate(target===current.slice(0,7)?current:target+'-01');
  q(`[data-action="${delta>0?'next':'prev'}"]`)?.focus();
}
function moveReport(delta) {
  state.reportOffsets[state.page]=Math.min(0,state.reportOffsets[state.page]+delta);
  renderMain();
  const direction=delta<0?'older-report':'newer-report';
  const control=q(`[data-action="${direction}"]`);
  (control.disabled?q('#content'):control).focus({preventScroll:true});
  refreshReport();
}
async function toggleTheme() {
  const prefs=account().prefs;
  await write('preferences',{...prefs,theme:prefs.theme==='light'?'dark':'light'});
  renderShell();
  q('[data-action="theme"]').focus({preventScroll:true});
}
async function removeEntry() {
  await write('removeEntry',{id:state.entry.existing.id});
  closeDialog();
  renderMain();
  notify('Entry removed');
}
function changeAdminSelection(control, key) {
  if (!account().admin||state.page!=='admin') return;
  const { action,value }=control.dataset;
  state[key]=value;
  renderMain();
  q(`[data-action="${action}"][data-value="${CSS.escape(value)}"]`)?.focus({preventScroll:true});
}
const actions={
  page:control=>gotoPage(control.dataset.value),
  date:control=>setDate(control.dataset.value,true),
  today:()=>setDate(today(),true),
  prev:()=>moveMonth(-1),
  next:()=>moveMonth(1),
  new:()=>openEntry(),
  note:()=>openEntry('note'),
  weight:control=>openWeight(null,control.dataset.today==='true'),
  'log-bf511':()=>openWeight(null,true,true),
  'edit-bf511':control=>{
    const entry=account().entries.find(record=>record.id===control.dataset.value&&record.type==='weight');
    if (entry) openWeight(entry,false,true);
  },
  'weight-metric':control=>{
    state.weightMetric=control.dataset.value;
    renderMain();
    q(`[data-action="weight-metric"][data-value="${CSS.escape(state.weightMetric)}"]`)?.focus({preventScroll:true});
  },
  edit:control=>{
    const entry=account().entries.find(record=>record.id===control.dataset.value);
    if (entry?.type==='weight') openWeight(entry);
    else if (entry) openEntry(entry.type,entry);
  },
  voice:openVoice,
  'record-voice':startCapture,
  'stop-voice':()=>stopCapture(),
  email:showEmail,
  'older-report':()=>moveReport(-1),
  'newer-report':()=>moveReport(1),
  theme:toggleTheme,
  privacy:openPrivacy,
  'admin-section':control=>changeAdminSelection(control,'adminSection'),
  'admin-user':control=>changeAdminSelection(control,'catalogUser'),
  'catalog-route':control=>changeAdminSelection(control,'catalogRoute'),
  'entry-type':control=>{state.entry.type=control.dataset.value;renderEntryDetail();q(`[data-action="entry-type"][aria-pressed="true"]`)?.focus();},
  'entry-route':control=>{
    if (state.entry.route===control.dataset.value) return;
    state.entry.route=control.dataset.value;
    state.entry.productId='';
    renderEntryDetail();
    q('[data-action="entry-route"][aria-pressed="true"]')?.focus();
  },
  account:openSignOut,
  'add-user':openAddUser,
  'set-pin':openSetPin,
  product:openProduct,
  remove:removeEntry,
  close:closeDialog
};
document.addEventListener('click',event=>{
  const row=event.target.closest('.wheel-value');
  if (row) {
    const wheel=row.closest('[data-wheel]');
    setWheel(wheel,Number(row.dataset.index));
    wheel.focus({preventScroll:true});
  }
  const control=event.target.closest('[data-action]');
  if (control) Promise.resolve(actions[control.dataset.action]?.(control)).catch(showError);
});
document.addEventListener('keydown',event=>{
  const wheel=event.target.closest('[data-wheel]');
  if (wheel) {
    const value=Number(wheel.getAttribute('aria-valuenow'));
    const keys={ ArrowUp:value+1, ArrowDown:value-1, PageUp:value+10, PageDown:value-10, Home:0, End:Number(wheel.getAttribute('aria-valuemax')) };
    if (Object.hasOwn(keys,event.key)) {
      event.preventDefault();
      setWheel(wheel,keys[event.key]);
    }
    return;
  }
  const button=event.target.closest('[data-action="date"]');
  const shifts={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
  if (!button||!Object.hasOwn(shifts,event.key)) return;
  event.preventDefault();
  setDate(shiftDate(button.dataset.value,shifts[event.key]),true);
});
document.addEventListener('change',async event=>{
  const field=event.target;
  try {
    if (field.id==='locale') {
      await write('preferences',{...account().prefs,lang:field.value});
      render();
      q('#locale').focus();
    }
    if (field.dataset.product&&account().admin&&state.page==='admin') {
      await write('grantProduct',{target:accounts[state.catalogUser].id,product:field.dataset.product,on:field.checked});
    }
    if (field.dataset.weightMonitor&&account().admin&&state.page==='admin') {
      await write('weightMonitor',{target:Number(field.dataset.weightMonitor),on:field.checked});
      renderShell();
    }
    if (field.dataset.advancedWeightMonitor&&account().admin&&state.page==='admin') {
      await write('advancedWeightMonitor',{target:Number(field.dataset.advancedWeightMonitor),on:field.checked});
      renderShell();
    }
    if (field.name==='date'&&field.form?.id==='weight-form'&&state.entry.advanced&&!state.entry.existing&&field.validity.valid) {
      loadBf511Date(field.form);
    }
    if (field.id==='entry-product') {
      state.entry.productId=field.value;
      renderProductFields();
    }
    if (field.id==='entry-amount') {
      const custom=q('#custom-amount');
      const visible=field.value==='other';
      custom.hidden=!visible;
      const input=q('input',custom);
      input.disabled=!visible;
      input.required=visible;
      if (visible) input.focus();
    }
    if (field.name==='audio'&&field.files[0]&&field.form?.id==='voice-form') {
      await transcribeVoice(field.form,field.files[0],field.files[0].name);
      field.value='';
    }
  } catch (error) {
    render();
    showError(error);
  }
});
document.addEventListener('input',event=>{
  if (['mass','volume'].includes(event.target.name)) showConcentration();
});
const forms={
  'entry-form':saveEntry,
  'weight-form':saveWeight,
  'voice-form':form=>{
    stopCapture(true);
    openEntry('note',null,form.elements.transcript.value);
  },
  'add-user-form':saveUser,
  'set-pin-form':savePin,
  'product-form':saveProduct,
  'preferences-form':savePreferences
};
document.addEventListener('submit',async event=>{
  const form=event.target;
  const handler=forms[form.id];
  if (!handler) return;
  event.preventDefault();
  const submitter=event.submitter;
  if (submitter) submitter.disabled=true;
  try {
    await handler(form);
  } catch (error) {
    const alert=form.querySelector('[role="alert"]');
    if (alert) {
      alert.textContent=t(error.message);
      alert.hidden=false;
    } else showError(error);
  } finally {
    if (submitter) submitter.disabled=false;
  }
});
dialog.addEventListener('close',()=>stopCapture(true));

function showError(error) {
  const toast=q('#toast');
  toast.textContent=t(error.message);
  toast.hidden=false;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{toast.hidden=true;},6000);
}
function applyServerState(payload) {
  state.user=payload.user;
  accounts=Object.assign(Object.create(null),Object.fromEntries(payload.accounts.map(user=>[
    user.username,{...user,visible:new Set(user.visible)}
  ])));
  products=payload.products;
  state.lang=account().prefs.lang;
  if (!accounts[state.catalogUser]) state.catalogUser=state.user;
}
async function request(action,fields={}) {
  const upload=fields instanceof FormData;
  const response=await fetch('api.php',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:upload?{'X-CSRF-Token':token}:{'X-CSRF-Token':token,'Content-Type':'application/json'},
    body:upload?fields:JSON.stringify({action,...fields})
  });
  if (response.status===401) {
    window.location.assign('./');
    throw new Error('Sign in to continue.');
  }
  let result;
  try { result=await response.json(); } catch { throw new Error('The request could not be completed. Try again shortly.'); }
  if (!response.ok) throw new Error(result.error??'The request could not be completed. Try again shortly.');
  return result;
}
function write(action,fields) {
  const task=pendingWrite.then(async ()=>{
    const result=await request(action,fields);
    applyServerState(result.state);
    return result;
  });
  pendingWrite=task.catch(()=>{});
  return task;
}
async function refreshReport() {
  const kind=state.page;
  const range=reportRange(kind,state.reportOffsets[kind]);
  try {
    const result=await request('report',{kind,end:range.to});
    reportCache.set(kind+':'+range.to,result.report);
    if (state.page===kind&&reportRange(kind,state.reportOffsets[kind]).to===range.to&&!dialog.open) renderMain();
  } catch (error) { showError(error); }
}
async function start() {
  try {
    const response=await fetch('api.php',{credentials:'same-origin',cache:'no-store'});
    if (response.status===401) {
      window.location.assign('./');
      return;
    }
    if (!response.ok) throw new Error('The journal could not load. Please refresh.');
    const data=await response.json();
    locales=data.locales;
    dictionary=data.messages;
    reportRecipient=data.reportRecipient;
    bf511Metrics=data.bf511Metrics??{};
    applyServerState(data);
    state.selected=today();
    state.month=state.selected.slice(0,7);
    render();
    let shown=false;
    try {
      const key='peplog-privacy-v1:'+account().id;
      shown=sessionStorage.getItem(key)==='shown';
      if (!shown) sessionStorage.setItem(key,'shown');
    } catch {}
    if (!shown) openPrivacy();
    updateClock();
  } catch {
    q('#startup-error').hidden=false;
  }
}
// Refresh a displayed period at its cutoff, including tabs kept open overnight.
function updateClock() {
  let displayedClock=localClock();
  setInterval(()=>{
    const clock=localClock();
    if (dialog.open) return;
    if (state.page==='weekly'||state.page==='monthly') {
      const kind=state.page;
      const cutoff=reportRange(kind,0,clock).to;
      const changed=cutoff!==reportRange(kind,0,displayedClock).to;
      if (changed) renderMain();
      if (changed||!reportCache.get(kind+':'+reportRange(kind,state.reportOffsets[kind],clock).to)?.analysis) refreshReport();
    } else if (state.page==='calendar'&&clock.date!==displayedClock.date) {
      if (state.selected===displayedClock.date) setDate(clock.date);
      else renderMain();
    }
    displayedClock=clock;
  },45000);
}
start();

