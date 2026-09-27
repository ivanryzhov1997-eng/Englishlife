const KEY="englishRPG_v1";

const LEVELS=[
  {name:"Tutorial Village",min:0,max:500},
  {name:"English Survivor",min:500,max:1500},
  {name:"Traveler",min:1500,max:3000},
  {name:"Social Zone",min:3000,max:6000},
  {name:"American Conversation",min:6000,max:10000},
  {name:"English Main Character",min:10000,max:Infinity}
];

const QUESTS=[
 {title:"Introduce Yourself",text:"Расскажи о себе 60–90 секунд: откуда ты, чем занимаешься, что любишь и зачем учишь английский.",xp:50,stat:"speaking"},
 {title:"Yesterday Quest",text:"Расскажи 60 секунд о вчерашнем дне. Используй минимум 5 глаголов в Past Simple.",xp:50,stat:"grammar"},
 {title:"USA Dream",text:"Объясни 60 секунд, почему хочешь поехать в США и что хочешь там увидеть.",xp:50,stat:"speaking"},
 {title:"Question Hunter",text:"Придумай 5 вопросов человеку из США. Не копируй готовые вопросы.",xp:50,stat:"speaking"},
 {title:"Daily Life",text:"Опиши свою обычную неделю: учеба, работа, гитара, спорт, друзья.",xp:50,stat:"grammar"},
 {title:"Story Mode",text:"Расскажи маленькую историю из жизни с началом, событием и концом.",xp:60,stat:"speaking"}
];

const DEFAULT={
 xp:0, stats:{speaking:1,listening:1,vocab:1,grammar:1},
 streak:0,lastDay:null,questIndex:0,doneToday:false,
 enemies:{
  "WANT + TO":{name:"Want Goblin",hits:0},
  "PAST SIMPLE":{name:"Past Tense Goblin",hits:0},
  "AM/IS/ARE":{name:"Be Monster",hits:0},
  "TO/THE/AT":{name:"Preposition Slime",hits:0},
  "QUESTIONS":{name:"Question Hydra",hits:0}
 },
 loot:[
  {phrase:"I want to + verb",uses:0},
  {phrase:"I'm trying to + verb",uses:0},
  {phrase:"I'm going to + verb",uses:0}
 ],
 settings:{endpoint:"https://api.openai.com/v1/chat/completions",model:"gpt-5-mini",key:""}
};

let state=load();
const $=id=>document.getElementById(id);

function load(){
 try{return {...DEFAULT,...JSON.parse(localStorage.getItem(KEY)||"{}")};}
 catch{return structuredClone(DEFAULT)}
}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function today(){return new Date().toISOString().slice(0,10)}
function level(){
 let i=LEVELS.findIndex(x=>state.xp>=x.min&&state.xp<x.max);
 return i<0?LEVELS.length-1:i;
}
function addXP(amount,stat){
 const before=level(); state.xp+=amount;
 if(stat) state.stats[stat]=Math.min(100,state.stats[stat]+1);
 updateStreak();
 save(); render();
 if(level()>before) toast("🎉 LEVEL UP! "+LEVELS[level()].name);
 else toast("+"+amount+" XP");
}
function updateStreak(){
 const t=today();
 if(state.lastDay===t)return;
 const y=new Date(); y.setDate(y.getDate()-1);
 const yd=y.toISOString().slice(0,10);
 state.streak=state.lastDay===yd?state.streak+1:1;
 state.lastDay=t;
}
function render(){
 const l=level(), L=LEVELS[l], pct=L.max===Infinity?100:((state.xp-L.min)/(L.max-L.min))*100;
 $("levelBadge").textContent=l+1;$("levelName").textContent=L.name;$("xpTotal").textContent=state.xp;
 $("xpNow").textContent=Math.max(0,state.xp-L.min);$("xpNext").textContent=L.max===Infinity?"MAX":L.max-L.min;
 $("xpBar").style.width=Math.max(0,Math.min(100,pct))+"%";
 for(const s of ["speaking","listening","vocab","grammar"])$(s).textContent=state.stats[s];
 $("streak").textContent=state.streak;
 const q=QUESTS[state.questIndex%QUESTS.length];
 $("questTitle").textContent=q.title;$("questText").textContent=q.text;$("questXp").textContent="+"+q.xp+" XP";
 renderEnemies();renderLoot();renderMap();
}
function renderEnemies(){
 $("enemies").innerHTML=Object.values(state.enemies).map(e=>`<div class="enemy"><b>👾 ${e.name}</b><small>побеждено: ${e.hits}</small></div>`).join("");
}
function renderLoot(){
 $("loot").innerHTML=state.loot.map(x=>`<div class="loot"><b>💎 ${x.phrase}</b><small>использовано: ${x.uses}/3</small></div>`).join("");
}
function renderMap(){
 const l=level();
 const zones=["Tutorial Village","Daily Life City","Hobby District","Social Zone","Travel Hub","USA"];
 $("map").innerHTML=zones.map((z,i)=>`<div class="zone ${i===l?"current":""} ${i>l?"locked":""}"><b>${i>l?"🔒":"📍"} ${z}</b><small>${i<=l?"Открыто":"Нужно больше XP"}</small></div>`).join("");
}
function toast(t){const x=$("toast");x.textContent=t;x.classList.remove("hidden");setTimeout(()=>x.classList.add("hidden"),1800)}
function addChat(text,type){$("chat").insertAdjacentHTML("beforeend",`<div class="bubble ${type}">${escapeHtml(text).replace(/\n/g,"<br>")}</div>`);$("chat").scrollTop=$("chat").scrollHeight}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

async function askAI(userText,mode="tutor"){
 if(!state.settings.key){toast("Добавь API key в ⚙️");return null}
 const system=`You are the Game Master of a personalized English RPG for a Russian-speaking learner around A2 level.
Goal: make spoken English automatic and fun. The learner wants to travel to the USA and likes guitar, chess, workouts, games and everyday-life topics.
Rules:
- Reply in simple natural English, roughly A2-B1 unless teaching a point.
- Correct only the 1-3 most important errors. Do not rewrite everything.
- Explain corrections in Russian briefly.
- Give one tiny next challenge.
- Track recurring enemies conceptually: want+to, verb tenses, am/is/are, articles/prepositions, question formation.
- Never shame mistakes. Mistakes are XP opportunities.
- Keep replies concise.`;
 const body={model:state.settings.model,messages:[
  {role:"system",content:system},
  {role:"user",content:mode==="quest"?`Quest: ${QUESTS[state.questIndex%QUESTS.length].title}\nTask: ${QUESTS[state.questIndex%QUESTS.length].text}\nLearner answer:\n${userText}\nReturn: (1) short reaction in English, (2) 1-3 key corrections with Russian explanations, (3) one better phrase to loot, (4) a mini next challenge.`:`The learner says:\n${userText}\nAct as their English RPG GM.`],
 temperature:.6
 }};
 try{
  const r=await fetch(state.settings.endpoint,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+state.settings.key},body:JSON.stringify(body)});
  if(!r.ok)throw new Error(await r.text());
  const j=await r.json();
  return j.choices?.[0]?.message?.content||"AI returned no text.";
 }catch(e){return "AI error: "+e.message}
}

$("checkQuest").onclick=async()=>{
 const text=$("answerBox").value.trim(); if(!text){toast("Сначала напиши ответ");return}
 $("checkQuest").disabled=true;$("checkQuest").textContent="🤖 Проверяю...";
 const out=await askAI(text,"quest");
 $("questFeedback").textContent=out||"";
 $("questFeedback").classList.remove("hidden");
 $("checkQuest").disabled=false;$("checkQuest").textContent="⚔️ Проверить с ИИ";
 if(out){
  const q=QUESTS[state.questIndex%QUESTS.length];
  if(!state.doneToday){state.doneToday=true;addXP(q.xp,q.stat)}
  state.questIndex++; save(); render();
 }
};
$("finishQuest").onclick=()=>{
 if(state.doneToday){toast("Главный квест уже выполнен сегодня");return}
 const q=QUESTS[state.questIndex%QUESTS.length];state.doneToday=true;state.questIndex++;
 addXP(q.xp,q.stat);
};
$("sendChat").onclick=sendChat;
$("chatInput").addEventListener("keydown",e=>{if(e.key==="Enter")sendChat()});
async function sendChat(){
 const v=$("chatInput").value.trim();if(!v)return;
 $("chatInput").value="";addChat(v,"user");addChat("Thinking...","ai");
 const res=await askAI(v);$("chat").lastElementChild.remove();addChat(res||"No response.","ai");
 if(res)addXP(10,"speaking");
}

$("settingsBtn").onclick=()=>{
 $("apiEndpoint").value=state.settings.endpoint;$("apiModel").value=state.settings.model;$("apiKey").value=state.settings.key;
 $("settingsModal").classList.remove("hidden")
};
$("closeSettings").onclick=()=>$("settingsModal").classList.add("hidden");
$("saveSettings").onclick=()=>{
 state.settings={endpoint:$("apiEndpoint").value.trim(),model:$("apiModel").value.trim(),key:$("apiKey").value.trim()};
 save();$("settingsModal").classList.add("hidden");toast("Настройки сохранены")
};
$("resetApp").onclick=()=>{
 if(confirm("Сбросить весь прогресс?")){localStorage.removeItem(KEY);location.reload()}
};

render();
