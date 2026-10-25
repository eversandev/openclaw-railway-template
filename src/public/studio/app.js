const $ = s => document.querySelector(s);
let creating = false, user, page = 'chat', mediaTimer;
const modelNames={images:'Nano Banana 2',video:'Veo 3.1 Fast',music:'Mureka 9.5'};
const pages = {
 chat: ['SEU ESPAÇO CRIATIVO','O que vamos criar hoje?','Comece com uma ideia. Prepare seu próximo texto, imagem, música ou vídeo em um só lugar.','Descreva o que você tem em mente…'],
 images: ['CRIAR IMAGEM','Dê forma à sua imaginação.','Descreva a cena, o estilo e os detalhes. Escolha o formato e gere sua imagem com IA.','Uma fotografia cinematográfica de…'],
 video: ['CRIAR VÍDEO','Toda história começa com uma cena.','Descreva o movimento, o cenário e a atmosfera do seu próximo vídeo.','Um vídeo de 5 segundos mostrando…'],
 music: ['MÚSICA','Encontre o som da sua ideia.','Defina o estilo, os instrumentos e o sentimento da sua próxima composição.','Uma trilha instrumental com…']
};
async function api(route, body) {
 const response = await fetch('/studio/api/' + route, body === undefined ? {} : { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
 const data = await response.json().catch(() => ({}));
 if (!response.ok) throw new Error(data.error || 'Não foi possível concluir. Tente entrar novamente.');
 return data;
}
function text(tag, value, cls) { const el = document.createElement(tag); el.textContent = value; if(cls) el.className = cls; return el; }
function renderHistory() {
 $('#draft-list').replaceChildren();
 for(const chat of user.chats||[]){const button=text('button','▢ '+chat.title);button.onclick=async()=>{try{user.currentChat=await api('chats/'+chat.id);render('chat');}catch{}};$('#draft-list').append(button);}
 for(const draft of user.drafts.filter(d => d.prompt.trim())) { const button=text('button', draft.prompt);button.onclick=()=>render(draft.kind);$('#draft-list').append(button); }
 if(!$('#draft-list').children.length) $('#draft-list').append(text('p','Suas ideias salvas aparecerão aqui.','empty'));
}
function render(next) {
 clearTimeout(mediaTimer); page = next; $('#sidebar').classList.remove('open');
 document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
 const root = $('#page-content'); root.replaceChildren();
 $('#breadcrumb').textContent = ({chat:'Seu espaço criativo',images:'Imagens',video:'Vídeo',music:'Música',search:'Pesquisar',files:'Arquivos e documentos',agent:'Agent'})[page];
 if(page === 'search') {
  root.append(text('p','SUA BIBLIOTECA','eyebrow'),text('h1','Encontre suas ideias.'));
  const input=document.createElement('input');input.className='search-input';input.placeholder='Pesquisar rascunhos…';input.setAttribute('aria-label','Pesquisar rascunhos');root.append(input);
  const results=document.createElement('div');root.append(results);
  const search=()=>{results.replaceChildren(); const matches=user.drafts.filter(d=>d.prompt.trim()&&d.prompt.toLowerCase().includes(input.value.toLowerCase()));for(const d of matches){const b=text('button',d.prompt,'list-item');b.onclick=()=>render(d.kind);results.append(b)}if(!matches.length)results.append(text('p','Nenhum rascunho encontrado.','muted'));};input.oninput=search;search();return;
 }
 if(page === 'files' || page === 'agent') {
  root.append(text('p',page==='files'?'SUA BIBLIOTECA':'AGENT','eyebrow'),text('h1',page==='files'?'Um lugar para suas referências.':'Seu agente, em um espaço separado.'),text('p',page==='files'?'O envio de arquivos ainda não está conectado. Seus rascunhos ficam disponíveis em Pesquisar.':'O agente com ferramentas administrativas permanece no painel administrativo. Esta área pública não concede acesso a ele.','intro'));return;
 }
 const p=pages[page]; root.append(text('p',p[0],'eyebrow'),text('h1',p[1]),text('p',p[2],'intro'));
 if(page==='chat'&&user.currentChat?.messages?.length){const thread=document.createElement('section');thread.className='chat-thread';thread.setAttribute('aria-label','Histórico da conversa');for(const message of user.currentChat.messages){const item=document.createElement('article');item.className='chat-message '+message.role;item.append(text('small',message.role==='user'?'Você':'Chat Forgenox'),text('div',message.content));thread.append(item)}root.append(thread)}
 const box=document.createElement('div');box.className='composer';
 const prompt=document.createElement('textarea');prompt.placeholder=p[3];prompt.setAttribute('aria-label','Descreva sua criação');prompt.maxLength=10000;prompt.value=user.drafts.find(d=>d.kind===page)?.prompt || '';box.append(prompt);
 const options={}; if(page!=='chat') addMediaControls(box,page,options);
 const bar=document.createElement('div');bar.className='composer-bar';bar.append(text('span',page==='chat'?'Rascunho de conversa':'Rascunho de criação','chip'));const save=text('button','Salvar ideia','primary');bar.append(save);box.append(bar);root.append(box);
 const send=page==='chat'?text('button','Enviar mensagem','primary'):null;if(send)bar.append(send);
 const generate=page==='chat'?null:text('button',user.mediaConnected?'Gerar agora':'Geração indisponível','primary');if(generate){generate.disabled=!user.mediaConnected;bar.append(generate);}
 root.append(text('p',page==='chat'?'Respostas por IA. Confira informações importantes. As conversas ficam na sua conta.':user.mediaConnected?'Gerar utiliza os créditos da conta fal.ai do administrador. Os resultados ficam no seu histórico; os links dos arquivos são hospedados pela fal.ai e podem expirar.':'A geração ainda não está conectada. Você pode salvar sua ideia para depois.','notice'));
 const status=text('p','','status');status.setAttribute('role','status');root.append(status);
 save.onclick=async()=>{save.disabled=true;try{await api('draft',{kind:page,prompt:prompt.value});const d=user.drafts.find(d=>d.kind===page);if(d)d.prompt=prompt.value;else user.drafts.push({kind:page,prompt:prompt.value});renderHistory();status.textContent='Ideia salva na sua conta.';}catch(e){status.textContent=e.message;}finally{save.disabled=false}};
 if(send)send.onclick=async()=>{const message=prompt.value.trim();if(!message)return;const person=user;const selected=user.currentChat?.id;const previousMessages=[...(user.currentChat?.messages||[])];send.disabled=true;status.textContent='Preparando a resposta…';try{const result=await api('chat',{message,chatId:selected});if(user!==person)return;person.chats=await api('chats');const stillSelected=person.currentChat?.id===selected;if(stillSelected)person.currentChat={id:result.chatId,title:result.title,messages:[...previousMessages,{role:'user',content:message},{role:'assistant',content:result.reply}]};const d=person.drafts.find(d=>d.kind==='chat');if(d)d.prompt='';await api('draft',{kind:'chat',prompt:''});renderHistory();if(page==='chat'&&stillSelected)render('chat');}catch(error){if(user===person)status.textContent=error.message;}finally{send.disabled=false}};
 if(send)prompt.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(!send.disabled)send.click();}};
 if(generate)generate.onclick=async()=>{if(!prompt.value.trim()){status.textContent='Descreva o que você quer criar.';return;}generate.disabled=true;try{const job=await api('media',{kind:page,prompt:prompt.value,options});user.jobs.unshift(job);status.textContent='Pedido enviado. Acompanhe abaixo.';renderMediaResults(results,page);}catch(e){status.textContent=e.message;user.jobs=await api('media').catch(()=>user.jobs);renderMediaResults(results,page);}finally{generate.disabled=!user.mediaConnected}};
 const results=document.createElement('section');results.className='media-results';root.append(results);if(page!=='chat')renderMediaResults(results,page);
 const samples=page==='images'?['Retrato em luz natural','Paisagem de outro mundo','Identidade visual minimalista']:page==='video'?['Uma cidade ao amanhecer','Produto em movimento','Uma cena cinematográfica']:page==='music'?['Piano para concentrar','Eletrônica ao pôr do sol','Uma trilha de aventura']:['Planejar uma criação','Explorar uma ideia','Escrever um roteiro'];
 const cards=document.createElement('div');cards.className='suggestions';for(const sample of samples){const b=document.createElement('button');b.append(text('b',sample),text('span','Usar como ponto de partida ↗'));b.onclick=()=>{prompt.value=sample;prompt.focus()};cards.append(b)}root.append(cards);
}
async function load() { try {user=await api('me');user.jobs=await api('media');user.chats=await api('chats');$('#auth').hidden=true;$('#shell').hidden=false;$('#email').textContent=user.email;$('#avatar').textContent=user.email[0].toUpperCase();renderHistory();render(page);}catch{$('#auth').hidden=false;$('#shell').hidden=true;} }
$('#auth-form').onsubmit=async e=>{e.preventDefault();const button=$('#auth-submit');button.disabled=true;$('#auth-status').textContent='';try{await api(creating?'register':'login',Object.fromEntries(new FormData(e.target)));e.target.reset();await load();}catch(error){$('#auth-status').textContent=error.message;}finally{button.disabled=false}};
$('#auth-toggle').onclick=()=>{creating=!creating;$('#auth-submit').textContent=creating?'Criar conta':'Entrar';$('#auth-toggle').textContent=creating?'Já tem conta? Entrar':'Ainda não tem conta? Criar conta';$('#auth-form [name=password]').autocomplete=creating?'new-password':'current-password';$('#auth-status').textContent='';};
$('#logout').onclick=async()=>{try{await api('logout',{});user=null;$('#shell').hidden=true;$('#auth').hidden=false;}catch{alert('Não foi possível sair. Tente novamente.')}};
for(const b of document.querySelectorAll('[data-page]'))b.onclick=()=>{if(b.dataset.page==='chat')user.currentChat=null;render(b.dataset.page)};
for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>{document.querySelectorAll('[data-mode]').forEach(v=>v.classList.toggle('selected',v===b));render(b.dataset.mode)};
$('#mobile-menu').onclick=()=>$('#sidebar').classList.toggle('open');
load();

function addMediaControls(box,kind,options){
 const controls=document.createElement('div');controls.className='media-controls';
 controls.append(text('span',modelNames[kind],'chip'));
 const select=(label,values,key)=>{const field=document.createElement('label');field.append(text('span',label));const input=document.createElement('select');input.setAttribute('aria-label',label);for(const value of values){const item=document.createElement('option');item.value=value;item.textContent=value;input.append(item)}options[key]=values[0];input.onchange=()=>options[key]=input.value;field.append(input);controls.append(field)};
 if(kind==='images')select('Formato',['1:1','16:9','9:16','4:3','3:4'],'ratio');
 if(kind==='video'){select('Formato',['16:9','9:16'],'ratio');select('Duração',['4s','6s','8s'],'duration');select('Resolução',['720p','1080p'],'resolution');const label=document.createElement('label');const audio=document.createElement('input');audio.type='checkbox';audio.checked=true;options.audio=true;audio.onchange=()=>options.audio=audio.checked;label.append(audio,text('span','Áudio'));controls.append(label)}
 if(kind==='music'){const field=document.createElement('label');field.className='lyrics-field';field.append(text('span','Letra (opcional)'));const lyrics=document.createElement('textarea');lyrics.placeholder='Escreva sua letra ou deixe vazio para criar a partir da descrição…';lyrics.maxLength=5000;lyrics.setAttribute('aria-label','Letra da música');lyrics.oninput=()=>options.lyrics=lyrics.value;field.append(lyrics);controls.append(field)}
 box.append(controls);
}
function renderMediaResults(root,kind){
 clearTimeout(mediaTimer);root.replaceChildren();
 const jobs=(user.jobs||[]).filter(j=>j.kind===kind);
 if(!jobs.length)return;
 root.append(text('h2','Suas criações'));
 const labels={SUBMITTING:'Enviando',IN_QUEUE:'Na fila',IN_PROGRESS:'Gerando',COMPLETED:'Concluído',FAILED:'Não foi possível gerar',UNKNOWN:'Envio não confirmado — contate o administrador antes de repetir'};
 for(const job of jobs){const card=document.createElement('article');card.className='media-result';card.append(text('p',job.prompt),text('small',labels[job.status]||job.status));for(const result of job.result||[]){const element=document.createElement(kind==='images'?'img':kind==='video'?'video':'audio');element.src=result.url;if(kind==='images'){element.alt=job.prompt;element.loading='lazy';}else{element.controls=true;element.preload='metadata'}card.append(element);const link=text('a','Abrir arquivo ↗');link.href=result.url;link.target='_blank';link.rel='noopener noreferrer';card.append(link)}root.append(card)}
 const pending=jobs.filter(j=>['IN_QUEUE','IN_PROGRESS'].includes(j.status));
 if(pending.length)mediaTimer=setTimeout(async()=>{if(!user||page!==kind)return;for(const job of pending){try{const fresh=await api('media/'+job.id);const i=user.jobs.findIndex(j=>j.id===job.id);if(i>=0)user.jobs[i]=fresh;}catch{}}if(page===kind&&root.isConnected)renderMediaResults(root,kind)},5000);
}
