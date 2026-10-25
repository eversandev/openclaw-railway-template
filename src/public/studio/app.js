const $ = s => document.querySelector(s);
let creating = false, user, page = 'chat';
const pages = {
 chat: ['SEU ESPAÇO CRIATIVO','O que vamos criar hoje?','Comece com uma ideia. Prepare seu próximo texto, imagem, música ou vídeo em um só lugar.','Descreva o que você tem em mente…'],
 images: ['CRIAR IMAGEM','Dê forma à sua imaginação.','Descreva a cena, o estilo e os detalhes. Salve a ideia para gerar quando o serviço estiver conectado.','Uma fotografia cinematográfica de…'],
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
 for(const draft of user.drafts.filter(d => d.prompt.trim())) { const button=text('button', draft.prompt);button.onclick=()=>render(draft.kind);$('#draft-list').append(button); }
 if(!$('#draft-list').children.length) $('#draft-list').append(text('p','Suas ideias salvas aparecerão aqui.','empty'));
}
function render(next) {
 page = next; $('#sidebar').classList.remove('open');
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
 const box=document.createElement('div');box.className='composer';
 const prompt=document.createElement('textarea');prompt.placeholder=p[3];prompt.setAttribute('aria-label','Descreva sua criação');prompt.maxLength=10000;prompt.value=user.drafts.find(d=>d.kind===page)?.prompt || '';box.append(prompt);
 const bar=document.createElement('div');bar.className='composer-bar';bar.append(text('span',page==='chat'?'Rascunho de conversa':'Rascunho de criação','chip'));const save=text('button','Salvar ideia','primary');bar.append(save);box.append(bar);root.append(box);
 root.append(text('p',page==='chat'?'O chat com IA ainda precisa ser conectado a esta interface. Por enquanto, você pode preparar e salvar suas ideias.':'A geração ainda não está conectada. Salvar a ideia não gera mídia nem faz cobranças.','notice'));
 const status=text('p','','status');status.setAttribute('role','status');root.append(status);
 save.onclick=async()=>{save.disabled=true;try{await api('draft',{kind:page,prompt:prompt.value});const d=user.drafts.find(d=>d.kind===page);if(d)d.prompt=prompt.value;else user.drafts.push({kind:page,prompt:prompt.value});renderHistory();status.textContent='Ideia salva na sua conta.';}catch(e){status.textContent=e.message;}finally{save.disabled=false}};
 const samples=page==='images'?['Retrato em luz natural','Paisagem de outro mundo','Identidade visual minimalista']:page==='video'?['Uma cidade ao amanhecer','Produto em movimento','Uma cena cinematográfica']:page==='music'?['Piano para concentrar','Eletrônica ao pôr do sol','Uma trilha de aventura']:['Planejar uma criação','Explorar uma ideia','Escrever um roteiro'];
 const cards=document.createElement('div');cards.className='suggestions';for(const sample of samples){const b=document.createElement('button');b.append(text('b',sample),text('span','Usar como ponto de partida ↗'));b.onclick=()=>{prompt.value=sample;prompt.focus()};cards.append(b)}root.append(cards);
}
async function load() { try {user=await api('me');$('#auth').hidden=true;$('#shell').hidden=false;$('#email').textContent=user.email;$('#avatar').textContent=user.email[0].toUpperCase();renderHistory();render(page);}catch{$('#auth').hidden=false;$('#shell').hidden=true;} }
$('#auth-form').onsubmit=async e=>{e.preventDefault();const button=$('#auth-submit');button.disabled=true;$('#auth-status').textContent='';try{await api(creating?'register':'login',Object.fromEntries(new FormData(e.target)));e.target.reset();await load();}catch(error){$('#auth-status').textContent=error.message;}finally{button.disabled=false}};
$('#auth-toggle').onclick=()=>{creating=!creating;$('#auth-submit').textContent=creating?'Criar conta':'Entrar';$('#auth-toggle').textContent=creating?'Já tem conta? Entrar':'Ainda não tem conta? Criar conta';$('#auth-form [name=password]').autocomplete=creating?'new-password':'current-password';$('#auth-status').textContent='';};
$('#logout').onclick=async()=>{try{await api('logout',{});user=null;$('#shell').hidden=true;$('#auth').hidden=false;}catch{alert('Não foi possível sair. Tente novamente.')}};
for(const b of document.querySelectorAll('[data-page]'))b.onclick=()=>render(b.dataset.page);
for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>{document.querySelectorAll('[data-mode]').forEach(v=>v.classList.toggle('selected',v===b));render(b.dataset.mode)};
$('#mobile-menu').onclick=()=>$('#sidebar').classList.toggle('open');
load();
