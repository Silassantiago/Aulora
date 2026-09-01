(() => {
  'use strict';

  const STORAGE_KEY = 'aulora.materials';
  const PROFILE_KEY = 'aulora.profile';
  const DRAFT_PREFIX = 'aulora.draft.';
  const GUEST_STORAGE_KEY = STORAGE_KEY;
  const DEFAULT_PROFILE = { teacher:'', school:'', city:'', stage:'Anos finais do Ensino Fundamental' };
  const app = {
    materials: loadJson(GUEST_STORAGE_KEY, loadJson('aulora.materials.v1', [])),
    profile: loadJson(PROFILE_KEY, DEFAULT_PROFILE),
    currentMaterial: null,
    deferredInstall: null,
    smartOnline: false,
    user: null,
    usage: null,
    billingEnabled: false,
    cloudSyncing: false
  };

  const titles = {
    dashboard:['Início','Sua central de preparação pedagógica'],
    plan:['Plano de aula','Planejamento pedagógico'],
    activity:['Atividade','Exercícios, práticas e gabaritos'],
    exam:['Avaliação','Provas, pontuação e critérios'],
    abnt:['Acadêmico / ABNT','Estrutura, referências e verificação'],
    materials:['Meus materiais','Sua biblioteca sincronizada'],
    settings:['Perfil e plano','Conta, preferências e armazenamento']
  };

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const esc = (str='') => String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const formData = form => Object.fromEntries(new FormData(form).entries());
  const nowIso = () => new Date().toISOString();

  function loadJson(key, fallback){
    try { const value=JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; }
  }
  function saveJson(key, value){ try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
  function slug(text='material-aulora'){
    return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70) || 'material-aulora';
  }
  function toast(message){
    const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),2800);
  }
  function formatDateBR(value){
    if(!value) return '';
    const parts=value.split('-'); if(parts.length===3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    try{return new Intl.DateTimeFormat('pt-BR').format(new Date(value));}catch{return value;}
  }
  function downloadBlob(filename, content, type='application/octet-stream'){
    const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1200);
  }
  function sanitizeHtml(html=''){
    const tpl=document.createElement('template'); tpl.innerHTML=String(html);
    $$('script,style,iframe,object,embed,form,button,input,textarea,select,link,meta',tpl.content).forEach(el=>el.remove());
    $$('*',tpl.content).forEach(el=>{
      [...el.attributes].forEach(attr=>{
        const n=attr.name.toLowerCase(), v=String(attr.value||'').trim().toLowerCase();
        if(n.startsWith('on') || (['href','src','xlink:href'].includes(n) && v.startsWith('javascript:'))) el.removeAttribute(attr.name);
      });
    });
    return tpl.innerHTML;
  }

  async function apiFetch(url, options={}){
    const opts={credentials:'same-origin',...options};
    if(opts.body && typeof opts.body!=='string'){
      opts.headers={...(opts.headers||{}),'Content-Type':'application/json'};
      opts.body=JSON.stringify(opts.body);
    }
    const res=await fetch(url,opts); const payload=await res.json().catch(()=>({}));
    if(!res.ok){const err=new Error(payload.error||'Não foi possível concluir a operação.');err.code=payload.code;err.payload=payload;throw err;}
    return payload;
  }
  function setAuthError(panel,message=''){
    const el=$(panel==='signup'?'#signupError':'#loginError');
    if(!el)return; el.textContent=message; el.hidden=!message;
  }
  function openAuth(tab='login'){
    const dialog=$('#authDialog');
    setAuthError('login'); setAuthError('signup');
    $$('.auth-tab').forEach(b=>b.classList.toggle('active',b.dataset.authTab===tab));
    $$('[data-auth-panel]').forEach(p=>p.classList.toggle('active',p.dataset.authPanel===tab));
    if(!dialog.open)dialog.showModal();
  }
  function closeAuth(){const dialog=$('#authDialog');if(dialog.open)dialog.close();}
  $$('.auth-tab').forEach(b=>b.addEventListener('click',()=>openAuth(b.dataset.authTab)));
  $('#authCloseBtn').addEventListener('click',closeAuth);
  $('#authDialog').addEventListener('click',e=>{if(e.target===$('#authDialog'))closeAuth();});

  function planName(user){return user?.plan==='pro'?'Pro':user?'Grátis':'Sem conta';}
  function applyUser(user){
    app.user=user||null; app.usage=user?.usage||null; app.billingEnabled=Boolean(user?.billing?.enabled);
    if(user){
      app.profile=user.profile||loadJson(profileCacheKey(),DEFAULT_PROFILE); persistProfileCache();
    }else app.profile=loadJson(PROFILE_KEY,DEFAULT_PROFILE);
    applyProfile(true); updateAccountUI();
  }
  function updateAccountUI(){
    const user=app.user, plan=planName(user), isPro=user?.plan==='pro';
    $('#accountPlan').textContent=plan; $('#accountName').textContent=user?(user.name||user.email):''; $('#profileShortcut').textContent=user?String(user.name||user.email||'A').trim().charAt(0).toUpperCase():'A';
    $('#guestAuthActions').hidden=Boolean(user); $('#accountBtn').hidden=!user; $('#profileShortcut').hidden=!user;
    $$('[data-guest-only]').forEach(el=>el.hidden=Boolean(user));
    $$('[data-pro-only]').forEach(option=>{ option.disabled=Boolean(user)&&!isPro || !user; option.classList.toggle('option-pro-locked',!isPro); });
    [$('#activityForm'),$('#examForm')].forEach(form=>{ if(form && !isPro && Number(form.elements.count?.value||0)>10) form.elements.count.value='10'; });
    $('#planMiniBadge').textContent=user?plan.toUpperCase():'COMECE GRÁTIS'; $('#planMiniBadge').className=isPro?'plan-pro':user?'plan-free':'';
    $('#planMiniTitle').textContent=user?(isPro?'Aulora Pro ativo':'Aulora Grátis ativo'):'Crie sua conta gratuita';
    $('#planMiniUsage').textContent=user&&app.usage?`${app.usage.ai}/${app.usage.limits.ai} gerações inteligentes usadas neste mês.`:'Geração inteligente exige uma conta gratuita.';
    $('#settingsAccountTitle').textContent=user?(user.name||user.email):'Você ainda não entrou';
    $('#settingsPlanBadge').textContent=plan.toUpperCase(); $('#settingsPlanBadge').className=`plan-badge ${isPro?'plan-pro':user?'plan-free':''}`;
    $('#settingsAccountText').textContent=user?`Conta: ${user.email}. Seus novos materiais são salvos também na nuvem.`:'Ainda não é cadastrado? Crie sua conta grátis para gerar materiais, salvar na nuvem e sincronizar entre dispositivos.';
    $('#settingsAiUsage').textContent=user&&app.usage?`${app.usage.ai} / ${app.usage.limits.ai}`:'—';
    $('#settingsCloudCount').textContent=user?String(app.materials.length):'—';
    $('#settingsLoginBtn').hidden=Boolean(user); $('#settingsEnterBtn').hidden=Boolean(user); $('#syncCloudBtn').hidden=!user; $('#logoutBtn').hidden=!user;
    $('#freePlanSignupBtn').hidden=Boolean(user); $('#upgradeBtn').hidden=!user||isPro; $('#manageBillingBtn').hidden=!user||!isPro||!user.billing?.customer;
    $('#billingNote').textContent=isPro?'Plano Pro ativo: 200 gerações/mês, até 1.000 materiais e avaliações/atividades com até 20 questões.':user?'Aulora Grátis: 5 gerações/mês, até 25 materiais e avaliações/atividades com até 10 questões.':'Crie uma conta grátis para usar 5 gerações/mês e até 25 materiais. O Pro amplia os limites.';
    $('#libraryStorageMode').textContent=user?'Materiais sincronizados com sua conta. Uma cópia local fica neste dispositivo para acesso rápido.':'Materiais salvos somente neste dispositivo. Entre para sincronizar na nuvem.';
    $('#settingsStorageCopy').textContent=user?'Seus materiais ficam no banco do Aulora e também em cache neste navegador. Você pode baixar um backup a qualquer momento.':'Sem entrar, os materiais ficam somente neste navegador. Com uma conta gratuita, o Aulora também mantém uma cópia sincronizada na nuvem.';
    $$('.smart-action').forEach(btn=>btn.classList.toggle('locked',!user));
    const text=$('#smartBannerText'); if(text)text.textContent=user?`${app.usage?.ai||0} de ${app.usage?.limits?.ai||0} gerações inteligentes usadas neste mês. Seus materiais podem ser salvos na nuvem.`:'Entre com uma conta gratuita para gerar materiais e acessá-los em outros dispositivos. O modo local continua disponível sem cadastro.';
    updateSettingsStats();
  }
  async function loadAccount(){
    try{
      const data=await apiFetch('/api/me',{cache:'no-store'});
      if(data.user){
        applyUser(data.user); app.materials=loadJson(materialCacheKey(),[]); await syncCloudMaterials(false);
      }else{applyUser(null); app.materials=loadJson(GUEST_STORAGE_KEY,loadJson('aulora.materials.v1',[]));persistMaterialCache();}
    }catch(err){console.warn('Conta indisponível',err);applyUser(null);}
    updateStats();renderMaterials();
  }
  async function syncCloudMaterials(showToast=true){
    if(!app.user||app.cloudSyncing)return;app.cloudSyncing=true;
    try{const data=await apiFetch('/api/materials',{cache:'no-store'});app.materials=Array.isArray(data.materials)?data.materials:[];persistMaterialCache();updateStats();renderMaterials();if(showToast)toast('Biblioteca atualizada da nuvem.');}
    catch(err){if(showToast)toast(`Não foi possível sincronizar: ${err.message}`);}
    finally{app.cloudSyncing=false;updateAccountUI();}
  }
  async function offerGuestImport(){
    if(!app.user)return;const guest=loadJson(GUEST_STORAGE_KEY,[]);if(!guest.length)return;
    if(!confirm(`Há ${guest.length} material(is) salvo(s) neste dispositivo antes do login. Deseja copiá-los para sua conta?`))return;
    let sent=0;for(const original of guest){const m=typeof structuredClone==='function'?structuredClone(original):JSON.parse(JSON.stringify(original));try{await apiFetch('/api/materials',{method:'POST',body:{material:m}});sent++;}catch(err){if(err.code==='MATERIAL_LIMIT')break;}}
    await syncCloudMaterials(false);toast(`${sent} material(is) copiado(s) para sua conta.`);
  }
  $('#settingsLoginBtn').addEventListener('click',()=>openAuth('signup'));
  $('#settingsEnterBtn').addEventListener('click',()=>openAuth('login'));
  $('#topLoginBtn').addEventListener('click',()=>openAuth('login'));
  $('#topSignupBtn').addEventListener('click',()=>openAuth('signup'));
  $('#freePlanSignupBtn').addEventListener('click',()=>app.user?toast('Sua conta gratuita já está ativa.'):openAuth('signup'));
  $('#syncCloudBtn').addEventListener('click',()=>syncCloudMaterials(true));
  $('#loginForm').addEventListener('submit',async e=>{
    e.preventDefault();const d=formData(e.currentTarget);showLoading('Entrando no Aulora…','Validando sua conta.');
    try{const r=await apiFetch('/api/auth/login',{method:'POST',body:d});applyUser(r.user);closeAuth();app.materials=loadJson(materialCacheKey(),[]);await syncCloudMaterials(false);await offerGuestImport();toast('Conta conectada.');}
    catch(err){setAuthError('login',err.message);}finally{hideLoading();}
  });
  $('#signupForm').addEventListener('submit',async e=>{
    e.preventDefault();const d=formData(e.currentTarget);showLoading('Criando sua conta…','Preparando sua biblioteca na nuvem.');
    try{
      const r=await apiFetch('/api/auth/signup',{method:'POST',body:d});
      if(r.loginRequired){
        openAuth('login');
        $('#loginForm').elements.email.value=d.email||'';
        setAuthError('login','Sua conta foi criada. Entre com o e-mail e a senha que você acabou de cadastrar.');
        return;
      }
      applyUser(r.user);closeAuth();app.materials=[];persistMaterialCache();updateStats();renderMaterials();await offerGuestImport();toast('Conta gratuita criada. Bem-vindo ao Aulora.');
    }
    catch(err){setAuthError('signup',`${err.message}${err.code?` [${err.code}]`:''}`);}finally{hideLoading();}
  });
  $('#logoutBtn').addEventListener('click',async()=>{
    try{await apiFetch('/api/auth/logout',{method:'POST'});}catch{}
    app.user=null;app.usage=null;app.materials=loadJson(GUEST_STORAGE_KEY,[]);app.profile=loadJson(PROFILE_KEY,DEFAULT_PROFILE);applyProfile(true);updateAccountUI();updateStats();renderMaterials();toast('Você saiu da conta.');
  });
  $('#upgradeBtn').addEventListener('click',async()=>{
    if(!app.user){openAuth('signup');return;}
    showLoading('Abrindo pagamento…','Você será direcionado ao checkout seguro.');
    try{const r=await apiFetch('/api/billing/checkout',{method:'POST'});location.href=r.url;}
    catch(err){toast(err.code==='BILLING_NOT_CONFIGURED'?'O pagamento Pro ainda precisa ser ativado no painel do Aulora.':err.message);}
    finally{hideLoading();}
  });
  $('#manageBillingBtn').addEventListener('click',async()=>{
    showLoading('Abrindo sua assinatura…','Carregando o portal de cobrança.');
    try{const r=await apiFetch('/api/billing/portal',{method:'POST'});location.href=r.url;}catch(err){toast(err.message);}finally{hideLoading();}
  });

  function setActivityMenu(open){
    const toggle=$('#activityNavToggle'), submenu=$('#activityNavSubmenu');
    if(!toggle||!submenu)return;
    toggle.setAttribute('aria-expanded',open?'true':'false');
    submenu.hidden=!open;
  }

  function go(view){
    $$('.view').forEach(v=>v.classList.toggle('active', v.id===`view-${view}`));
    $$('.nav-item[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
    const activityToggle=$('#activityNavToggle');
    if(activityToggle) activityToggle.classList.toggle('active',view==='activity');
    if(view!=='activity') setActivityMenu(false);
    const meta=titles[view]||titles.dashboard; $('#pageTitle').textContent=meta[0]; $('#pageSubtitle').textContent=meta[1];
    $('#sidebar').classList.remove('open');
    if(view==='materials') renderMaterials();
    if(view==='settings') updateSettingsStats();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  $$('.nav-item[data-view]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.view)));
  $('#activityNavToggle')?.addEventListener('click',()=>{
    const isOpen=$('#activityNavToggle').getAttribute('aria-expanded')==='true';
    setActivityMenu(!isOpen);
  });
  $$('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));

  const inclusivePresets = {
    tea:{adaptationProfile:'Estudante autista / TEA',supportLevel:'Apoio moderado',activityType:'Mista inclusiva',visualStyle:'Baixa carga visual',responseMode:'Múltiplas formas de resposta',languageStyle:'Literal, sem metáforas ou ambiguidades',difficulty:'Bem acessível',count:'5',optionCount:'3',instructions:'Faça uma tarefa de cada vez. Leia ou escute a instrução e responda do jeito indicado.'},
    special:{adaptationProfile:'Educação especial — apoio ampliado',supportLevel:'Apoio frequente',activityType:'Mista inclusiva',visualStyle:'Uma tarefa por bloco',responseMode:'Múltiplas formas de resposta',languageStyle:'Frases curtas e diretas',difficulty:'Bem acessível',count:'5',optionCount:'2'},
    drawing:{adaptationProfile:'',supportLevel:'Apoio leve',activityType:'Desenho guiado',visualStyle:'Uma tarefa por bloco',responseMode:'Desenhar / pintar',languageStyle:'Frases curtas e diretas',difficulty:'Fácil',count:'5',answerSpace:'6'},
    association:{adaptationProfile:'',supportLevel:'Apoio leve',activityType:'Ligar / associar',visualStyle:'Baixa carga visual',responseMode:'Ligar / associar',languageStyle:'Uma instrução por vez',difficulty:'Fácil',count:'5',optionCount:'3'},
    literacy:{adaptationProfile:'Alfabetização / pré-leitor',supportLevel:'Apoio moderado',activityType:'Visual e objetiva',visualStyle:'Letra e espaços ampliados',responseMode:'Múltiplas formas de resposta',languageStyle:'Linguagem muito simples',difficulty:'Bem acessível',count:'5',optionCount:'3'},
    visual:{adaptationProfile:'Leitura acessível / linguagem simples',supportLevel:'Apoio leve',activityType:'Visual e objetiva',visualStyle:'Alto contraste e poucos elementos',responseMode:'Marcar / circular',languageStyle:'Frases curtas e diretas',difficulty:'Fácil',count:'5',optionCount:'3'}
  };
  $$('[data-inclusive-preset]').forEach(btn=>btn.addEventListener('click',()=>{
    const preset=inclusivePresets[btn.dataset.inclusivePreset]; if(!preset)return;
    go('activity');
    Object.entries(preset).forEach(([name,value])=>{const field=activityForm.elements[name];if(field)field.value=value;});
    $$('[data-inclusive-preset]').forEach(b=>b.classList.toggle('active',b===btn));
    saveActivityDraft();
    toast('Modelo inclusivo aplicado. Complete disciplina, turma e tema e ajuste o que precisar.');
    setTimeout(()=>activityForm.elements.topic?.focus(),120);
  }));
  $('#profileShortcut').addEventListener('click',()=>go('settings'));
  $('#accountBtn').addEventListener('click',()=>go('settings'));
  $('#menuBtn').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
  document.addEventListener('click',e=>{ if(innerWidth<=800 && $('#sidebar').classList.contains('open') && !e.target.closest('#sidebar') && !e.target.closest('#menuBtn')) $('#sidebar').classList.remove('open'); });

  $$('.tab').forEach(tab=>tab.addEventListener('click',()=>{
    $$('.tab').forEach(t=>t.classList.remove('active')); tab.classList.add('active');
    $$('.tab-panel').forEach(p=>p.classList.toggle('active', p.id===tab.dataset.tab));
  }));

  function materialCacheKey(){ return app.user ? `aulora.materials.user.${app.user.id}` : GUEST_STORAGE_KEY; }
  function profileCacheKey(){ return app.user ? `aulora.profile.user.${app.user.id}` : PROFILE_KEY; }
  function persistMaterialCache(){ saveJson(materialCacheKey(), app.materials); }
  function persistProfileCache(){ saveJson(profileCacheKey(), app.profile); }

  function applyProfile(force=false){
    $$('[data-profile]').forEach(field=>{
      const key=field.dataset.profile; if((force||!field.value) && app.profile[key]!==undefined) field.value=app.profile[key]||'';
    });
    const initials=(app.profile.teacher||app.user?.name||'P').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase() || 'P';
    $('#profileShortcut').textContent=initials;
    const pf=$('#profileForm'); if(pf){ Object.entries(app.profile).forEach(([k,v])=>{ const f=pf.elements.namedItem(k); if(f) f.value=v||''; }); }
  }
  $('#profileForm').addEventListener('submit',async e=>{
    e.preventDefault(); app.profile=formData(e.currentTarget); persistProfileCache(); applyProfile();
    if(app.user){
      try{const r=await apiFetch('/api/me',{method:'PUT',body:{name:app.profile.teacher,profile:app.profile}});applyUser(r.user);toast('Perfil salvo e sincronizado.');}
      catch(err){toast(`Perfil salvo neste dispositivo. Nuvem: ${err.message}`);}
    }else toast('Perfil salvo neste dispositivo.');
  });

  function initDraft(form, name, statusSelector){
    const key=DRAFT_PREFIX+name;
    const restore=()=>{ const draft=loadJson(key,null); if(!draft)return; Object.entries(draft).forEach(([n,v])=>{const f=form.elements.namedItem(n);if(f)f.value=v;}); const el=$(statusSelector); if(el)el.textContent='Rascunho anterior recuperado automaticamente.'; };
    const save=()=>{ saveJson(key,formData(form)); const el=$(statusSelector); if(el)el.textContent=`Rascunho salvo automaticamente às ${new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date())}.`; };
    let timer; form.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(save,450)}); form.addEventListener('change',save);
    form.addEventListener('reset',()=>setTimeout(()=>{localStorage.removeItem(key);applyProfile();const el=$(statusSelector);if(el)el.textContent='Rascunho limpo.';},0));
    restore(); return save;
  }

  const planForm=$('#planForm'), activityForm=$('#activityForm'), examForm=$('#examForm'), abntForm=$('#abntForm');
  const savePlanDraft=initDraft(planForm,'plan','#planDraftStatus');
  const saveActivityDraft=initDraft(activityForm,'activity','#activityDraftStatus');
  const saveExamDraft=initDraft(examForm,'exam','#examDraftStatus');

  function showLoading(title='Preparando seu material…', text='Isso costuma levar alguns segundos.'){
    $('#loadingTitle').textContent=title; $('#loadingText').textContent=text; $('#loadingOverlay').hidden=false;
  }
  function hideLoading(){ $('#loadingOverlay').hidden=true; }

  async function checkSmartStatus(){
    const dot=$('#aiDot'), status=$('#aiStatus'), detail=$('#aiStatusDetail'), badge=$('#smartBadge');
    try{
      const data=await apiFetch('/api/health',{cache:'no-store'}); if(!data.ok)throw new Error('offline');
      app.smartOnline=Boolean(data.ai&&data.db); app.billingEnabled=Boolean(data.billing);
      dot.classList.toggle('online',app.smartOnline);dot.classList.toggle('offline',!app.smartOnline);
      status.textContent=app.smartOnline?'Serviços do Aulora ativos':'Modo local disponível';
      detail.textContent=app.smartOnline?'Geração inteligente, conta e banco estão disponíveis.':'A geração inteligente está indisponível agora. Os modelos locais continuam funcionando.';
      badge.textContent=app.user?(app.user.plan==='pro'?'Pro':'Grátis'):'Conta opcional'; badge.className=`smart-badge ${app.smartOnline?'online':'offline'}`;
    }catch{
      app.smartOnline=false; dot.classList.add('offline'); dot.classList.remove('online'); status.textContent='Modo local disponível'; detail.textContent='Não foi possível conectar aos serviços do Aulora agora.'; badge.textContent='Modo local'; badge.className='smart-badge offline';
    }
    updateAccountUI();
  }

  function previewShell(material){
    const studentActions=['activity','exam'].includes(material.type)?`<button class="mini-button" data-action="studentdoc">Aluno Word</button><button class="mini-button" data-action="studentprint">Aluno PDF</button>`:'';
    return `<div class="preview-header"><div><span class="eyebrow">PRÉVIA</span><h3>${esc(material.title)}</h3></div><div class="preview-actions"><button class="mini-button" data-action="edit">Editar texto</button>${studentActions}<button class="mini-button" data-action="doc">Word</button><button class="mini-button" data-action="print">PDF</button><button class="mini-button primary" data-action="save">Salvar</button></div></div><div class="edit-hint" hidden>Modo de edição ativo. Clique no documento e faça os ajustes necessários antes de salvar ou exportar.</div><div class="document ${material.type==='abnt'?'abnt-doc':''}">${material.html}</div>`;
  }
  function bindPreview(preview, material){
    material.html=sanitizeHtml(material.html); preview.classList.remove('empty'); preview.innerHTML=previewShell(material);
    const doc=$('.document',preview), editBtn=$('[data-action="edit"]',preview), hint=$('.edit-hint',preview);
    editBtn.onclick=()=>{
      const editing=doc.contentEditable==='true';
      if(editing){doc.contentEditable='false';doc.classList.remove('editing');editBtn.textContent='Editar texto';hint.hidden=true;material.html=sanitizeHtml(doc.innerHTML);doc.innerHTML=material.html;toast('Edição concluída.');}
      else{doc.contentEditable='true';doc.classList.add('editing');editBtn.textContent='Concluir edição';hint.hidden=false;doc.focus();}
    };
    const sync=()=>{material.html=sanitizeHtml(doc.innerHTML);return material;};
    $('[data-action="save"]',preview).onclick=()=>saveMaterial(sync());
    $('[data-action="doc"]',preview).onclick=()=>exportDoc(sync());
    $('[data-action="print"]',preview).onclick=()=>printMaterial(sync());
    const sd=$('[data-action="studentdoc"]',preview), sp=$('[data-action="studentprint"]',preview);
    if(sd) sd.onclick=()=>{sync();exportDoc(material,stripAnswerKey(material.html),'aluno');};
    if(sp) sp.onclick=()=>{sync();printMaterial(material,stripAnswerKey(material.html));};
  }
  function stripAnswerKey(html){ const wrap=document.createElement('div');wrap.innerHTML=html;$$('.answer-key',wrap).forEach(x=>x.remove());return wrap.innerHTML; }
  async function saveMaterial(material){
    material.updatedAt=nowIso(); const ix=app.materials.findIndex(x=>x.id===material.id); if(ix>=0)app.materials[ix]=material;else app.materials.unshift(material); persistMaterialCache(); updateStats(); renderMaterials();
    if(app.user){
      try{await apiFetch('/api/materials',{method:'POST',body:{material}});toast('Material salvo e sincronizado na nuvem.');}
      catch(err){toast(err.code==='MATERIAL_LIMIT'?'Limite da nuvem atingido. O material ficou salvo neste dispositivo.':`Material salvo localmente. Nuvem: ${err.message}`);}
    }else toast('Material salvo neste dispositivo. Entre para sincronizar na nuvem.');
  }

  function newMaterial(type,title,subtitle,data,html,typeLabel){ return {id:uid(),type,typeLabel:typeLabel||type,title,subtitle,createdAt:nowIso(),updatedAt:nowIso(),data,html:sanitizeHtml(html)}; }

  function planMeta(d){
    const rows=[]; if(d.school)rows.push(`<strong>Escola:</strong> ${esc(d.school)}`); if(d.teacher)rows.push(`<strong>Professor(a):</strong> ${esc(d.teacher)}`); rows.push(`<strong>Disciplina:</strong> ${esc(d.discipline)}`,`<strong>Turma:</strong> ${esc(d.grade)}`,`<strong>Etapa:</strong> ${esc(d.stage)}`,`<strong>Duração:</strong> ${esc(d.duration)}`,`<strong>Modalidade:</strong> ${esc(d.modality)}`); if(d.date)rows.push(`<strong>Data:</strong> ${esc(formatDateBR(d.date))}`); return `<div class="meta">${rows.map(x=>`<div>${x}</div>`).join('')}</div>`;
  }
  function localPlan(d){
    const objective=d.objective||`Compreender os conceitos centrais relacionados a ${d.topic} e aplicá-los em situações adequadas ao nível da turma.`;
    const prior=d.prior||`Levantar o que os estudantes já sabem sobre ${d.topic} por meio de perguntas iniciais.`;
    const resources=d.resources||'Quadro, material didático e recursos disponíveis na escola.';
    return `${planMeta(d)}<h1>PLANO DE AULA — ${esc(d.topic)}</h1><h2>1. Tema</h2><p>${esc(d.topic)}</p><h2>2. Objetivo</h2><p>${esc(objective)}</p><h2>3. Conhecimentos prévios</h2><p>${esc(prior)}</p><h2>4. Habilidade / referência curricular</h2><p>${d.bncc?esc(d.bncc):'Não informada. Inserir somente após conferência no currículo adotado pela rede.'}</p><h2>5. Desenvolvimento da aula</h2><ol><li><strong>Abertura:</strong> contextualizar o tema e realizar sondagem inicial.</li><li><strong>Desenvolvimento:</strong> conduzir ${esc((d.strategy||'exposição dialogada').toLowerCase())}, utilizando exemplos adequados à turma.</li><li><strong>Aplicação:</strong> propor tarefa em que os estudantes expliquem, resolvam, comparem ou produzam algo relacionado ao tema.</li><li><strong>Socialização:</strong> discutir estratégias, respostas e dúvidas.</li><li><strong>Fechamento:</strong> retomar o objetivo e registrar uma síntese.</li></ol><h2>6. Recursos</h2><p>${esc(resources)}</p><h2>7. Avaliação</h2><p>${esc(d.assessment||'Avaliação formativa')}, observando participação, compreensão e capacidade de aplicação dos conceitos.</p>${d.adaptations?`<h2>8. Adaptações e acessibilidade</h2><p>${esc(d.adaptations)}</p>`:''}${d.notes?`<h2>9. Observações</h2><p>${esc(d.notes)}</p>`:''}`;
  }
  function learningHeader(d,title,isExam=false){
    return `<div class="school-head">${d.school?`<strong>${esc(d.school)}</strong>`:''}<span>${esc(d.discipline||'')} • ${esc(d.grade||'')}</span></div><h1>${esc(title)}</h1><div class="student-fields"><span><strong>Aluno(a):</strong> __________________________________________</span><span><strong>Data:</strong> ${isExam&&d.date?esc(formatDateBR(d.date)):'____/____/______'}</span>${d.teacher?`<span><strong>Professor(a):</strong> ${esc(d.teacher)}</span>`:''}${isExam&&d.duration?`<span><strong>Duração:</strong> ${esc(d.duration)}</span>`:''}</div>`;
  }
  function sourceBlock(d){ return d.sourceText?`<div class="source-text"><strong>Texto / conteúdo-base</strong><p>${esc(d.sourceText).replace(/\n/g,'<br>')}</p></div>`:''; }
  function responseLines(n=2){ return Array.from({length:Number(n)||2},()=>'<div class="response-line"></div>').join(''); }
  function questionKind(d,i,isExam){
    const f=d.format||'Mista', count=Number(d.count)||10;
    if(/Somente objetivas|Objetivas/.test(f))return'objective'; if(/Somente discursivas|Discursivas/.test(f))return'discursive'; if(/Verdadeiro/.test(f))return'tf'; if(isExam&&f.startsWith('70%'))return i>Math.ceil(count*.7)?'discursive':'objective'; if(isExam&&f.startsWith('50%'))return i>Math.ceil(count*.5)?'discursive':'objective'; return i%3===0?'discursive':'objective';
  }
  function localPrompt(topic,i,kind){
    const pools={objective:[`Assinale a alternativa correta sobre <strong>${esc(topic)}</strong>.`,`Identifique a opção que melhor representa um conceito relacionado a <strong>${esc(topic)}</strong>.`],discursive:[`Explique, com suas palavras, um aspecto essencial de <strong>${esc(topic)}</strong>.`,`Relacione <strong>${esc(topic)}</strong> a um exemplo ou situação estudada e justifique.`],tf:[`Analise uma afirmação sobre <strong>${esc(topic)}</strong>, marque verdadeiro ou falso e justifique.`]}; return pools[kind][(i-1)%pools[kind].length];
  }
  function localQuestions(d,isExam=false){
    const n=Number(d.count)||10,total=Number(d.totalPoints||10);let html='',key='';
    for(let i=1;i<=n;i++){
      const kind=questionKind(d,i,isExam),point=isExam?total/n:0; html+=`<div class="question"><div class="question-title"><strong>${i}.</strong><span>${localPrompt(d.topic,i,kind)}</span>${isExam?`<b>${point.toLocaleString('pt-BR',{maximumFractionDigits:2})} pt</b>`:''}</div>`;
      if(kind==='objective'){html+=`<ol type="A" class="alternatives"><li>[Preencha a alternativa.]</li><li>[Preencha a alternativa.]</li><li>[Preencha a alternativa.]</li><li>[Preencha a alternativa.]</li></ol>`;key+=`<p><strong>${i}.</strong> Defina a alternativa correta depois de personalizar a questão.</p>`;}
      else if(kind==='tf'){html+=`<p>( &nbsp; ) Verdadeiro &nbsp;&nbsp; ( &nbsp; ) Falso</p>${responseLines(1)}`;key+=`<p><strong>${i}.</strong> Defina V/F e a justificativa esperada.</p>`;}
      else{html+=responseLines(d.answerSpace||3);key+=`<p><strong>${i}.</strong> Critérios: domínio conceitual, coerência e justificativa.</p>`;} html+='</div>';
    }
    return {html,key};
  }
  function localActivity(d){const q=localQuestions(d,false);return `${learningHeader(d,`ATIVIDADE — ${d.topic}`)}<div class="activity-summary"><p><strong>Tema:</strong> ${esc(d.topic)}</p>${d.objective?`<p><strong>Objetivo:</strong> ${esc(d.objective)}</p>`:''}${d.skill?`<p><strong>Referência curricular:</strong> ${esc(d.skill)}</p>`:''}</div>${sourceBlock(d)}<div class="instructions"><strong>Orientações</strong><p>${esc(d.instructions||'Leia com atenção e responda às questões. Revise suas respostas antes de entregar.')}</p></div>${q.html}<div class="answer-key"><h2>GABARITO / ORIENTAÇÕES DE CORREÇÃO</h2><p class="teacher-note">Modelo local: personalize enunciados e alternativas antes de aplicar.</p>${q.key}${d.notes?`<h3>Observações</h3><p>${esc(d.notes)}</p>`:''}</div>`;}
  function localExam(d){const q=localQuestions(d,true);return `${learningHeader(d,`AVALIAÇÃO — ${d.topic}`,true)}${d.skill?`<p class="curricular-ref"><strong>Referência curricular:</strong> ${esc(d.skill)}</p>`:''}${sourceBlock(d)}<div class="instructions"><strong>Instruções</strong><p>${esc(d.instructions||'Leia cada questão com atenção. Responda de forma legível e revise antes de entregar.')}</p></div>${q.html}<div class="score-footer"><strong>Nota:</strong> ______ / ${esc(d.totalPoints||10)}</div><div class="answer-key"><h2>GABARITO / CRITÉRIOS DE CORREÇÃO</h2><p class="teacher-note">Modelo local: personalize as questões antes de aplicar.</p>${q.key}${d.notes?`<h3>Critérios adicionais</h3><p>${esc(d.notes)}</p>`:''}</div>`;}
  function localAbnt(d){
    return `<div class="cover"><div><strong>${esc(d.institution||'INSTITUIÇÃO')}</strong><br>${esc(d.course||'')}</div><div><strong>${esc(d.author)}</strong></div><div><strong>${esc(d.title).toUpperCase()}</strong></div><div>${esc(d.city||'CIDADE')}<br>${esc(d.year||'')}</div></div><h2>RESUMO</h2><p>[Apresente objetivo, método, resultados e conclusão de forma concisa, conforme as exigências da instituição.]</p><p><strong>Palavras-chave:</strong> ${esc(d.keywords||'palavra-chave 1; palavra-chave 2; palavra-chave 3')}.</p><h2>1 INTRODUÇÃO</h2><p>${esc(d.theme||'[Contextualize e delimite o tema, apresente o problema e a justificativa.]')}</p><h3>1.1 Objetivo geral</h3><p>${esc(d.objective||'[Defina o objetivo geral.]')}</p><h3>1.2 Objetivos específicos</h3><ul><li>[Objetivo específico 1]</li><li>[Objetivo específico 2]</li><li>[Objetivo específico 3]</li></ul><h2>2 REFERENCIAL TEÓRICO</h2><p>[Organize a discussão em subseções e cite somente fontes realmente consultadas.]</p><h2>3 METODOLOGIA</h2><p>[Descreva tipo de pesquisa, procedimentos, participantes/fontes e forma de análise.]</p><h2>4 RESULTADOS E DISCUSSÃO</h2><p>[Apresente os achados e discuta-os com base nas fontes utilizadas.]</p><h2>5 CONSIDERAÇÕES FINAIS</h2><p>[Retome o objetivo e sintetize os principais resultados e limitações.]</p><h2>REFERÊNCIAS</h2><p>[Inclua apenas as obras efetivamente citadas. Use o formatador de referências do Aulora como apoio.]</p><div class="abnt-note"><strong>Revisão final:</strong> confira margens, paginação, fonte, espaçamento, citações, notas, ilustrações, tabelas, referências e o manual institucional antes da entrega.</div>`;
  }

  function localMaterial(kind,d){
    if(kind==='plan')return newMaterial('plan',`Plano de aula — ${d.topic}`,`${d.discipline} • ${d.grade}`,d,localPlan(d),'Plano de aula');
    if(kind==='activity')return newMaterial('activity',`Atividade — ${d.topic}`,`${d.discipline} • ${d.grade} • ${d.count} questões`,d,localActivity(d),'Atividade');
    if(kind==='exam')return newMaterial('exam',`Avaliação — ${d.topic}`,`${d.discipline} • ${d.grade} • ${d.totalPoints||10} pontos`,d,localExam(d),'Avaliação');
    return newMaterial('abnt',d.title,`${d.workType} • ${d.author}`,d,localAbnt(d),'Acadêmico / ABNT');
  }

  function previewFor(kind){ return $(`#${kind==='abnt'?'abnt':kind}Preview`); }

  async function generateSmart(kind,d){
    if(!app.user){
      openAuth('signup');
      toast('Crie sua conta grátis ou entre para gerar materiais com o Aulora.');
      return;
    }
    if((kind==='activity'||kind==='exam') && app.user.plan!=='pro' && Number(d.count||0)>10){
      toast('No Aulora Grátis, atividades e avaliações podem ter até 10 questões. O Pro libera até 20.');
      go('settings');
      return;
    }
    showLoading(kind==='plan'?'Criando o plano de aula…':kind==='activity'?'Criando a atividade…':kind==='exam'?'Montando a avaliação…':'Estruturando o trabalho…','O Aulora está gerando conteúdo específico para os dados informados.');
    try{
      const payload=await apiFetch('/api/generate',{method:'POST',body:{kind,data:d}});
      if(payload.usage){app.usage=payload.usage;if(app.user)app.user.usage=payload.usage;updateAccountUI();}
      const material=newMaterial(kind,payload.title||`${kind} — ${d.topic||d.title}`,payload.subtitle||'',d,payload.html||'',payload.typeLabel||({plan:'Plano de aula',activity:'Atividade',exam:'Avaliação',abnt:'Acadêmico / ABNT'}[kind]));
      bindPreview(previewFor(kind),material); toast('Material gerado. Revise, edite e salve quando estiver pronto.');
    }catch(err){
      if(err.code==='AI_LIMIT'){
        toast('Seu limite mensal de gerações foi atingido. Nenhum conteúdo genérico foi colocado no lugar da prova.');
        go('settings');
      } else if(err.status===401 || err.code==='AUTH_REQUIRED'){
        app.user=null; updateAccountUI(); openAuth('login'); toast('Sua sessão expirou. Entre novamente para gerar.');
      } else {
        toast(err.message||'Não foi possível gerar o material agora. Tente novamente.');
      }
      console.warn(err);checkSmartStatus();
    }finally{hideLoading();}
  }

  planForm.addEventListener('submit',e=>{e.preventDefault();savePlanDraft();generateSmart('plan',formData(e.currentTarget));});
  activityForm.addEventListener('submit',e=>{e.preventDefault();saveActivityDraft();generateSmart('activity',formData(e.currentTarget));});
  examForm.addEventListener('submit',e=>{e.preventDefault();saveExamDraft();generateSmart('exam',formData(e.currentTarget));});
  abntForm.addEventListener('submit',e=>{e.preventDefault();generateSmart('abnt',formData(e.currentTarget));});
  $$('[data-local]').forEach(btn=>btn.addEventListener('click',()=>{
    const kind=btn.dataset.local,form={plan:planForm,activity:activityForm,exam:examForm,abnt:abntForm}[kind];
    if(!form.reportValidity())return;
    if(kind==='activity'||kind==='exam'){
      if(!app.user){openAuth('signup');return;}
      generateSmart(kind,formData(form));return;
    }
    const m=localMaterial(kind,formData(form));bindPreview(previewFor(kind),m);toast('Estrutura manual montada. Este botão não usa geração inteligente.');
  }));

  if(!abntForm.elements.year.value)abntForm.elements.year.value=new Date().getFullYear();

  $('#checkAbntBtn').addEventListener('click',()=>{
    const text=$('#abntCheckText').value.trim(); if(text.length<100){toast('Cole um texto maior para realizar a verificação.');return;}
    const checks=[
      ['Introdução identificada',/\bINTRODU[CÇ][AÃ]O\b/i.test(text),'Inclua uma seção de introdução claramente identificada.'],
      ['Desenvolvimento estruturado',/\b(REFERENCIAL|FUNDAMENTA[CÇ][AÃ]O|DESENVOLVIMENTO|METODOLOGIA|RESULTADOS)\b/i.test(text),'Não foram detectadas seções claras de desenvolvimento.'],
      ['Conclusão / considerações finais',/\b(CONCLUS[AÃ]O|CONSIDERA[CÇ][OÕ]ES FINAIS)\b/i.test(text),'Inclua uma seção final.'],
      ['Referências identificadas',/\bREFER[EÊ]NCIAS\b/i.test(text),'Inclua a lista de referências ao final quando houver fontes citadas.'],
      ['Indícios de citações autor-data',/\([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^)]{1,70},\s*\d{4}[a-z]?[^)]*\)/.test(text),'Não foram encontrados sinais claros de citações autor-data. Confira as fontes usadas.'],
      ['Seções numeradas',/(^|\n)\s*1(?:\.\d+)*\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/m.test(text.toUpperCase()),'Não foram detectados títulos numerados; confirme o padrão exigido.'],
      ['Extensão suficiente para análise',text.length>1500,'O texto é curto; a análise estrutural fica limitada.'],
      ['Palavras-chave ou elementos pré-textuais',/PALAVRAS[- ]CHAVE|RESUMO/i.test(text),'Se o tipo de trabalho exigir, confira resumo e palavras-chave.']
    ];
    const ok=checks.filter(x=>x[1]).length,score=Math.round(ok/checks.length*100);
    $('#abntCheckResults').innerHTML=`<div class="check-score"><div class="score-circle">${score}%</div><div><span class="eyebrow">VERIFICAÇÃO TEXTUAL</span><h3>${score>=80?'Estrutura bem encaminhada':score>=55?'Há pontos para revisar':'Revisão recomendada'}</h3><small>Margens, fonte, paginação, recuos, espaçamentos e detalhes visuais precisam ser conferidos no arquivo final.</small></div></div>${checks.map(c=>`<div class="check-item ${c[1]?'ok':'warn'}"><div class="status">${c[1]?'✓':'!'}</div><div><strong>${c[0]}</strong><small>${c[1]?'Item identificado no texto.':c[2]}</small></div></div>`).join('')}`;
  });

  const referenceType=$('#referenceType');
  function updateReferenceFields(){
    const t=referenceType.value; $$('.ref-book').forEach(x=>x.hidden=t!=='book'); $$('.ref-article').forEach(x=>x.hidden=t!=='article'); $$('.ref-site').forEach(x=>x.hidden=t!=='site'); $$('.ref-online').forEach(x=>x.hidden=t!=='site');
  }
  referenceType.addEventListener('change',updateReferenceFields); updateReferenceFields();
  function accessDateText(v){ if(!v)return '';const [y,m,d]=v.split('-');const months=['jan.','fev.','mar.','abr.','maio','jun.','jul.','ago.','set.','out.','nov.','dez.'];return `${Number(d)} ${months[Number(m)-1]} ${y}`; }
  function formatReference(d){
    const authors=(d.authors||d.siteName||'AUTOR NÃO INFORMADO').trim().replace(/\s+$/,''); const title=`${d.title}${d.subtitle?`: ${d.subtitle}`:''}`;
    if(d.type==='book')return `${authors}. ${title}. ${d.edition?d.edition+'. ':''}${d.place||'[S. l.]'}: ${d.publisher||'[s. n.]'}, ${d.year||'[s. d.]'}.`;
    if(d.type==='article')return `${authors}. ${title}. ${d.journal||'Título do periódico'}, ${d.volume?d.volume+', ':''}${d.pages?d.pages+', ':''}${d.year||'[s. d.]'}.`;
    return `${authors}. ${title}. ${d.siteName?d.siteName+', ':''}${d.year||'[s. d.]'}. ${d.url?`Disponível em: ${d.url}. `:''}${d.accessDate?`Acesso em: ${accessDateText(d.accessDate)}.`:''}`;
  }
  $('#referenceForm').addEventListener('submit',e=>{
    e.preventDefault();const d=formData(e.currentTarget),ref=formatReference(d),preview=$('#referencePreview');
    const material=newMaterial('reference',`Referência — ${d.title}`,d.type==='book'?'Livro':d.type==='article'?'Artigo':'Página / site',d,`<div class="reference-output"><p>${esc(ref)}</p></div>`,'Referência');
    preview.classList.remove('empty'); preview.innerHTML=`<div class="preview-header"><div><span class="eyebrow">REFERÊNCIA FORMATADA</span><h3>${esc(d.title)}</h3></div></div><div class="reference-output"><p id="referenceText">${esc(ref)}</p></div><div class="reference-actions"><button class="ghost-button" id="copyReferenceBtn">Copiar</button><button class="primary-button" id="saveReferenceBtn">Salvar na biblioteca</button></div><div class="abnt-note">Use como apoio e confira detalhes específicos da fonte e o manual da instituição antes da entrega.</div>`;
    $('#copyReferenceBtn').onclick=async()=>{try{await navigator.clipboard.writeText(ref);toast('Referência copiada.');}catch{toast('Selecione e copie a referência manualmente.');}}; $('#saveReferenceBtn').onclick=()=>saveMaterial(material);
  });

  function persist(){persistMaterialCache();updateStats();}
  function typeIcon(type){return({plan:'▤',activity:'✎',exam:'✓',abnt:'¶',reference:'§'})[type]||'▣';}
  function renderMaterials(){
    const q=$('#materialsSearch').value.trim().toLowerCase(),filter=$('#materialsFilter').value;
    const list=app.materials.filter(m=>(filter==='all'||m.type===filter)&&`${m.title} ${m.subtitle||''} ${m.typeLabel||''}`.toLowerCase().includes(q)); const el=$('#materialsList');
    if(!list.length){el.innerHTML=`<div class="library-empty"><strong>${app.materials.length?'Nenhum material encontrado.':'Sua biblioteca ainda está vazia.'}</strong><p>${app.materials.length?'Tente alterar a busca ou o filtro.':'Crie um plano, atividade, avaliação ou material acadêmico e salve aqui.'}</p></div>`;return;}
    el.innerHTML=list.map(m=>`<article class="material-item"><div class="material-type-icon">${typeIcon(m.type)}</div><div><h3>${esc(m.title)}</h3><p>${esc(m.typeLabel||'Material')} • ${esc(m.subtitle||'')} • ${new Intl.DateTimeFormat('pt-BR').format(new Date(m.updatedAt||m.createdAt))} <span class="cloud-pill sync-state ${app.user?'':'local'}">${app.user?'☁ Nuvem':'Neste dispositivo'}</span></p></div><div class="material-actions"><button class="mini-button" data-open="${m.id}">Abrir</button><button class="mini-button" data-doc="${m.id}">Word</button><button class="mini-button" data-duplicate="${m.id}">Duplicar</button><button class="mini-button" data-delete="${m.id}">Excluir</button></div></article>`).join('');
    $$('[data-open]',el).forEach(b=>b.onclick=()=>openMaterial(b.dataset.open)); $$('[data-doc]',el).forEach(b=>b.onclick=()=>exportDoc(app.materials.find(m=>m.id===b.dataset.doc))); $$('[data-duplicate]',el).forEach(b=>b.onclick=()=>duplicateMaterial(b.dataset.duplicate)); $$('[data-delete]',el).forEach(b=>b.onclick=()=>deleteMaterial(b.dataset.delete));
  }
  $('#materialsSearch').addEventListener('input',renderMaterials);$('#materialsFilter').addEventListener('change',renderMaterials);
  async function deleteMaterial(id){
    if(!confirm('Excluir este material?'))return;
    app.materials=app.materials.filter(m=>m.id!==id);persist();renderMaterials();
    if(app.user){try{await apiFetch(`/api/materials/${encodeURIComponent(id)}`,{method:'DELETE'});toast('Material excluído da conta.');}catch(err){toast(`Excluído deste dispositivo. Nuvem: ${err.message}`);}}
    else toast('Material excluído.');
  }
  function duplicateMaterial(id){const m=app.materials.find(x=>x.id===id);if(!m)return;const copy=typeof structuredClone==='function'?structuredClone(m):JSON.parse(JSON.stringify(m));copy.id=uid();copy.title=`${m.title} — cópia`;copy.createdAt=nowIso();copy.updatedAt=nowIso();saveMaterial(copy);}
  $('#clearMaterialsBtn').addEventListener('click',async()=>{
    if(!app.materials.length||!confirm(app.user?'Apagar todos os materiais desta conta e deste dispositivo?':'Apagar todos os materiais salvos neste dispositivo?'))return;
    app.materials=[];persist();renderMaterials();
    if(app.user){try{await apiFetch('/api/materials?all=1',{method:'DELETE'});toast('Biblioteca da conta limpa.');}catch(err){toast(`Dados locais limpos. Nuvem: ${err.message}`);}}
    else toast('Biblioteca limpa.');
  });

  const dialog=$('#materialDialog');
  function openMaterial(id){const m=app.materials.find(x=>x.id===id);if(!m)return;app.currentMaterial=m;$('#dialogType').textContent=m.typeLabel||'MATERIAL';$('#dialogTitle').textContent=m.title;$('#dialogBody').innerHTML=`<div class="document ${m.type==='abnt'?'abnt-doc':''}">${sanitizeHtml(m.html)}</div>`;dialog.showModal();}
  $('#dialogDocBtn').onclick=()=>app.currentMaterial&&exportDoc(app.currentMaterial);$('#dialogPrintBtn').onclick=()=>app.currentMaterial&&printMaterial(app.currentMaterial);$('#dialogDuplicateBtn').onclick=()=>{if(app.currentMaterial){duplicateMaterial(app.currentMaterial.id);dialog.close();}};

  function exportDoc(material,htmlOverride=null,suffix=''){
    if(!material)return;const isAbnt=material.type==='abnt';const style=isAbnt?`@page{size:A4;margin:3cm 2cm 2cm 3cm}body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;text-align:justify}`:`@page{size:A4;margin:2cm}body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.4}`;
    const content=`<!doctype html><html><head><meta charset="UTF-8"><style>${style}h1{text-align:center;font-size:14pt}h2{font-size:12pt;margin-top:18pt}.meta{padding:8pt;background:#f4f4f4}.answer-key{page-break-before:always}.cover{min-height:22cm;text-align:center;display:flex;flex-direction:column;justify-content:space-between}.question{margin:12pt 0}.response-line{height:22pt;border-bottom:1px solid #bbb}</style></head><body>${sanitizeHtml(htmlOverride??material.html)}</body></html>`;
    downloadBlob(`${slug(material.title)}${suffix?'-'+suffix:''}.doc`,'\ufeff'+content,'application/msword');toast('Arquivo para Word gerado.');
  }
  function printMaterial(material,htmlOverride=null){
    if(!material)return;const w=window.open('','_blank');if(!w){toast('Permita pop-ups para imprimir.');return;}const isAbnt=material.type==='abnt';w.document.write(`<!doctype html><html><head><title>${esc(material.title)}</title><style>@page{size:A4;margin:${isAbnt?'3cm 2cm 2cm 3cm':'2cm'}}body{font-family:${isAbnt?"'Times New Roman',serif":"Arial,sans-serif"};font-size:${isAbnt?'12pt':'11pt'};line-height:${isAbnt?'1.5':'1.4'};color:#111}h1{text-align:center;font-size:15pt}h2{font-size:12pt;margin-top:18pt}.meta{padding:8pt;background:#f4f4f4}.answer-key{page-break-before:always}.cover{height:22cm;text-align:center;display:flex;flex-direction:column;justify-content:space-between}.response-line{height:22pt;border-bottom:1px solid #bbb}</style></head><body>${sanitizeHtml(htmlOverride??material.html)}</body></html>`);w.document.close();w.focus();setTimeout(()=>w.print(),300);
  }

  function makeBackup(){return {format:'aulora-backup',createdAt:nowIso(),profile:app.profile,materials:app.materials};}
  function exportBackup(){downloadBlob(`aulora-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(makeBackup(),null,2),'application/json');toast('Backup baixado.');}
  $('#exportBackupBtn').onclick=exportBackup;$('#settingsExportBtn').onclick=exportBackup;
  $('#importBackupInput').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(data.format!=='aulora-backup'||!Array.isArray(data.materials))throw new Error();if(!confirm(`Importar ${data.materials.length} materiais? Os materiais atuais serão mantidos e os novos serão adicionados.`))return;const ids=new Set(app.materials.map(x=>x.id));data.materials.forEach(m=>{if(!ids.has(m.id))app.materials.push(m)});if(data.profile&&confirm('Também importar o perfil salvo no backup?'))app.profile={...app.profile,...data.profile};persistProfileCache();persist();applyProfile();renderMaterials();toast(app.user?'Backup importado neste dispositivo. Salve/duplique materiais para sincronizá-los individualmente.':'Backup importado.');}catch{toast('Arquivo de backup inválido.');}finally{e.target.value='';}
  });
  $('#resetAppBtn').onclick=()=>{if(confirm('Apagar cache local, perfil local e rascunhos deste dispositivo? Materiais já sincronizados na nuvem não serão excluídos.')){Object.keys(localStorage).filter(k=>k.startsWith('aulora.')).forEach(k=>localStorage.removeItem(k));app.materials=[];app.profile={...DEFAULT_PROFILE};location.reload();}};

  function updateStats(){
    $('#statMaterials').textContent=app.materials.length;$('#statPlans').textContent=app.materials.filter(m=>m.type==='plan').length;$('#statActivities').textContent=app.materials.filter(m=>m.type==='activity').length;$('#statExams').textContent=app.materials.filter(m=>m.type==='exam').length;$('#statAbnt').textContent=app.materials.filter(m=>['abnt','reference'].includes(m.type)).length;updateSettingsStats();
  }
  function updateSettingsStats(){
    if(!$('#settingsMaterialCount'))return;$('#settingsMaterialCount').textContent=app.materials.length;let bytes=0;try{bytes=new Blob([localStorage.getItem(materialCacheKey())||'']).size;}catch{}$('#settingsStorageSize').textContent=bytes<1024?`${bytes} B`:`${(bytes/1024).toFixed(1)} KB`;if($('#settingsCloudCount'))$('#settingsCloudCount').textContent=app.user?String(app.materials.length):'—';
  }

  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();app.deferredInstall=e;$('#installBtn').hidden=false;});
  $('#installBtn').addEventListener('click',async()=>{if(!app.deferredInstall)return;app.deferredInstall.prompt();await app.deferredInstall.userChoice;app.deferredInstall=null;$('#installBtn').hidden=true;});
  if('serviceWorker' in navigator && location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));

  const billingState=new URLSearchParams(location.search).get('billing');
  if(billingState){history.replaceState({},'',location.pathname+location.hash);setTimeout(()=>toast(billingState==='success'?'Pagamento concluído. Atualizando seu plano…':'Pagamento cancelado.'),300);}
  applyProfile();updateStats();renderMaterials();
  Promise.allSettled([checkSmartStatus(),loadAccount()]).then(()=>{if(billingState==='success')setTimeout(()=>loadAccount(),1800);});
})();
