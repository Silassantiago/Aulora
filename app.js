(() => {
  const STORAGE_KEY = 'aulora.materials.v1';
  const app = {
    materials: loadMaterials(),
    currentMaterial: null,
    deferredInstall: null
  };

  const titles = {
    dashboard:['Início','Sua central de preparação pedagógica'],
    plan:['Plano de aula','Planejamento pedagógico'],
    activity:['Atividade','Exercícios e práticas'],
    exam:['Avaliação','Provas e gabaritos'],
    abnt:['Acadêmico / ABNT','Estrutura e verificação acadêmica'],
    materials:['Meus materiais','Sua biblioteca local']
  };

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const esc = (str='') => String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const nowBR = () => new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date());
  const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function loadMaterials(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }
  function persist(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(app.materials)); updateStats(); }
  function toast(message){ const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),2300); }
  function formData(form){ return Object.fromEntries(new FormData(form).entries()); }
  function slug(text){ return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60) || 'material-aulora'; }

  function go(view){
    $$('.view').forEach(v=>v.classList.toggle('active', v.id===`view-${view}`));
    $$('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
    $('#pageTitle').textContent=titles[view][0]; $('#pageSubtitle').textContent=titles[view][1];
    $('#sidebar').classList.remove('open');
    if(view==='materials') renderMaterials();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  $$('.nav-item').forEach(b=>b.addEventListener('click',()=>go(b.dataset.view)));
  $$('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
  $('#menuBtn').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
  document.addEventListener('click',e=>{ if(innerWidth<=760 && $('#sidebar').classList.contains('open') && !e.target.closest('#sidebar') && !e.target.closest('#menuBtn')) $('#sidebar').classList.remove('open'); });

  $$('.tab').forEach(tab=>tab.addEventListener('click',()=>{
    $$('.tab').forEach(t=>t.classList.remove('active')); tab.classList.add('active');
    $$('.tab-panel').forEach(p=>p.classList.toggle('active',p.id===tab.dataset.tab));
  }));

  function previewShell(material){
    return `<div class="preview-header"><div><span class="eyebrow">PRÉVIA</span><h3>${esc(material.title)}</h3></div><div class="preview-actions"><button class="mini-button" data-action="doc">Word</button><button class="mini-button" data-action="print">PDF</button><button class="mini-button primary" data-action="save">Salvar</button></div></div><div class="document ${material.type==='abnt'?'abnt-doc':''}">${material.html}</div>`;
  }

  function bindPreview(preview, material){
    preview.classList.remove('empty'); preview.innerHTML=previewShell(material);
    $('[data-action="save"]',preview).onclick=()=>saveMaterial(material);
    $('[data-action="doc"]',preview).onclick=()=>exportDoc(material);
    $('[data-action="print"]',preview).onclick=()=>printMaterial(material);
  }

  function saveMaterial(material){
    const existing=app.materials.findIndex(m=>m.id===material.id);
    material.updatedAt=new Date().toISOString();
    if(existing>=0) app.materials[existing]=material; else app.materials.unshift(material);
    persist(); toast('Material salvo na biblioteca.');
  }

  function baseMeta(d){ return `<div class="meta"><strong>Disciplina:</strong> ${esc(d.discipline)} &nbsp; | &nbsp; <strong>Turma:</strong> ${esc(d.grade)}</div>`; }

  $('#planForm').addEventListener('submit',e=>{
    e.preventDefault(); const d=formData(e.currentTarget);
    const obj=d.objective || `Compreender os conceitos centrais relacionados a ${d.topic} e aplicá-los em situações adequadas ao nível da turma.`;
    const bncc=d.bncc?`<p><strong>Habilidade / referência BNCC informada:</strong> ${esc(d.bncc)}</p>`:'';
    const notes=d.notes?`<p><strong>Observações da turma:</strong> ${esc(d.notes)}</p>`:'';
    const html=`<h1>PLANO DE AULA — ${esc(d.topic)}</h1>${baseMeta(d)}<p><strong>Duração:</strong> ${esc(d.duration)} &nbsp; | &nbsp; <strong>Modalidade:</strong> ${esc(d.modality)}</p>${bncc}<h2>1. Objetivo</h2><p>${esc(obj)}</p><h2>2. Objetivos específicos</h2><ul><li>Identificar os principais conceitos de ${esc(d.topic)}.</li><li>Relacionar o conteúdo com exemplos do cotidiano.</li><li>Participar de atividade de consolidação e demonstrar compreensão do tema.</li></ul><h2>3. Conteúdos</h2><p>Conceitos essenciais, aplicações e exemplos relacionados a ${esc(d.topic)}.</p><h2>4. Metodologia</h2><ol><li><strong>Acolhida e sondagem:</strong> retomada breve dos conhecimentos prévios.</li><li><strong>Desenvolvimento:</strong> exposição dialogada com exemplos e perguntas orientadoras.</li><li><strong>Prática:</strong> atividade individual ou em pequenos grupos.</li><li><strong>Fechamento:</strong> síntese coletiva e registro dos pontos principais.</li></ol><h2>5. Recursos</h2><p>Quadro, material didático, recursos visuais e/ou digitais disponíveis na escola.</p><h2>6. Avaliação</h2><p>Avaliação formativa por participação, realização da atividade e capacidade de explicar os conceitos trabalhados.</p><h2>7. Encaminhamento / continuidade</h2><p>Retomar dificuldades identificadas e propor atividade complementar quando necessário.</p>${notes}`;
    const material={id:uid(),type:'plan',typeLabel:'Plano de aula',title:`${d.topic} — ${d.grade}`,subtitle:`${d.discipline} • ${d.duration}`,createdAt:new Date().toISOString(),data:d,html};
    bindPreview($('#planPreview'),material);
  });

  function questionText(topic, i, kind, difficulty){
    const prompts={
      objective:[`Qual alternativa melhor representa um conceito fundamental de ${topic}?`,`Assinale a opção correta sobre ${topic}.`,`Em uma situação relacionada a ${topic}, qual interpretação é mais adequada?`],
      discursive:[`Explique, com suas palavras, um aspecto importante de ${topic}.`,`Relacione ${topic} a uma situação do cotidiano e justifique sua resposta.`,`Apresente dois pontos relevantes sobre ${topic} e explique a relação entre eles.`],
      tf:[`Analise a afirmação sobre ${topic} e indique se é verdadeira ou falsa, justificando brevemente.`]
    };
    const arr=prompts[kind]; return `${arr[(i-1)%arr.length]} <em>(${difficulty})</em>`;
  }

  function makeQuestions(d, isExam=false){
    const n=Number(d.count); let out=''; let key=[];
    for(let i=1;i<=n;i++){
      let kind='objective';
      if(d.format.includes('discurs') || d.format==='Discursivas') kind='discursive';
      if(d.format==='Mista') kind=i%3===0?'discursive':'objective';
      if(d.format==='Verdadeiro ou falso') kind='tf';
      if(isExam){ if(d.format.startsWith('70%')) kind=i>Math.ceil(n*.7)?'discursive':'objective'; else if(d.format.startsWith('50%')) kind=i>Math.ceil(n*.5)?'discursive':'objective'; else if(d.format==='Somente discursivas') kind='discursive'; }
      out+=`<div class="question"><strong>${i}.</strong> ${questionText(esc(d.topic),i,kind,esc(d.difficulty))}`;
      if(kind==='objective') out+=`<ol type="A"><li>Alternativa relacionada ao conceito A.</li><li>Alternativa relacionada ao conceito B.</li><li>Alternativa relacionada ao conceito C.</li><li>Alternativa relacionada ao conceito D.</li></ol>`;
      else out+=`<p>________________________________________________________________________________</p><p>________________________________________________________________________________</p>`;
      out+='</div>';
      key.push(kind==='objective'?`${i}. Revisar alternativa correta após personalização do conteúdo.`:`${i}. Resposta esperada: domínio conceitual, coerência e relação com o tema.`);
    }
    return {questions:out,key};
  }

  $('#activityForm').addEventListener('submit',e=>{
    e.preventDefault(); const d=formData(e.currentTarget); const q=makeQuestions(d,false);
    const html=`<h1>ATIVIDADE — ${esc(d.topic)}</h1>${baseMeta(d)}<p><strong>Nível:</strong> ${esc(d.difficulty)} &nbsp; | &nbsp; <strong>Formato:</strong> ${esc(d.format)}</p><p><strong>Orientação:</strong> leia com atenção e responda às questões com base no conteúdo estudado.</p>${q.questions}${d.notes?`<h2>Orientações do professor</h2><p>${esc(d.notes)}</p>`:''}<div class="answer-key"><h2>Gabarito / critérios</h2><ol>${q.key.map(k=>`<li>${k}</li>`).join('')}</ol><p><small>Observação: nesta base sem conexão com um motor de conteúdo, as alternativas devem ser personalizadas/revisadas antes da aplicação. A estrutura já está pronta para receber o gerador inteligente do servidor.</small></p></div>`;
    const material={id:uid(),type:'activity',typeLabel:'Atividade',title:`Atividade — ${d.topic}`,subtitle:`${d.discipline} • ${d.grade}`,createdAt:new Date().toISOString(),data:d,html}; bindPreview($('#activityPreview'),material);
  });

  $('#examForm').addEventListener('submit',e=>{
    e.preventDefault(); const d=formData(e.currentTarget); const q=makeQuestions(d,true);
    const html=`<h1>AVALIAÇÃO — ${esc(d.topic)}</h1>${baseMeta(d)}<p><strong>Nome:</strong> ____________________________________________ &nbsp; <strong>Data:</strong> ____/____/______</p><p><strong>Orientações:</strong> leia cada questão com atenção. Responda de forma legível e justifique quando solicitado.</p>${q.questions}${d.notes?`<p><strong>Critérios adicionais:</strong> ${esc(d.notes)}</p>`:''}<div class="answer-key"><h2>Gabarito / critérios de correção</h2><ol>${q.key.map(k=>`<li>${k}</li>`).join('')}</ol><p><small>Base estrutural. Antes de aplicar a avaliação, revise o conteúdo e defina as alternativas/respostas específicas no gerador conectado.</small></p></div>`;
    const material={id:uid(),type:'exam',typeLabel:'Avaliação',title:`Avaliação — ${d.topic}`,subtitle:`${d.discipline} • ${d.grade}`,createdAt:new Date().toISOString(),data:d,html}; bindPreview($('#examPreview'),material);
  });

  $('#abntForm [name="year"]').value=new Date().getFullYear();
  $('#abntForm').addEventListener('submit',e=>{
    e.preventDefault(); const d=formData(e.currentTarget);
    const theme=d.theme || 'Apresente aqui a delimitação do tema e o problema central do trabalho.';
    const objective=d.objective || 'Defina aqui o objetivo geral, utilizando um verbo no infinitivo e delimitando o resultado pretendido.';
    const html=`<div class="cover"><div><strong>${esc(d.institution || 'INSTITUIÇÃO')}</strong><br>${esc(d.course || '')}</div><div><strong>${esc(d.author)}</strong></div><div><strong>${esc(d.title).toUpperCase()}</strong></div><div>${esc(d.city || 'CIDADE')}<br>${esc(d.year || '')}</div></div><h2>RESUMO</h2><p>Apresente de forma concisa o objetivo, o método, os principais resultados e a conclusão do trabalho. Revise o limite de palavras exigido pela instituição.</p><p><strong>Palavras-chave:</strong> ${esc(d.keywords || 'palavra-chave 1; palavra-chave 2; palavra-chave 3')}.</p><h2>1 INTRODUÇÃO</h2><p>${esc(theme)} Contextualize o tema, apresente o problema, a justificativa e a organização do trabalho.</p><h3>1.1 Objetivo geral</h3><p>${esc(objective)}</p><h3>1.2 Objetivos específicos</h3><ul><li>Definir o primeiro objetivo específico.</li><li>Descrever o segundo objetivo específico.</li><li>Analisar ou comparar o terceiro objetivo específico.</li></ul><h2>2 REFERENCIAL TEÓRICO</h2><p>Organize a discussão teórica em subseções coerentes. Toda ideia, dado ou formulação proveniente de outra fonte deve ser citada adequadamente.</p><h2>3 METODOLOGIA</h2><p>Descreva o tipo de pesquisa, procedimentos, fontes, participantes/amostra quando aplicável e forma de análise.</p><h2>4 RESULTADOS E DISCUSSÃO</h2><p>Apresente os achados e discuta-os à luz do referencial teórico.</p><h2>5 CONSIDERAÇÕES FINAIS</h2><p>Retome o objetivo, sintetize os resultados, registre limitações e possíveis encaminhamentos.</p><h2>REFERÊNCIAS</h2><p>Insira somente as obras efetivamente citadas no texto e padronize cada referência conforme a natureza da fonte.</p><div class="abnt-note"><strong>Checklist do Aulora:</strong> papel A4; margens acadêmicas usuais; fonte legível; espaçamento e recuos conforme o tipo de elemento; seções numeradas de forma progressiva; citações e referências consistentes. O manual da instituição pode complementar ou restringir essas regras.</div>`;
    const material={id:uid(),type:'abnt',typeLabel:'Acadêmico / ABNT',title:d.title,subtitle:`${d.workType} • ${d.author}`,createdAt:new Date().toISOString(),data:d,html}; bindPreview($('#abntPreview'),material);
  });

  $('#checkAbntBtn').addEventListener('click',()=>{
    const text=$('#abntCheckText').value.trim(); if(text.length<80){toast('Cole um texto maior para realizar a verificação.');return;}
    const upper=text.toUpperCase(); const checks=[
      ['Introdução identificada',/\bINTRODU[CÇ][AÃ]O\b/i.test(text),'Inclua uma seção de introdução claramente identificada.'],
      ['Conclusão ou considerações finais',/\b(CONCLUS[AÃ]O|CONSIDERA[CÇ][OÕ]ES FINAIS)\b/i.test(text),'Inclua a seção final do trabalho.'],
      ['Referências identificadas',/\bREFER[EÊ]NCIAS\b/i.test(text),'Inclua a lista de referências ao final.'],
      ['Indícios de citações no sistema autor-data',/\([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s.-]+,\s*\d{4}/.test(text),'Não foram encontrados sinais claros de citações autor-data. Verifique se as fontes utilizadas estão citadas.'],
      ['Estrutura mínima do texto',text.length>1200,'O texto está curto para uma análise estrutural mais confiável.'],
      ['Títulos/seções numeradas',/(^|\n)\s*1\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/m.test(upper),'Não foram detectadas seções numeradas. Confirme a exigência da instituição.']
    ];
    const ok=checks.filter(c=>c[1]).length; const score=Math.round(ok/checks.length*100);
    $('#abntCheckResults').innerHTML=`<div class="check-score"><div class="score-circle">${score}%</div><div><span class="eyebrow">VERIFICAÇÃO INICIAL</span><h3>${score>=80?'Estrutura bem encaminhada':score>=50?'Há pontos para revisar':'Revisão recomendada'}</h3><small>Esta análise não substitui conferência visual de margens, fonte, paginação e manual institucional.</small></div></div>${checks.map(c=>`<div class="check-item ${c[1]?'ok':'warn'}"><div class="status">${c[1]?'✓':'!'}</div><div><strong>${c[0]}</strong><small>${c[1]?'Item identificado no texto.':c[2]}</small></div></div>`).join('')}`;
  });

  function typeIcon(type){ return ({plan:'▤',activity:'✎',exam:'✓',abnt:'¶'})[type] || '▣'; }
  function renderMaterials(){
    const q=$('#materialsSearch').value.trim().toLowerCase(); const filter=$('#materialsFilter').value;
    const list=app.materials.filter(m=>(filter==='all'||m.type===filter) && `${m.title} ${m.subtitle}`.toLowerCase().includes(q));
    const el=$('#materialsList');
    if(!list.length){el.innerHTML=`<div class="library-empty"><strong>${app.materials.length?'Nenhum material encontrado.':'Sua biblioteca ainda está vazia.'}</strong><p>${app.materials.length?'Tente alterar a busca ou o filtro.':'Crie um plano de aula, atividade, avaliação ou estrutura acadêmica e salve aqui.'}</p></div>`;return;}
    el.innerHTML=list.map(m=>`<article class="material-item"><div class="material-type-icon">${typeIcon(m.type)}</div><div><h3>${esc(m.title)}</h3><p>${esc(m.typeLabel)} • ${esc(m.subtitle)} • ${new Intl.DateTimeFormat('pt-BR').format(new Date(m.createdAt))}</p></div><div class="material-actions"><button class="mini-button" data-open="${m.id}">Abrir</button><button class="mini-button" data-doc="${m.id}">Word</button><button class="mini-button" data-delete="${m.id}">Excluir</button></div></article>`).join('');
    $$('[data-open]',el).forEach(b=>b.onclick=()=>openMaterial(b.dataset.open));
    $$('[data-doc]',el).forEach(b=>b.onclick=()=>exportDoc(app.materials.find(m=>m.id===b.dataset.doc)));
    $$('[data-delete]',el).forEach(b=>b.onclick=()=>deleteMaterial(b.dataset.delete));
  }
  $('#materialsSearch').addEventListener('input',renderMaterials); $('#materialsFilter').addEventListener('change',renderMaterials);
  $('#clearMaterialsBtn').addEventListener('click',()=>{ if(!app.materials.length)return; if(confirm('Deseja apagar todos os materiais salvos neste dispositivo?')){app.materials=[];persist();renderMaterials();toast('Biblioteca limpa.');} });
  function deleteMaterial(id){ if(confirm('Excluir este material?')){app.materials=app.materials.filter(m=>m.id!==id);persist();renderMaterials();toast('Material excluído.');} }

  const dialog=$('#materialDialog');
  function openMaterial(id){ const m=app.materials.find(x=>x.id===id); if(!m)return; app.currentMaterial=m; $('#dialogType').textContent=m.typeLabel; $('#dialogTitle').textContent=m.title; $('#dialogBody').innerHTML=`<div class="document ${m.type==='abnt'?'abnt-doc':''}">${m.html}</div>`; dialog.showModal(); }
  $('#dialogDocBtn').onclick=()=>app.currentMaterial&&exportDoc(app.currentMaterial); $('#dialogPrintBtn').onclick=()=>app.currentMaterial&&printMaterial(app.currentMaterial);

  function exportDoc(material){
    if(!material)return;
    const margins=material.type==='abnt'?`@page{size:A4;margin:3cm 2cm 2cm 3cm} body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;text-align:justify}`:`@page{size:A4;margin:2cm} body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.4}`;
    const content=`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${margins} h1{text-align:center;font-size:14pt} h2{font-size:12pt;margin-top:18pt} .meta{padding:8pt;background:#f4f4f4} .answer-key{page-break-before:always}.cover{min-height:22cm;text-align:center;display:flex;flex-direction:column;justify-content:space-between}</style></head><body>${material.html}</body></html>`;
    const blob=new Blob(['\ufeff',content],{type:'application/msword'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${slug(material.title)}.doc`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); toast('Arquivo para Word gerado.');
  }
  function printMaterial(material){
    const w=window.open('','_blank'); if(!w){toast('Permita pop-ups para imprimir.');return;}
    const isAbnt=material.type==='abnt'; w.document.write(`<!doctype html><html><head><title>${esc(material.title)}</title><style>@page{size:A4;margin:${isAbnt?'3cm 2cm 2cm 3cm':'2cm'}}body{font-family:${isAbnt?"'Times New Roman',serif":"Arial,sans-serif"};font-size:${isAbnt?'12pt':'11pt'};line-height:${isAbnt?'1.5':'1.4'};color:#111}h1{text-align:center;font-size:15pt}h2{font-size:12pt;margin-top:18pt}.meta{padding:8pt;background:#f4f4f4}.answer-key{page-break-before:always}.cover{height:22cm;text-align:center;display:flex;flex-direction:column;justify-content:space-between}p{text-align:${isAbnt?'justify':'left'}}</style></head><body>${material.html}</body></html>`); w.document.close(); w.focus(); setTimeout(()=>w.print(),250);
  }

  function updateStats(){
    $('#statMaterials').textContent=app.materials.length;
    $('#statPlans').textContent=app.materials.filter(m=>m.type==='plan').length;
    $('#statExams').textContent=app.materials.filter(m=>m.type==='exam').length;
    $('#statAbnt').textContent=app.materials.filter(m=>m.type==='abnt').length;
  }

  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();app.deferredInstall=e;$('#installBtn').hidden=false;});
  $('#installBtn').addEventListener('click',async()=>{if(!app.deferredInstall)return;app.deferredInstall.prompt();await app.deferredInstall.userChoice;app.deferredInstall=null;$('#installBtn').hidden=true;});
  if('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));

  updateStats(); renderMaterials();
})();
