(() => {
  'use strict';

  const STORAGE_KEY = 'aulora.materials';
  const PROFILE_KEY = 'aulora.profile';
  const DRAFT_PREFIX = 'aulora.draft.';
  const GUEST_STORAGE_KEY = STORAGE_KEY;
  const DEFAULT_PROFILE = { teacher:'', role:'', school:'', network:'', state:'', city:'', municipalityId:'', stage:'Anos finais do Ensino Fundamental' };
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
    reports:['Relatórios','Pareceres e acompanhamento pedagógico'],
    abnt:['Acadêmico / ABNT','Estrutura, referências e verificação'],
    materials:['Meus materiais','Sua biblioteca sincronizada'],
    settings:['Perfil e plano','Conta, preferências e armazenamento'],
    admin:['Administração','Usuários, planos e indicadores do Aulora']
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

  const municipalityCache=new Map();
  async function loadStatesAndMunicipalities(){
    const stateSelects=$$('[data-state-select]');
    if(!stateSelects.length)return;
    let states=[];
    try{const data=await apiFetch('/api/locations/states',{cache:'force-cache'});states=data.states||[];}catch(err){console.warn('Estados indisponíveis',err);}
    const options='<option value="">Selecione o estado</option>'+states.map(s=>`<option value="${esc(s.sigla)}">${esc(s.nome)} (${esc(s.sigla)})</option>`).join('');
    stateSelects.forEach(sel=>{const current=sel.value;sel.innerHTML=options;if(current)sel.value=current;sel.addEventListener('change',()=>{if(sel.value)localStorage.setItem('aulora.lastState',sel.value);loadMunicipalitiesForForm(sel.closest('form'));updateStats();});});
    $$('[data-city-select]').forEach(sel=>sel.addEventListener('change',()=>{const form=sel.closest('form');const opt=sel.selectedOptions[0];const hidden=$('[data-city-id]',form);if(hidden)hidden.value=opt?.dataset?.id||'';refreshCurriculumStatus(form);}));
    for(const form of $$('.generator-form')){const state=$('[data-state-select]',form);if(state?.value)await loadMunicipalitiesForForm(form);}
  }
  async function loadMunicipalitiesForForm(form){
    if(!form)return;const state=$('[data-state-select]',form),city=$('[data-city-select]',form),hidden=$('[data-city-id]',form);if(!state||!city)return;
    const uf=state.value;if(hidden)hidden.value='';
    if(!uf){city.disabled=true;city.innerHTML='<option value="">Selecione o estado</option>';refreshCurriculumStatus(form);return;}
    city.disabled=true;city.innerHTML='<option value="">Carregando municípios...</option>';
    try{let cities=municipalityCache.get(uf);if(!cities){const data=await apiFetch(`/api/locations/municipalities?uf=${encodeURIComponent(uf)}`,{cache:'force-cache'});cities=data.municipalities||[];municipalityCache.set(uf,cities);}
      city.innerHTML='<option value="">Selecione o município</option>'+cities.map(c=>`<option value="${esc(c.nome)}" data-id="${esc(c.id)}">${esc(c.nome)}</option>`).join('');city.disabled=false;
    }catch(err){city.innerHTML='<option value="">Não foi possível carregar</option>';toast('Não foi possível carregar os municípios agora.');}
    refreshCurriculumStatus(form);
  }
  async function refreshCurriculumStatus(form){
    if(!form)return;const status=$('[data-curriculum-status]',form),state=$('[data-state-select]',form),city=$('[data-city-select]',form),hidden=$('[data-city-id]',form);if(!status||!state?.value||!city?.value){if(status)status.textContent='Selecione estado e município para consultar a base curricular cadastrada.';return;}
    status.classList.add('loading');status.textContent='Consultando base curricular do território...';
    try{const qs=new URLSearchParams({uf:state.value,municipality:city.value,municipalityId:hidden?.value||''});const data=await apiFetch(`/api/curriculum/context?${qs}`,{cache:'no-store'});const local=(data.sources||[]).filter(s=>s.scope==='municipal').length;const estadual=(data.sources||[]).filter(s=>s.scope==='state').length;status.textContent=local?`✓ ${local} fonte(s) curricular(es) municipal(is) cadastrada(s). O Aulora usará essas fontes na geração.`:estadual?`○ Sem currículo municipal confirmado no banco. ${estadual} fonte(s) estadual(is) disponível(is); a geração usará estado + BNCC e avisará o professor.`:'○ Currículo municipal/estadual ainda não cadastrado no Aulora. A geração usará a referência informada pelo professor e BNCC em nível geral, sem inventar códigos ou regras locais.';status.classList.toggle('ok',local>0);}
    catch{status.textContent='Não foi possível consultar a base curricular agora. O Aulora não presumirá regras municipais sem fonte confirmada.';}finally{status.classList.remove('loading');}
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

  function planName(user){return user?.isAdmin?'Admin':user?.plan==='pro'?'Pro':user?'Básico':'Sem conta';}
  function planChipName(user){return user?.isAdmin?'Administrador':user?.plan==='pro'?'Plano Pro':user?'Plano Básico':'Sem conta';}
  function formatDisplayName(value){
    return String(value||'').trim().replace(/\s+/g,' ').toLowerCase().replace(/(^|[\s-])([\p{L}])/gu,(m,p1,p2)=>p1+p2.toUpperCase());
  }
  function userDisplayName(user){
    const formatted=formatDisplayName(user?.name||'');
    return formatted || (user?.email||'Professor(a)');
  }
  function isPro(){ return Boolean(app.user && (app.user.plan==='pro' || app.user.isAdmin)); }
  function isAdmin(){ return Boolean(app.user?.isAdmin); }
  function updateAccessGate(){
    const gate=$('#accessGate'), shell=$('#appShell');
    if(gate)gate.hidden=Boolean(app.user);
    if(shell)shell.hidden=!app.user;
  }
  function focusUpgrade(message='Este recurso faz parte do Aulora Pro.') {
    if(!app.user){openAuth('login');return false;}
    if(isPro())return true;
    const target='settings';
    document.body.dataset.view=target;
    $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${target}`));
    $$('.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===target));
    const meta=titles.settings; $('#pageTitle').textContent=meta[0]; $('#pageSubtitle').textContent=meta[1];
    toast(message+' Veja o Plano Pro.');
    setTimeout(()=>$('.plan-comparison-card')?.scrollIntoView({behavior:'smooth',block:'start'}),100);
    return false;
  }
  function applyUser(user){
    app.user=user||null; app.usage=user?.usage||null; app.billingEnabled=Boolean(user?.billing?.enabled);
    if(user){
      app.profile=user.profile||loadJson(profileCacheKey(),DEFAULT_PROFILE); persistProfileCache();
    }else app.profile=loadJson(PROFILE_KEY,DEFAULT_PROFILE);
    applyProfile(true); updateAccountUI(); updateAccessGate();
  }
  function updateAccountUI(){
    const user=app.user, plan=planName(user), chipPlan=planChipName(user), admin=Boolean(user?.isAdmin), pro=Boolean(user&&(user.plan==='pro'||admin)), displayName=userDisplayName(user);
    $('#accountPlan').textContent=chipPlan; $('#accountName').textContent=user?displayName:''; $('#profileShortcut').textContent=user?String(displayName||user.email||'A').trim().charAt(0).toUpperCase():'A';
    if($('#accountTopAvatar')) $('#accountTopAvatar').textContent=user?String(displayName||user.email||'A').trim().charAt(0).toUpperCase():'A';
    $('#guestAuthActions').hidden=Boolean(user); $('#accountMenuWrap').hidden=!user; $('#profileShortcut').hidden=true;
    if(user){
      const initial=String(displayName||user.email||'A').trim().charAt(0).toUpperCase();
      $('#accountMenuAvatar').textContent=initial; $('#accountMenuName').textContent=displayName||'Professor(a)'; $('#accountMenuEmail').textContent=user.email;
      $('#accountMenuPlan').textContent=chipPlan; $('#accountMenuUsage').textContent=app.usage?`${app.usage.ai} / ${app.usage.limits.ai} gerações neste mês`:'';
    } else { $('#accountMenu').hidden=true; $('#accountBtn').setAttribute('aria-expanded','false'); }
    $$('[data-guest-only]').forEach(el=>el.hidden=Boolean(user));
    $$('[data-pro-only]').forEach(option=>{ option.disabled=Boolean(user)&&!pro || !user; option.classList.toggle('option-pro-locked',!pro); });
    [$('#activityForm'),$('#examForm')].forEach(form=>{ if(form && !pro){ if(Number(form.elements.count?.value||0)>5) form.elements.count.value='5'; if(form.elements.imageMode && form.elements.imageMode.value!=='Sem imagens') form.elements.imageMode.value='Sem imagens'; } });
    $('#planMiniBadge').textContent=user?'PLANO ATIVO':'COMECE GRÁTIS'; $('#planMiniBadge').className=pro?'plan-pro':user?'plan-free':'';
    $('#planMiniTitle').textContent=user?(admin?'Aulora Admin':pro?'Aulora Pro ativo':'Aulora Básico ativo'):'Crie sua conta gratuita';
    $('#planMiniUsage').textContent=user&&app.usage?`${app.usage.ai}/${app.usage.limits.ai} gerações inteligentes usadas neste mês.`:'Geração inteligente exige uma conta gratuita.';
    $('#settingsAccountTitle').textContent=user?(displayName||user.email):'Você ainda não entrou';
    $('#settingsPlanBadge').textContent=plan.toUpperCase(); $('#settingsPlanBadge').className=`plan-badge ${pro?'plan-pro':user?'plan-free':''}`;
    $('#settingsAccountText').textContent=user?`Conta: ${user.email}. Seus novos materiais são salvos também na nuvem.`:'Ainda não é cadastrado? Crie sua conta grátis para gerar materiais, salvar na nuvem e sincronizar entre dispositivos.';
    $('#settingsAiUsage').textContent=user&&app.usage?`${app.usage.ai} / ${app.usage.limits.ai}`:'—';
    $('#settingsCloudCount').textContent=user?String(app.materials.length):'—';
    $('#settingsLoginBtn').hidden=Boolean(user); $('#settingsEnterBtn').hidden=Boolean(user); $('#syncCloudBtn').hidden=!user; $('#logoutBtn').hidden=!user;
    $('#freePlanSignupBtn').hidden=Boolean(user); $('#upgradeBtn').hidden=!user||pro; if($('#cardCheckoutBtn')) $('#cardCheckoutBtn').hidden=!user||pro; $('#manageBillingBtn').hidden=!user||!pro;
    const proExpiry=user?.billing?.expiresAt?new Date(user.billing.expiresAt):null;
    const expiryText=proExpiry&&!Number.isNaN(proExpiry.getTime())?proExpiry.toLocaleDateString('pt-BR'):'';
    $('#billingNote').textContent=admin?'Conta administrativa: acesso completo aos recursos do Aulora para gestão e testes.':pro?`Plano Pro ativo${expiryText?' até '+expiryText:''}: 200 gerações/mês, até 1.000 materiais, imagens, relatórios, Henry IA, exportação e avaliações/atividades com até 20 questões.`:user?'Aulora Básico: 2 gerações/mês, 3 materiais e até 5 questões. O Pro libera imagens, relatórios, ABNT, Henry IA, Word/PDF e recursos avançados.':'Crie uma conta Básica para experimentar o Aulora.';
    $('#libraryStorageMode').textContent=user?'Materiais sincronizados com sua conta. Uma cópia local fica neste dispositivo para acesso rápido.':'Entre para acessar sua biblioteca.';
    $('#settingsStorageCopy').textContent=user?'Seus materiais ficam no banco do Aulora e também em cache neste navegador. Você pode baixar um backup a qualquer momento.':'Entre para acessar dados e armazenamento.';
    $$('.smart-action').forEach(btn=>btn.classList.toggle('locked',!user));
    const text=$('#smartBannerText'); if(text)text.textContent=user?`${app.usage?.ai||0} de ${app.usage?.limits?.ai||0} gerações inteligentes usadas neste mês.`:'Entre para acessar o Aulora.';
    if($('#settingsAccountEmail')) $('#settingsAccountEmail').textContent=user?user.email:'—';
    if($('#securitySettingsCard')) $('#securitySettingsCard').hidden=!user;
    if($('#adminNavBtn')) $('#adminNavBtn').hidden=!admin;
    if($('#accountAdminItem')) $('#accountAdminItem').hidden=!admin;
    document.body.classList.toggle('plan-basic-mode',Boolean(user&&!pro));
    const inclusionDefaults={adaptationProfile:'',supportLevel:'Independência predominante',activityType:'Questões tradicionais',visualStyle:'Padrão',responseMode:'Escrita',languageStyle:'Padrão escolar',interests:'',accessNotes:''};
    if($('#activityForm')){Object.entries(inclusionDefaults).forEach(([name,value])=>{const field=$('#activityForm').elements[name];if(!field)return;field.disabled=Boolean(user&&!pro);if(user&&!pro)field.value=value;});}
    if($('#emailPrefsForm')) {
      $('#emailPrefsForm').hidden=!user||!pro;
      if(user&&pro){ const prefs=user.emailPrefs||{generated:true,saved:true,security:true,reports:false}; const f=$('#emailPrefsForm'); f.elements.generated.checked=prefs.generated!==false; f.elements.saved.checked=prefs.saved!==false; f.elements.reports.checked=prefs.reports===true; f.elements.security.checked=prefs.security!==false; const enabled=Boolean(user.emailDelivery?.enabled); $('#emailDeliveryBadge').textContent=enabled?'ATIVO':'CONFIGURAR'; $('#emailDeliveryBadge').className=`email-status-badge ${enabled?'active':'pending'}`; $('#emailProviderNote').textContent=enabled?'Cópias serão enviadas para '+user.email+'.':'O envio precisa estar configurado pelo administrador do Aulora.'; $('#sendTestEmailBtn').disabled=!enabled; }
    }
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
  $('#gateLoginBtn')?.addEventListener('click',()=>openAuth('login'));
  $('#gateSignupBtn')?.addEventListener('click',()=>openAuth('signup'));
  $('#freePlanSignupBtn').addEventListener('click',()=>app.user?toast('Sua conta gratuita já está ativa.'):openAuth('signup'));
  $('#syncCloudBtn').addEventListener('click',()=>syncCloudMaterials(true));
  $('#loginForm').addEventListener('submit',async e=>{
    e.preventDefault();const d=formData(e.currentTarget);showLoading('Entrando no Aulora…','Validando sua conta.');
    try{const r=await apiFetch('/api/auth/login',{method:'POST',body:d});applyUser(r.user);closeAuth();app.materials=loadJson(materialCacheKey(),[]);await syncCloudMaterials(false);await offerGuestImport();toast('Conta conectada.');}
    catch(err){setAuthError('login',err.message);}finally{hideLoading();}
  });
  $('#signupForm').addEventListener('submit',async e=>{
    e.preventDefault();const d=formData(e.currentTarget);
    if(d.password!==d.confirmPassword){setAuthError('signup','As senhas não são iguais.');return;}
    showLoading('Criando sua conta…','Preparando sua biblioteca na nuvem.');
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
  async function performLogout(){
    try{await apiFetch('/api/auth/logout',{method:'POST'});}catch{}
    app.materials=[];app.profile=loadJson(PROFILE_KEY,DEFAULT_PROFILE);applyUser(null);updateStats();renderMaterials();toast('Você saiu da conta.');
  }
  $('#logoutBtn').addEventListener('click',performLogout);
  $('#logoutSettingsBtn').addEventListener('click',performLogout);

  const passwordDialog=$('#passwordDialog');
  function openPasswordDialog(){ if(!app.user){openAuth('login');return;} $('#passwordError').hidden=true; $('#passwordError').textContent=''; $('#passwordForm').reset(); passwordDialog.showModal(); }
  function closePasswordDialog(){if(passwordDialog.open)passwordDialog.close();}
  $('#passwordCloseBtn').addEventListener('click',closePasswordDialog);
  passwordDialog.addEventListener('click',e=>{if(e.target===passwordDialog)closePasswordDialog();});
  $('#changePasswordBtn').addEventListener('click',openPasswordDialog);
  $('#passwordForm').addEventListener('submit',async e=>{
    e.preventDefault();const d=formData(e.currentTarget),err=$('#passwordError');err.hidden=true;
    if(d.newPassword!==d.confirmPassword){err.textContent='A confirmação não é igual à nova senha.';err.hidden=false;return;}
    if(d.newPassword===d.currentPassword){err.textContent='Escolha uma senha nova diferente da atual.';err.hidden=false;return;}
    try{const r=await apiFetch('/api/auth/change-password',{method:'POST',body:{currentPassword:d.currentPassword,newPassword:d.newPassword}});applyUser(r.user);closePasswordDialog();toast('Senha alterada com sucesso.');}
    catch(ex){err.textContent=ex.message||'Não foi possível alterar a senha.';err.hidden=false;}
  });
  $('#emailPrefsForm').addEventListener('submit',async e=>{
    e.preventDefault();if(!app.user)return;const f=e.currentTarget,emailPrefs={generated:f.elements.generated.checked,saved:f.elements.saved.checked,reports:f.elements.reports.checked,security:f.elements.security.checked};
    try{const r=await apiFetch('/api/me',{method:'PUT',body:{emailPrefs}});applyUser(r.user);toast('Preferências de e-mail salvas.');}catch(ex){toast(ex.message||'Não foi possível salvar as preferências.');}
  });
  $('#sendTestEmailBtn').addEventListener('click',async()=>{
    if(!app.user)return;try{await apiFetch('/api/email/test',{method:'POST'});toast('E-mail de teste enviado para '+app.user.email+'.');}catch(ex){toast(ex.code==='EMAIL_NOT_CONFIGURED'?'O envio de e-mail ainda não foi configurado no servidor.':(ex.message||'Falha ao enviar o e-mail de teste.'));}
  });
  let pixPollTimer=null, activePixPaymentId='';
  function closePixDialog(){
    const d=$('#pixDialog'); if(d?.open)d.close();
    if(pixPollTimer){clearInterval(pixPollTimer);pixPollTimer=null;}
  }
  function setPixState(state,message=''){
    const status=$('#pixStatus'); if(!status)return;
    status.className=`pix-status ${state||''}`;
    const strong=status.querySelector('strong'),small=status.querySelector('small');
    if(state==='approved'){strong.textContent='Pagamento confirmado';small.textContent='Aulora Pro ativado com sucesso.';}
    else if(state==='error'){strong.textContent='Não foi possível confirmar';small.textContent=message||'Tente consultar novamente.';}
    else {strong.textContent='Aguardando pagamento';small.textContent='O plano será ativado automaticamente.';}
  }
  async function checkPixStatus(silent=true){
    if(!activePixPaymentId)return;
    try{
      const r=await apiFetch(`/api/billing/pix/status?id=${encodeURIComponent(activePixPaymentId)}`,{cache:'no-store'});
      if(r.user)applyUser(r.user);
      if(r.approved){
        setPixState('approved');
        if(pixPollTimer){clearInterval(pixPollTimer);pixPollTimer=null;}
        setTimeout(()=>{closePixDialog();go('dashboard');toast('Pagamento confirmado! Seu Aulora Pro está ativo. ✨');},1700);
      }
    }catch(err){if(!silent)setPixState('error',err.message);}
  }
  async function openPixCheckout(){
    if(!app.user){openAuth('signup');return;}
    const dialog=$('#pixDialog'),loading=$('#pixLoading'),content=$('#pixContent'),error=$('#pixError');
    error.hidden=true; content.hidden=true; loading.hidden=false; activePixPaymentId='';
    if(!dialog.open)dialog.showModal();
    try{
      const r=await apiFetch('/api/billing/checkout',{method:'POST'});
      activePixPaymentId=r.paymentId;
      $('#pixCode').value=r.qrCode||'';
      const qr=$('#pixQrImage'); qr.src=r.qrCodeBase64?`data:image/png;base64,${r.qrCodeBase64}`:''; qr.hidden=!r.qrCodeBase64;
      const ticket=$('#pixTicketLink'); if(r.ticketUrl){ticket.href=r.ticketUrl;ticket.hidden=false}else ticket.hidden=true;
      const exp=r.expiresAt?new Date(r.expiresAt):null; $('#pixExpiry').textContent=exp&&!Number.isNaN(exp.getTime())?`Este QR Code vence em ${exp.toLocaleString('pt-BR')}.`:'O QR Code tem validade limitada.';
      loading.hidden=true;content.hidden=false;setPixState('pending');
      if(pixPollTimer)clearInterval(pixPollTimer);
      pixPollTimer=setInterval(()=>checkPixStatus(true),4000);
    }catch(err){
      loading.hidden=true;error.hidden=false;
      error.textContent=err.code==='BILLING_NOT_CONFIGURED'?'O Pix ainda precisa ser conectado ao Mercado Pago no Cloudflare.':(err.message||'Não foi possível gerar o Pix.');
    }
  }
  async function openCardCheckout(){
    if(!app.user){openAuth('signup');return;}
    const btn=$('#cardCheckoutBtn');
    const original=btn?.innerHTML;
    if(btn){btn.disabled=true;btn.textContent='Abrindo Mercado Pago…';}
    try{
      const r=await apiFetch('/api/billing/card/checkout',{method:'POST'});
      if(!r.checkoutUrl)throw new Error('Página de pagamento não disponível.');
      location.href=r.checkoutUrl;
    }catch(err){
      toast(err.code==='BILLING_NOT_CONFIGURED'?'Os pagamentos ainda precisam ser conectados ao Mercado Pago no Cloudflare.':(err.message||'Não foi possível abrir o pagamento por cartão.'));
      if(btn){btn.disabled=false;btn.innerHTML=original||'Pagar com cartão';}
    }
  }
  $('#upgradeBtn').addEventListener('click',openPixCheckout);
  $('#cardCheckoutBtn')?.addEventListener('click',openCardCheckout);
  $('#manageBillingBtn').addEventListener('click',()=>toast('Seu Pro é válido por 30 dias após cada pagamento. Quando vencer, você pode renovar por Pix ou cartão.'));
  $('#pixCloseBtn')?.addEventListener('click',closePixDialog);
  $('#pixDialog')?.addEventListener('click',e=>{if(e.target===$('#pixDialog'))closePixDialog();});
  $('#pixDialog')?.addEventListener('close',()=>{if(pixPollTimer){clearInterval(pixPollTimer);pixPollTimer=null;}});
  $('#pixCopyBtn')?.addEventListener('click',async()=>{
    const code=$('#pixCode').value.trim();if(!code)return;
    try{await navigator.clipboard.writeText(code);toast('Código Pix copiado.');}
    catch{ $('#pixCode').select();document.execCommand('copy');toast('Código Pix copiado.'); }
  });


  function setActivityMenu(open){
    const toggle=$('#activityNavToggle'), submenu=$('#activityNavSubmenu');
    if(!toggle||!submenu)return;
    toggle.setAttribute('aria-expanded',open?'true':'false');
    submenu.hidden=!open;
  }

  function go(view){
    if(!app.user){updateAccessGate();openAuth('login');return;}
    if(['reports','abnt'].includes(view) && !isPro()){ focusUpgrade(view==='reports'?'Relatórios pedagógicos fazem parte do Aulora Pro.':'Acadêmico / ABNT faz parte do Aulora Pro.'); return; }
    if(view==='admin' && !isAdmin()){toast('Esta área é restrita ao administrador.');return;}
    document.body.dataset.view=view;
    $$('.view').forEach(v=>v.classList.toggle('active', v.id===`view-${view}`));
    $$('.nav-item[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
    const activityToggle=$('#activityNavToggle');
    if(activityToggle) activityToggle.classList.toggle('active',view==='activity');
    if(view!=='activity') setActivityMenu(false);
    const meta=titles[view]||titles.dashboard; $('#pageTitle').textContent=meta[0]; $('#pageSubtitle').textContent=meta[1];
    $('#sidebar').classList.remove('open');
    if(view==='materials') renderMaterials();
    if(view==='settings') updateSettingsStats();
    if(view==='admin') loadAdminDashboard();
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
    if(!isPro()){focusUpgrade('Os modelos avançados de educação inclusiva fazem parte do Aulora Pro.');return;}
    const preset=inclusivePresets[btn.dataset.inclusivePreset]; if(!preset)return;
    go('activity');
    Object.entries(preset).forEach(([name,value])=>{const field=activityForm.elements[name];if(field)field.value=value;});
    $$('[data-inclusive-preset]').forEach(b=>b.classList.toggle('active',b===btn));
    saveActivityDraft();
    toast('Modelo inclusivo aplicado. Complete disciplina, turma e tema e ajuste o que precisar.');
    setTimeout(()=>activityForm.elements.topic?.focus(),120);
  }));
  $$('[data-featured-view]').forEach(btn=>btn.addEventListener('click',()=>{
    const view=btn.dataset.featuredView; go(view);
    const form=$(`#${view==='plan'?'planForm':view==='activity'?'activityForm':'examForm'}`); if(!form)return;
    const values={topic:btn.dataset.topic||'',discipline:btn.dataset.discipline||'',grade:btn.dataset.grade||''};
    Object.entries(values).forEach(([name,value])=>{const field=form.elements[name];if(field)field.value=value;});
    if(view==='activity') saveActivityDraft();
    setTimeout(()=>form.elements.topic?.focus(),120);
    toast('Modelo carregado. Ajuste os detalhes e gere quando quiser.');
  }));

  $('#profileShortcut').addEventListener('click',()=>go('settings'));
  const accountMenu=$('#accountMenu');
  $('#accountBtn').addEventListener('click',e=>{e.stopPropagation();const open=accountMenu.hidden;accountMenu.hidden=!open;$('#accountBtn').setAttribute('aria-expanded',String(open));});
  document.addEventListener('click',e=>{if(!$('#accountMenuWrap').contains(e.target)){accountMenu.hidden=true;$('#accountBtn').setAttribute('aria-expanded','false');}});
  accountMenu.addEventListener('click',e=>{const btn=e.target.closest('[data-account-action]');if(!btn)return;const action=btn.dataset.accountAction;accountMenu.hidden=true;$('#accountBtn').setAttribute('aria-expanded','false');if(action==='profile'){go('settings');setTimeout(()=>$('#profileForm')?.scrollIntoView({behavior:'smooth',block:'center'}),80);}if(action==='password')openPasswordDialog();if(action==='email'){if(!isPro())focusUpgrade('Cópias automáticas por e-mail fazem parte do Aulora Pro.');else{go('settings');setTimeout(()=>$('#emailPrefsForm')?.scrollIntoView({behavior:'smooth',block:'center'}),80);}}if(action==='admin')go('admin');if(action==='logout')performLogout();});
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

  const planForm=$('#planForm'), activityForm=$('#activityForm'), examForm=$('#examForm'), reportForm=$('#reportForm'), abntForm=$('#abntForm');
  const savePlanDraft=initDraft(planForm,'plan','#planDraftStatus');
  const saveActivityDraft=initDraft(activityForm,'activity','#activityDraftStatus');
  const saveExamDraft=initDraft(examForm,'exam','#examDraftStatus');
  const saveReportDraft=initDraft(reportForm,'report','#reportDraftStatus');

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
      status.textContent=app.smartOnline?'IA ativa • Banco ativo':'Modo local disponível';
      detail.textContent=app.smartOnline?'Imagens • Relatórios • Sincronização disponíveis':'A geração inteligente está indisponível agora. Os modelos locais continuam funcionando.';
      badge.textContent=app.user?(app.user.plan==='pro'?'Pro':'Básico'):'Login necessário'; badge.className=`smart-badge ${app.smartOnline?'online':'offline'}`;
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
    if(!app.user){openAuth('login');return;}
    const ix=app.materials.findIndex(x=>x.id===material.id);
    const materialLimit=Number(app.usage?.limits?.materials || (isPro()?1000:3));
    if(ix<0 && app.materials.length>=materialLimit){focusUpgrade(`O Plano Básico salva até ${materialLimit} materiais. O Pro libera até 1.000.`);return;}
    material.updatedAt=nowIso(); if(ix>=0)app.materials[ix]=material;else app.materials.unshift(material); persistMaterialCache(); updateStats(); renderMaterials();
    if(app.user){
      try{const result=await apiFetch('/api/materials',{method:'POST',body:{material}});toast(result.emailQueued?'Material salvo na nuvem. Uma cópia atualizada será enviada ao seu e-mail.':'Material salvo e sincronizado na nuvem.');}
      catch(err){
        if(err.code==='MATERIAL_LIMIT'&&ix<0){app.materials=app.materials.filter(m=>m.id!==material.id);persistMaterialCache();updateStats();renderMaterials();focusUpgrade('O limite de materiais do Plano Básico foi atingido.');}
        else toast(`Não foi possível sincronizar o material: ${err.message}`);
      }
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
  function examMark(style){ return style==='square'?'[   ]':style==='plain'?'':'(   )'; }
  function normalizeExamHtml(html,d){
    const wrap=document.createElement('div'); wrap.innerHTML=sanitizeHtml(html||'');
    const firstH1=wrap.querySelector('h1');
    if(firstH1 && /avalia[cç][aã]o|prova/i.test(firstH1.textContent||'')) firstH1.remove();
    if(!wrap.querySelector('.school-head')){
      const head=document.createElement('div');
      head.innerHTML=learningHeader(d,`AVALIAÇÃO — ${d.topic}`,true);
      wrap.prepend(...[...head.childNodes]);
    }
    const mark=examMark(d.optionStyle||'parentheses');
    wrap.querySelectorAll('.question .alternatives').forEach(list=>{
      const items=[...list.children].filter(el=>el.tagName==='LI');
      if(!items.length)return;
      const block=document.createElement('div'); block.className='markable-options';
      items.slice(0,4).forEach((li,idx)=>{
        const row=document.createElement('p');
        const marker=mark?`<span class="answer-mark">${esc(mark)}</span> `:'';
        row.innerHTML=`${marker}<strong>${String.fromCharCode(65+idx)})</strong> ${sanitizeHtml(li.innerHTML)}`;
        block.appendChild(row);
      });
      list.replaceWith(block);
    });
    const lines=Math.max(2,Math.min(8,Number(d.discursiveSpace)||4));
    wrap.querySelectorAll('.question').forEach(q=>{
      if(q.closest('.answer-key'))return;
      const txt=(q.textContent||'').toLocaleLowerCase('pt-BR');
      if(/verdadeiro/.test(txt)&&/falso/.test(txt)){
        if(!q.querySelector('.vf-options')){
          const vf=document.createElement('div'); vf.className='vf-options';
          const m=mark||'(   )';
          vf.innerHTML=`<span>${esc(m)} Verdadeiro</span><span>${esc(m)} Falso</span>`;
          q.appendChild(vf);
        }
        return;
      }
      if(!q.querySelector('.markable-options,.alternatives,.response-line')){
        const area=document.createElement('div'); area.className='discursive-answer'; area.innerHTML=responseLines(lines); q.appendChild(area);
      }
    });
    return sanitizeHtml(wrap.innerHTML);
  }
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
      if(kind==='objective'){const mk=examMark(d.optionStyle||'parentheses');html+=`<div class="markable-options">${['A','B','C','D'].map(l=>`<p>${mk?`<span class="answer-mark">${esc(mk)}</span> `:''}<strong>${l})</strong> Alternativa a ser definida no modelo manual.</p>`).join('')}</div>`;key+=`<p><strong>${i}.</strong> Defina a alternativa correta depois de personalizar a questão.</p>`;}
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

  function previewFor(kind){ return $(`#${kind==='abnt'?'abnt':kind==='report'?'report':kind}Preview`); }

  async function generateSmart(kind,d){
    if(!app.user){
      openAuth('signup');
      toast('Crie sua conta grátis ou entre para gerar materiais com o Aulora.');
      return;
    }
    if(app.user.plan!=='pro' && ['report','abnt'].includes(kind)){
      toast(kind==='report'?'Relatórios pedagógicos com IA fazem parte do Aulora Pro.':'Acadêmico / ABNT com IA faz parte do Aulora Pro.');
      go('settings');
      return;
    }
    if((kind==='activity'||kind==='exam') && app.user.plan!=='pro' && d.imageMode && d.imageMode!=='Sem imagens'){
      toast('Imagens geradas por IA fazem parte do Aulora Pro.');
      go('settings');
      return;
    }
    if((kind==='activity'||kind==='exam') && app.user.plan!=='pro' && Number(d.count||0)>5){
      toast('No Aulora Básico, atividades e avaliações podem ter até 5 questões. O Pro libera até 20.');
      go('settings');
      return;
    }
    showLoading(kind==='plan'?'Criando o plano de aula…':kind==='activity'?'Criando a atividade…':kind==='exam'?'Montando a avaliação…':kind==='report'?'Redigindo o relatório pedagógico…':'Estruturando o trabalho…',(kind==='activity'||kind==='exam') && d.imageMode && d.imageMode!=='Sem imagens' ? 'Gerando conteúdo e figuras. Provas com várias imagens podem levar um pouco mais de tempo.' : 'O Aulora está gerando conteúdo específico para os dados informados.');
    try{
      const payload=await apiFetch('/api/generate',{method:'POST',body:{kind,data:d}});
      if(payload.usage){app.usage=payload.usage;if(app.user)app.user.usage=payload.usage;updateAccountUI();}
      const generatedHtml=kind==='exam'?normalizeExamHtml(payload.html||'',d):(payload.html||'');
      const material=newMaterial(kind,payload.title||`${kind} — ${d.topic||d.title}`,payload.subtitle||'',d,generatedHtml,payload.typeLabel||({plan:'Plano de aula',activity:'Atividade',exam:'Avaliação',report:'Relatório pedagógico',abnt:'Acadêmico / ABNT'}[kind]));
      bindPreview(previewFor(kind),material); toast(payload.emailQueued?'Material gerado. Uma cópia está sendo enviada ao seu e-mail.':'Material gerado. Revise, edite e salve quando estiver pronto.');
    }catch(err){
      if(err.code==='AI_LIMIT'){
        toast('Seu limite mensal de gerações foi atingido. Conheça o Aulora Pro para continuar criando.');
        go('settings');
      } else if(err.code==='PRO_REQUIRED' || err.code==='QUESTION_LIMIT'){
        toast(err.message||'Este recurso faz parte do Aulora Pro.');
        go('settings');
      } else if(err.status===401 || err.code==='AUTH_REQUIRED'){
        app.user=null; updateAccountUI(); openAuth('login'); toast('Sua sessão expirou. Entre novamente para gerar.');
      } else if(err.code==='IMAGE_GENERATION_FAILED'){
        toast(err.message||'Não foi possível gerar as figuras solicitadas. Tente novamente.');
      } else if(kind==='report' || err.code==='REPORT_GENERATION_FAILED'){
        toast(err.message||'Não foi possível concluir o relatório pedagógico agora. O rascunho foi preservado. Tente novamente em alguns segundos.');
      } else {
        toast(err.message||'Não foi possível gerar o material agora. Tente novamente.');
      }
      console.warn(err);checkSmartStatus();
    }finally{hideLoading();}
  }

  planForm.addEventListener('submit',e=>{e.preventDefault();savePlanDraft();generateSmart('plan',formData(e.currentTarget));});
  activityForm.addEventListener('submit',e=>{e.preventDefault();saveActivityDraft();generateSmart('activity',formData(e.currentTarget));});
  examForm.addEventListener('submit',e=>{e.preventDefault();saveExamDraft();generateSmart('exam',formData(e.currentTarget));});
  reportForm.addEventListener('submit',e=>{e.preventDefault();saveReportDraft();generateSmart('report',formData(e.currentTarget));});
  abntForm.addEventListener('submit',e=>{e.preventDefault();generateSmart('abnt',formData(e.currentTarget));});
  $$('[data-local]').forEach(btn=>btn.addEventListener('click',()=>{
    const kind=btn.dataset.local,form={plan:planForm,activity:activityForm,exam:examForm,report:reportForm,abnt:abntForm}[kind];
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
  function typeIcon(type){return({plan:'▤',activity:'✎',exam:'✓',report:'📋',abnt:'¶',reference:'§'})[type]||'▣';}
  function renderMaterials(){
    const q=$('#materialsSearch').value.trim().toLowerCase(),filter=$('#materialsFilter').value;
    const list=app.materials.filter(m=>(filter==='all'||m.type===filter)&&`${m.title} ${m.subtitle||''} ${m.typeLabel||''}`.toLowerCase().includes(q)); const el=$('#materialsList');
    if(!list.length){el.innerHTML=`<div class="library-empty"><strong>${app.materials.length?'Nenhum material encontrado.':'Sua biblioteca ainda está vazia.'}</strong><p>${app.materials.length?'Tente alterar a busca ou o filtro.':'Crie um plano, atividade, avaliação, relatório ou material acadêmico e salve aqui.'}</p></div>`;return;}
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
    if(!material)return;
    if(!isPro()){focusUpgrade('Exportação para Word faz parte do Aulora Pro.');return;}
    const isAbnt=material.type==='abnt';const style=isAbnt?`@page{size:A4;margin:3cm 2cm 2cm 3cm}body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;text-align:justify}`:`@page{size:A4;margin:2cm}body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.4}`;
    const content=`<!doctype html><html><head><meta charset="UTF-8"><style>${style}h1{text-align:center;font-size:14pt}h2{font-size:12pt;margin-top:18pt}.meta{padding:8pt;background:#f4f4f4}.answer-key{page-break-before:always}.cover{min-height:22cm;text-align:center;display:flex;flex-direction:column;justify-content:space-between}.question{margin:12pt 0}.markable-options p{margin:7pt 0}.answer-mark{display:inline-block;min-width:28pt;font-family:monospace;font-weight:bold}.vf-options{display:flex;gap:28pt;margin:10pt 0}.generated-figure{margin:12pt auto;text-align:center;page-break-inside:avoid}.generated-figure img{max-width:100%;max-height:11cm;object-fit:contain}.generated-figure figcaption{font-size:9pt;color:#666}.response-line{height:22pt;border-bottom:1px solid #bbb}.markable-options p{margin:7pt 0}.answer-mark{display:inline-block;min-width:28pt;font-family:monospace;font-weight:bold}.vf-options{display:flex;gap:28pt;margin:10pt 0}</style></head><body>${sanitizeHtml(htmlOverride??material.html)}</body></html>`;
    downloadBlob(`${slug(material.title)}${suffix?'-'+suffix:''}.doc`,'\ufeff'+content,'application/msword');toast('Arquivo para Word gerado.');
  }
  function printMaterial(material,htmlOverride=null){
    if(!material)return;
    if(!isPro()){focusUpgrade('Exportação e impressão em PDF fazem parte do Aulora Pro.');return;}
    const w=window.open('','_blank');if(!w){toast('Permita pop-ups para imprimir.');return;}const isAbnt=material.type==='abnt';w.document.write(`<!doctype html><html><head><title>${esc(material.title)}</title><style>@page{size:A4;margin:${isAbnt?'3cm 2cm 2cm 3cm':'2cm'}}body{font-family:${isAbnt?"'Times New Roman',serif":"Arial,sans-serif"};font-size:${isAbnt?'12pt':'11pt'};line-height:${isAbnt?'1.5':'1.4'};color:#111}h1{text-align:center;font-size:15pt}h2{font-size:12pt;margin-top:18pt}.meta{padding:8pt;background:#f4f4f4}.answer-key{page-break-before:always}.cover{height:22cm;text-align:center;display:flex;flex-direction:column;justify-content:space-between}.response-line{height:22pt;border-bottom:1px solid #bbb}.markable-options p{margin:7pt 0}.answer-mark{display:inline-block;min-width:28pt;font-family:monospace;font-weight:bold}.vf-options{display:flex;gap:28pt;margin:10pt 0}.question{page-break-inside:avoid}</style></head><body>${sanitizeHtml(htmlOverride??material.html)}</body></html>`);w.document.close();w.focus();setTimeout(()=>w.print(),300);
  }

  function makeBackup(){return {format:'aulora-backup',createdAt:nowIso(),profile:app.profile,materials:app.materials};}
  function exportBackup(){downloadBlob(`aulora-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(makeBackup(),null,2),'application/json');toast('Backup baixado.');}
  $('#exportBackupBtn').onclick=exportBackup;$('#settingsExportBtn').onclick=exportBackup;
  $('#importBackupInput').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(data.format!=='aulora-backup'||!Array.isArray(data.materials))throw new Error();if(!confirm(`Importar ${data.materials.length} materiais? Os materiais atuais serão mantidos e os novos serão adicionados.`))return;const ids=new Set(app.materials.map(x=>x.id));data.materials.forEach(m=>{if(!ids.has(m.id))app.materials.push(m)});if(data.profile&&confirm('Também importar o perfil salvo no backup?'))app.profile={...app.profile,...data.profile};persistProfileCache();persist();applyProfile();renderMaterials();toast(app.user?'Backup importado neste dispositivo. Salve/duplique materiais para sincronizá-los individualmente.':'Backup importado.');}catch{toast('Arquivo de backup inválido.');}finally{e.target.value='';}
  });
  $('#resetAppBtn').onclick=()=>{if(confirm('Apagar cache local, perfil local e rascunhos deste dispositivo? Materiais já sincronizados na nuvem não serão excluídos.')){Object.keys(localStorage).filter(k=>k.startsWith('aulora.')).forEach(k=>localStorage.removeItem(k));app.materials=[];app.profile={...DEFAULT_PROFILE};location.reload();}};

  const STATE_NAMES={AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',SP:'São Paulo',SE:'Sergipe',TO:'Tocantins'};
  function setStat(id,value){const el=$(id);if(el)el.textContent=value;}
  function currentState(){
    const selected=$$('[data-state-select]').map(s=>s.value).find(Boolean);
    return selected||localStorage.getItem('aulora.lastState')||'';
  }
  function relativeMaterialTime(value){
    if(!value)return '';
    const diff=Date.now()-new Date(value).getTime(); if(!Number.isFinite(diff))return '';
    const mins=Math.max(0,Math.floor(diff/60000)); if(mins<60)return mins<2?'agora':`há ${mins} min`;
    const hours=Math.floor(mins/60); if(hours<24)return `há ${hours}h`;
    const days=Math.floor(hours/24); if(days<7)return `há ${days}d`;
    return formatDateBR(String(value).slice(0,10));
  }
  function renderDashboardRecent(){
    const host=$('#dashboardRecentList'); if(!host)return;
    const recent=app.materials.slice().sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||''))).slice(0,3);
    if(!recent.length){host.innerHTML='<div class="dashboard-empty reference-empty"><span>✦</span><div><strong>Sua biblioteca começa aqui</strong><small>Crie seu primeiro material para ele aparecer neste painel.</small></div></div>';return;}
    const iconFor={plan:'▤',activity:'✎',exam:'✓',report:'▥',abnt:'¶',reference:'¶'};
    const classFor={plan:'plan',activity:'activity',exam:'exam',report:'report',abnt:'abnt',reference:'abnt'};
    host.innerHTML=recent.map(m=>{const type=classFor[m.type]||'material';const when=relativeMaterialTime(m.updatedAt||m.createdAt);return `<button type="button" class="reference-recent-card recent-${type}" data-dashboard-open="${esc(m.id)}"><span class="recent-icon">${iconFor[m.type]||'▣'}</span><span class="recent-main"><strong>${esc(m.title)}</strong><small>${esc(m.subtitle||m.typeLabel||'Material')}</small></span><span class="recent-pill">${esc(m.typeLabel||'Material')}</span><time>${esc(when)}</time><b>⋮</b></button>`}).join('');
    $$('[data-dashboard-open]',host).forEach(btn=>btn.onclick=()=>openMaterial(btn.dataset.dashboardOpen));
  }
  function updateStats(){
    const exams=app.materials.filter(m=>m.type==='exam').length;
    setStat('#statMaterials',app.materials.length);setStat('#statPlans',app.materials.filter(m=>m.type==='plan').length);setStat('#statActivities',app.materials.filter(m=>m.type==='activity').length);setStat('#statExams',exams);setStat('#statReports',app.materials.filter(m=>m.type==='report').length);setStat('#statAbnt',app.materials.filter(m=>['abnt','reference'].includes(m.type)).length);
    const used=Number(app.usage?.ai||0), limit=Number(app.usage?.limits?.ai||0); setStat('#statAiUsed',used); if($('#statAiLimit')) $('#statAiLimit').textContent=app.user&&limit?`de ${limit} disponíveis`:'Entre para acompanhar'; if($('#statAiProgress')) $('#statAiProgress').style.width=limit?`${Math.min(100,(used/limit)*100)}%`:'0%';
    const uf=currentState(); setStat('#statStateCount',uf?1:0); if($('#statStateName')) $('#statStateName').textContent=uf?(STATE_NAMES[uf]||uf):'Não informado';
    renderDashboardRecent();updateSettingsStats();
  }
  function updateSettingsStats(){
    if(!$('#settingsMaterialCount'))return;$('#settingsMaterialCount').textContent=app.materials.length;let bytes=0;try{bytes=new Blob([localStorage.getItem(materialCacheKey())||'']).size;}catch{}$('#settingsStorageSize').textContent=bytes<1024?`${bytes} B`:`${(bytes/1024).toFixed(1)} KB`;if($('#settingsCloudCount'))$('#settingsCloudCount').textContent=app.user?String(app.materials.length):'—';
  }

  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();app.deferredInstall=e;$('#installBtn').hidden=false;});
  $('#installBtn').addEventListener('click',async()=>{if(!app.deferredInstall)return;app.deferredInstall.prompt();await app.deferredInstall.userChoice;app.deferredInstall=null;$('#installBtn').hidden=true;});
  if('serviceWorker' in navigator && location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));

  function moneyBRL(cents){ return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100); }
  async function loadAdminDashboard(){
    if(!isAdmin())return;
    const list=$('#adminUsersList');
    if(list)list.innerHTML='<div class="library-empty"><strong>Carregando usuários…</strong></div>';
    try{
      const [stats,users]=await Promise.all([apiFetch('/api/admin/stats',{cache:'no-store'}),loadAdminUsers(false)]);
      $('#adminStatUsers').textContent=String(stats.users||0);
      $('#adminStatPro').textContent=String(stats.pro||0);
      $('#adminStatMaterials').textContent=String(stats.materials||0);
      $('#adminStatRevenue').textContent=moneyBRL(stats.revenueCents||0);
      return users;
    }catch(err){if(list)list.innerHTML=`<div class="library-empty"><strong>Não foi possível carregar o painel.</strong><p>${esc(err.message||'Erro')}</p></div>`;}
  }
  async function loadAdminUsers(showToast=false){
    if(!isAdmin())return;
    const q=$('#adminUserSearch')?.value?.trim()||'';
    const data=await apiFetch(`/api/admin/users${q?`?q=${encodeURIComponent(q)}`:''}`,{cache:'no-store'});
    const users=Array.isArray(data.users)?data.users:[]; const list=$('#adminUsersList'); if(!list)return users;
    if(!users.length){list.innerHTML='<div class="library-empty"><strong>Nenhum usuário encontrado.</strong></div>';return users;}
    list.innerHTML=users.map(u=>{
      const pro=u.plan==='pro', adminUser=Boolean(u.isAdmin); const expiry=u.proExpiresAt?new Date(u.proExpiresAt).toLocaleDateString('pt-BR'):'';
      const planLabel=adminUser?'ADMIN':pro?'PRO':'BÁSICO';
      const planSub=adminUser?'acesso completo':pro&&expiry?'até '+expiry:'gratuito';
      return `<article class="admin-user-row" data-admin-user="${esc(u.id)}"><div class="admin-user-avatar">${esc(String(u.name||u.email||'A').trim().charAt(0).toUpperCase())}</div><div class="admin-user-main"><strong>${esc(formatDisplayName(u.name)||u.email)}</strong><small>${esc(u.email)}${adminUser?' • ADMIN':''}</small><span>Criado em ${u.createdAt?esc(new Date(u.createdAt).toLocaleDateString('pt-BR')):'—'}</span></div><div class="admin-user-plan"><b class="${pro||adminUser?'pro':''}">${planLabel}</b><small>${esc(planSub)}</small></div><div class="admin-user-actions"><button class="mini-button" data-admin-pro="${esc(u.id)}">+30 dias Pro</button><button class="mini-button danger-text" data-admin-basic="${esc(u.id)}">Definir Básico</button></div></article>`;
    }).join('');
    $$('[data-admin-pro]',list).forEach(b=>b.onclick=()=>setAdminPlan(b.dataset.adminPro,'pro'));
    $$('[data-admin-basic]',list).forEach(b=>b.onclick=()=>setAdminPlan(b.dataset.adminBasic,'free'));
    if(showToast)toast(`${users.length} conta(s) carregada(s).`); return users;
  }
  async function setAdminPlan(userId,plan){
    if(!isAdmin())return;
    const label=plan==='pro'?'adicionar 30 dias de Pro':'alterar para Básico';
    if(!confirm(`Deseja ${label} nesta conta?`))return;
    try{await apiFetch('/api/admin/user-plan',{method:'POST',body:{userId,plan,days:30}});toast(plan==='pro'?'Pro atualizado por 30 dias.':'Conta alterada para Básico.');await loadAdminDashboard();}
    catch(err){toast(err.message||'Não foi possível alterar o plano.');}
  }
  $('#adminRefreshBtn')?.addEventListener('click',()=>loadAdminDashboard());
  $('#adminUserSearchBtn')?.addEventListener('click',()=>loadAdminUsers(true));
  $('#adminUserSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();loadAdminUsers(true);}});

  // Henry Ribeiro — assistente educacional com IA do Aulora.
  const henryHelpPanel=$('#henryHelpPanel');
  const henryHelpToggle=$('#henryHelpToggle');
  const henryChat=$('#henryChat');
  const henryChatForm=$('#henryChatForm');
  const henryChatInput=$('#henryChatInput');
  const henryChatSend=$('#henryChatSend');
  const henryChatHistory=[];
  function henryGreeting(){
    const h=new Date().getHours();
    return h<12?'Olá, bom dia!':h<18?'Olá, boa tarde!':'Olá, boa noite!';
  }
  function setHenryGreeting(){
    const text=henryGreeting();
    if($('#henryGreeting')) $('#henryGreeting').textContent=text;
    if($('#henryPanelGreeting')) $('#henryPanelGreeting').textContent=text;
  }
  function setHenryHelp(open){
    if(!henryHelpPanel||!henryHelpToggle)return;
    henryHelpPanel.hidden=!open;
    henryHelpToggle.setAttribute('aria-expanded',String(open));
    if(open)setTimeout(()=>henryChatInput?.focus(),80);
  }
  function appendHenryMessage(role,text,{pending=false}={}){
    if(!henryChat)return null;
    const row=document.createElement('div');
    row.className=`henry-chat-message ${role}${pending?' pending':''}`;
    const avatar=document.createElement('span');
    avatar.className='henry-chat-avatar';
    avatar.textContent=role==='assistant'?'H':'Você';
    const bubble=document.createElement('div');
    const p=document.createElement('p');
    p.textContent=String(text||'');
    bubble.appendChild(p); row.append(avatar,bubble); henryChat.appendChild(row);
    henryChat.scrollTop=henryChat.scrollHeight;
    return row;
  }
  function setHenryChatBusy(busy){
    if(henryChatInput)henryChatInput.disabled=busy;
    if(henryChatSend){henryChatSend.disabled=busy;henryChatSend.textContent=busy?'…':'➤';}
  }
  async function askHenry(message){
    if(!app.user){
      appendHenryMessage('assistant','Para conversar comigo pela IA, entre na sua conta do Aulora. A conversa usa a IA configurada no seu aplicativo.');
      setTimeout(()=>openAuth('login'),250); return;
    }
    const clean=String(message||'').trim().slice(0,1600); if(!clean)return;
    appendHenryMessage('user',clean);
    const recent=henryChatHistory.slice(-8);
    henryChatHistory.push({role:'user',content:clean});
    const pending=appendHenryMessage('assistant','Pensando…',{pending:true});
    setHenryChatBusy(true);
    try{
      const result=await apiFetch('/api/assistant',{method:'POST',body:{message:clean,history:recent}});
      pending?.remove();
      const reply=String(result.reply||'Não consegui formular uma resposta agora. Tente novamente.').trim();
      appendHenryMessage('assistant',reply);
      henryChatHistory.push({role:'assistant',content:reply});
      if(henryChatHistory.length>16)henryChatHistory.splice(0,henryChatHistory.length-16);
    }catch(err){
      pending?.remove();
      if(err.code==='AUTH_REQUIRED'){
        appendHenryMessage('assistant','Sua sessão expirou. Entre novamente para continuar conversando comigo.');
        setTimeout(()=>openAuth('login'),250);
      }else if(err.code==='PRO_REQUIRED'){
        appendHenryMessage('assistant','A conversa com Henry IA faz parte do Plano Pro. No Básico, use os módulos de teste; no Pro eu posso ajudar diretamente por aqui.');
        setTimeout(()=>focusUpgrade('Henry IA faz parte do Aulora Pro.'),500);
      }else appendHenryMessage('assistant',err.message||'A IA do Henry está indisponível agora. Tente novamente em alguns instantes.');
    }finally{setHenryChatBusy(false);setTimeout(()=>henryChatInput?.focus(),30);}
  }
  setHenryGreeting();
  henryHelpToggle?.addEventListener('click',e=>{e.stopPropagation();setHenryHelp(henryHelpPanel?.hidden!==false);});
  $('#henryHelpClose')?.addEventListener('click',e=>{e.stopPropagation();setHenryHelp(false);});
  $('#heroHelpBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();setHenryHelp(true);});
  henryChatForm?.addEventListener('submit',e=>{e.preventDefault();const value=henryChatInput?.value||'';if(!value.trim())return;if(henryChatInput)henryChatInput.value='';askHenry(value);});
  henryChatInput?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();henryChatForm?.requestSubmit();}});
  $$('#henryHelp [data-help-go]').forEach(btn=>btn.addEventListener('click',()=>{go(btn.dataset.helpGo);setHenryHelp(false);}));
  document.addEventListener('click',e=>{if($('#henryHelp')&&!$('#henryHelp').contains(e.target)&&e.target!==$('#heroHelpBtn'))setHenryHelp(false);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')setHenryHelp(false);});

  document.body.dataset.view='dashboard';

  const billingParams=new URLSearchParams(location.search);
  const billingState=billingParams.get('billing');
  const returnedPaymentId=billingParams.get('payment_id')||billingParams.get('collection_id')||'';
  if(billingState){
    const cleanUrl=location.pathname+location.hash;
    history.replaceState({},'',cleanUrl);
    setTimeout(()=>toast(billingState==='success'?'Pagamento concluído. Confirmando seu Aulora Pro…':billingState==='pending'?'Pagamento pendente. Assim que for aprovado, o Pro será ativado.':'Pagamento não concluído.'),300);
  }
  async function verifyReturnedCard(){
    if(billingState!=='success'||!returnedPaymentId||!app.user)return;
    try{
      const r=await apiFetch(`/api/billing/card/status?id=${encodeURIComponent(returnedPaymentId)}`,{cache:'no-store'});
      if(r.user)applyUser(r.user);
      if(r.approved)toast('Pagamento aprovado! Seu Aulora Pro está ativo. ✨');
      else toast('Pagamento recebido e ainda em processamento.');
    }catch(err){console.warn('Card return verification',err);setTimeout(()=>loadAccount(),1800);}
  }
  applyProfile();updateStats();renderMaterials();
  loadStatesAndMunicipalities();
  Promise.allSettled([checkSmartStatus(),loadAccount()]).then(()=>{verifyReturnedCard();if(billingState==='success')setTimeout(()=>loadAccount(),2200);});
})();
