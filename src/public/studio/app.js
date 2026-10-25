const $ = s => document.querySelector(s);
let creating = false, user, page = 'chat', mediaTimer, chatBusy=false;
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
  const input=document.createElement('input');input.className='search-input';input.placeholder='Pesquisar chats e ideias…';input.setAttribute('aria-label','Pesquisar chats e ideias');root.append(input);
  const results=document.createElement('div');root.append(results);
  const search=()=>{results.replaceChildren(); for(const chat of (user.chats||[]).filter(c=>c.title.toLowerCase().includes(input.value.toLowerCase()))){const b=text('button','Conversa · '+chat.title,'list-item');b.onclick=async()=>{user.currentChat=await api('chats/'+chat.id);render('chat')};results.append(b)}const matches=user.drafts.filter(d=>d.prompt.trim()&&d.prompt.toLowerCase().includes(input.value.toLowerCase()));for(const d of matches){const b=text('button',d.prompt,'list-item');b.onclick=()=>render(d.kind);results.append(b)}if(!results.children.length)results.append(text('p','Nenhum rascunho encontrado.','muted'));};input.oninput=search;search();return;
 }
 if(page === 'files' || page === 'agent') {
  root.append(text('p',page==='files'?'SUA BIBLIOTECA':'AGENT','eyebrow'),text('h1',page==='files'?'Um lugar para suas referências.':'Seu agente, em um espaço separado.'),text('p',page==='files'?'O envio de arquivos ainda não está conectado. Seus rascunhos ficam disponíveis em Pesquisar.':'O agente com ferramentas administrativas permanece no painel administrativo. Esta área pública não concede acesso a ele.','intro'));return;
 }
 root.classList.toggle('conversation',page==='chat'&&!!user.currentChat?.messages?.length);const p=pages[page]; root.append(text('p',p[0],'eyebrow'),text('h1',p[1]),text('p',p[2],'intro'));
 if(page==='chat'&&user.currentChat?.messages?.length){const thread=document.createElement('section');thread.className='chat-thread';thread.setAttribute('aria-label','Histórico da conversa');for(const message of user.currentChat.messages){const item=document.createElement('article');item.className='chat-message '+message.role;item.append(text('small',message.role==='user'?'Você':'Chat Forgenox'),renderMessageText(message.content));if(message.role==='assistant'){const copy=text('button','Copiar resposta','copy-response');copy.onclick=()=>navigator.clipboard.writeText(message.content).then(()=>copy.textContent='Copiado').catch(()=>copy.textContent='Não foi possível copiar');item.append(copy)}thread.append(item)}root.append(thread)}
 const box=document.createElement('div');box.className='composer';
 const prompt=document.createElement('textarea');prompt.placeholder=p[3];prompt.setAttribute('aria-label','Descreva sua criação');prompt.maxLength=10000;prompt.value=user.drafts.find(d=>d.kind===page)?.prompt || '';box.append(prompt);
 if(page==='chat'){const tools=text('div','','quick-tools');for(const [kind,label] of [['images','▧ Criar imagem'],['video','▷ Criar vídeo'],['music','♫ Criar música']]){const b=text('button',label);b.onclick=()=>render(kind);tools.append(b)}box.append(tools)}const options={}; if(page!=='chat') addMediaControls(box,page,options);
 const bar=document.createElement('div');bar.className='composer-bar';bar.append(text('span',page==='chat'?'Claude Opus 5.5 · Raciocínio alto':'Rascunho de criação','chip'));const save=text('button','Salvar ideia','primary');bar.append(save);box.append(bar);root.append(box);if(page==='chat')box.append(text('p','Enter envia · Shift + Enter quebra a linha','keyboard-hint'));
 const send=page==='chat'?text('button','Enviar mensagem','primary'):null;if(send){send.id='chat-send';send.disabled=chatBusy;bar.append(send);}
 const generate=page==='chat'?null:text('button',user.mediaConnected?'Gerar agora':'Geração indisponível','primary');if(generate){generate.disabled=!user.mediaConnected;bar.append(generate);}
 root.append(text('p',page==='chat'?'Pesquisa web automática para dados atuais. Confira as fontes. As conversas ficam na sua conta.':user.mediaConnected?'Gerar utiliza os créditos da conta fal.ai do administrador. Os resultados ficam no seu histórico; os links dos arquivos são hospedados pela fal.ai e podem expirar.':'A geração ainda não está conectada. Você pode salvar sua ideia para depois.','notice'));
 const status=text('p','','status');status.setAttribute('role','status');root.append(status);
 save.onclick=async()=>{save.disabled=true;try{await api('draft',{kind:page,prompt:prompt.value});const d=user.drafts.find(d=>d.kind===page);if(d)d.prompt=prompt.value;else user.drafts.push({kind:page,prompt:prompt.value});renderHistory();status.textContent='Ideia salva na sua conta.';}catch(e){status.textContent=e.message;}finally{save.disabled=false}};
 if(send)send.onclick=async()=>{const message=prompt.value.trim();if(!message||chatBusy)return;chatBusy=true;const person=user;const selected=user.currentChat?.id;const previousMessages=[...(user.currentChat?.messages||[])];send.disabled=true;prompt.disabled=true;send.textContent='Pensando…';let thread=root.querySelector('.chat-thread');if(!thread){thread=document.createElement('section');thread.className='chat-thread';root.insertBefore(thread,box)}root.classList.add('conversation');const sent=text('article','','chat-message user');sent.append(text('small','Você'),text('div',message));thread.append(sent);prompt.value='';const started=Date.now();const thinking=text('span','Pensando…','thinking-label');const dots=document.createElement('span');dots.className='thinking-dots';dots.setAttribute('aria-hidden','true');for(let i=0;i<3;i++)dots.append(document.createElement('i'));const elapsed=text('span','0s','thinking-time');elapsed.setAttribute('aria-hidden','true');const hint=text('span','Estou preparando sua resposta.','thinking-hint');status.classList.add('thinking');status.replaceChildren(dots,thinking,elapsed,hint);thread.append(status);sent.scrollIntoView({block:'nearest',behavior:'smooth'});const waiting=setInterval(()=>{const seconds=Math.floor((Date.now()-started)/1000);elapsed.textContent=seconds+'s';if(seconds===20)hint.textContent='Ainda pensando. Respostas mais completas podem levar um pouco mais de tempo.';},1000);try{const result=await api('chat',{message,chatId:selected});if(user!==person)return;person.chats=await api('chats');const stillSelected=person.currentChat?.id===selected;if(stillSelected)person.currentChat={id:result.chatId,title:result.title,messages:[...previousMessages,{role:'user',content:message},{role:'assistant',content:result.reply}]};const d=person.drafts.find(d=>d.kind==='chat');if(d)d.prompt='';await api('draft',{kind:'chat',prompt:''});chatBusy=false;renderHistory();if(page==='chat'&&stillSelected)render('chat');}catch(error){if(user===person){status.textContent=error.message;sent.remove();prompt.value=message;}}finally{chatBusy=false;if($('#chat-send'))$('#chat-send').disabled=false;clearInterval(waiting);status.classList.remove('thinking');prompt.disabled=false;send.disabled=false;send.textContent='Enviar mensagem'}};
 if(send)prompt.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!send.disabled)send.click();}};
 if(generate)generate.onclick=async()=>{if(!prompt.value.trim()){status.textContent='Descreva o que você quer criar.';return;}generate.disabled=true;try{const job=await api('media',{kind:page,prompt:prompt.value,options});user.jobs.unshift(job);status.textContent='Pedido enviado. Acompanhe abaixo.';renderMediaResults(results,page);}catch(e){status.textContent=e.message;user.jobs=await api('media').catch(()=>user.jobs);renderMediaResults(results,page);}finally{generate.disabled=!user.mediaConnected}};
 const results=document.createElement('section');results.className='media-results';root.append(results);if(page!=='chat')renderMediaResults(results,page);
 const samples=page==='images'?['Retrato em luz natural','Paisagem de outro mundo','Identidade visual minimalista']:page==='video'?['Uma cidade ao amanhecer','Produto em movimento','Uma cena cinematográfica']:page==='music'?['Piano para concentrar','Eletrônica ao pôr do sol','Uma trilha de aventura']:['Planejar uma criação','Explorar uma ideia','Escrever um roteiro'];
 const cards=document.createElement('div');cards.className='suggestions';for(const sample of samples){const b=document.createElement('button');b.append(text('b',sample),text('span','Usar como ponto de partida ↗'));b.onclick=()=>{prompt.value=sample;prompt.focus()};cards.append(b)}root.append(cards);if(page==='chat'&&user.currentChat?.messages?.length)requestAnimationFrame(()=>box.scrollIntoView({block:'end'}));
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

function renderMessageText(value){
 const root=document.createElement('div');root.className='markdown';
 const inline=(parent,value)=>{const re=/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>]+)/g;let start=0;for(const m of value.matchAll(re)){parent.append(document.createTextNode(value.slice(start,m.index)));let node;if(m[0].startsWith('`'))node=text('code',m[0].slice(1,-1));else if(m[0].startsWith('**'))node=text('strong',m[0].slice(2,-2));else{const link=m[0].match(/^\[([^\]]+)\]\((.+)\)$/);node=text('a',link?link[1]:m[0]);node.href=link?link[2]:m[0];node.target='_blank';node.rel='noopener noreferrer'}parent.append(node);start=m.index+m[0].length}parent.append(document.createTextNode(value.slice(start)))};
 const lines=String(value).split('\n');let i=0;
 const cells=line=>line.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());
 while(i<lines.length){let line=lines[i];if(!line.trim()){i++;continue}
 if(line.startsWith('```')){const language=line.slice(3).trim();let code='';i++;while(i<lines.length&&!lines[i].startsWith('```'))code+=lines[i++]+'\n';i++;const panel=text('section','','code-panel');const bar=text('div',language||'Código','code-bar');const copy=text('button','Copiar');copy.onclick=()=>navigator.clipboard.writeText(code).then(()=>copy.textContent='Copiado').catch(()=>copy.textContent='Falha ao copiar');bar.append(copy);const pre=document.createElement('pre');pre.append(text('code',code));panel.append(bar,pre);root.append(panel);continue}
 if(i+1<lines.length&&line.includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1])){const wrap=text('div','','table-scroll');const table=document.createElement('table');const head=document.createElement('thead');const tr=document.createElement('tr');for(const c of cells(line)){const th=document.createElement('th');inline(th,c);tr.append(th)}head.append(tr);table.append(head);i+=2;const body=document.createElement('tbody');while(i<lines.length&&lines[i].includes('|')){const row=document.createElement('tr');for(const c of cells(lines[i++])){const td=document.createElement('td');inline(td,c);row.append(td)}body.append(row)}table.append(body);wrap.append(table);root.append(wrap);continue}
 const heading=line.match(/^(#{1,6})\s+(.+)/);if(heading){const h=document.createElement('h'+Math.min(heading[1].length+1,6));inline(h,heading[2]);root.append(h);i++;continue}
 if(/^\s*([-*+] |\d+\. )/.test(line)){const ordered=/^\s*\d+\./.test(line);const list=document.createElement(ordered?'ol':'ul');while(i<lines.length&&(ordered?/^\s*\d+\. /:/^\s*[-*+] /).test(lines[i])){const li=document.createElement('li');inline(li,lines[i++].replace(/^\s*(?:[-*+]|\d+\.)\s+/,''));list.append(li)}root.append(list);continue}
 const paragraph=document.createElement(line.startsWith('> ')?'blockquote':'p');inline(paragraph,line.replace(/^> /,''));root.append(paragraph);i++;
 }return root;
}
