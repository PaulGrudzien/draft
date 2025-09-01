/**
 * Tirage au sort — 24 équipes / 6 poules / 4 tours
 * - Bouton lancer/pause
 * - Bouton "Tirer 1 équipe" pour avancer pas à pas
 * - Liste des équipes à droite (coach + équipe) qui se colore lorsqu'attribuée
 * - 6 tableaux de poules, 4 lignes (coach + équipe) + en-tête numéro de poule
 * - Attribution par tours: chaque poule reçoit 1 équipe avant de démarrer le tour suivant
 * - Animation de "révélation" du nom, dans l'esprit grandes leagues US
 */

const state = {
  teams: [],            // [{team, coach, id}]
  order: [],            // ordre aléatoire (permutation des ids 0..23)
  assigned: Array(24).fill(false),
  pools: Array.from({ length: 6 }, () => []),  // 6 poules; chaque entrée: [{team, coach, round}]
  round: 0,             // 0..3
  poolIndex: 0,         // 0..5
  running: false,
  mainTimer: null,
  spinTimer: null,
  nextPickPreviewNames: [],
};

// --- Utilitaires ---
function shuffle(array){
  for(let i = array.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
function qs(sel, el=document){ return el.querySelector(sel); }
function qsa(sel, el=document){ return Array.from(el.querySelectorAll(sel)); }

// --- Construction des données de base ---
const teams = [["c1", "t1"],
               ["c2", "t2"],
               ["c3", "t3"],
               ["c4", "t4"],
               ["c5", "t5"],
               ["c6", "t6"],
               ["c7", "t7"],
               ["c8", "t8"],
               ["c9", "t9"],
               ["c10", "t10"],
               ["c11", "t11"],
               ["c12", "t12"],
               ["c13", "t13"],
               ["c14", "t14"],
               ["c15", "t15"],
               ["c16", "t16"],
               ["c17", "t17"],
               ["c18", "t18"],
               ["c19", "t19"],
               ["c20", "t20"],
               ["c21", "t21"],
               ["c22", "t22"],
               ["c23", "t23"],
               ["c24", "t24"]]
function initTeams(){
  state.teams = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    team: teams[i][1],
    coach: teams[i][0]
  }));
}

// --- Construction du DOM ---
function renderPools(){
  const container = qs('.pools');
  container.innerHTML = '';
  for(let p = 0; p < 6; p++){
    const el = document.createElement('div');
    el.className = 'pool card';
    el.dataset.pool = p;
    el.innerHTML = `
      <header>
        <div class="pool-badge">
          <span class="pill">Poule ${p+1}</span>
        </div>
        <div class="meta">
          <span class="muted">Tour <strong class="pool-round">1</strong>/4</span>
        </div>
      </header>
      <table>
        <thead>
          <tr>
            <th style="width:50%">Coach</th>
            <th>Équipe</th>
          </tr>
        </thead>
        <tbody>
          ${Array.from({length:4}).map(()=>`
            <tr>
              <td class="coach-cell muted">—</td>
              <td class="team-cell muted">—</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    container.appendChild(el);
  }
}
function renderTeamsList(){
  const tbody = qs('#teamsTable tbody');
  tbody.innerHTML = '';
  state.teams.forEach(t => {
    const tr = document.createElement('tr');
    tr.id = `team-row-${t.id}`;
    tr.innerHTML = `
      <td><span class="status-dot"></span>${t.coach}</td>
      <td>${t.team}</td>
    `;
    tbody.appendChild(tr);
  });
}

// --- Mise à jour UI ---
function setNowDrawing(team, poolIndex){
  qs('#revealTeam').textContent = team ? team.team : '—';
  qs('#revealPool').textContent = team ? `attribuée à la poule ${poolIndex+1}` : '—';
}
function markAssigned(teamId, poolIndex, round){
  state.assigned[teamId] = true;
  const row = qs(`#team-row-${teamId}`);
  if(row) row.classList.add('assigned');

  const poolEl = qs(`.pool[data-pool="${poolIndex}"]`);
  const bodyRows = qsa('tbody tr', poolEl);
  const targetRow = bodyRows[round];
  if(targetRow){
    targetRow.querySelector('.coach-cell').textContent = state.teams[teamId].coach;
    targetRow.querySelector('.team-cell').textContent = state.teams[teamId].team;
    targetRow.querySelector('.coach-cell').classList.remove('muted');
    targetRow.querySelector('.team-cell').classList.remove('muted');
  }
  // mettre à jour l'indicateur de tour affiché (cosmétique)
  const roundEl = qs('.pool-round', poolEl);
  if(roundEl) roundEl.textContent = Math.min(round+1, 4);
}
function resetUI(){
  qsa('#teamsTable tbody tr').forEach(tr => tr.classList.remove('assigned'));
  qsa('.pool tbody tr').forEach(tr => {
    tr.querySelector('.coach-cell').textContent = '—';
    tr.querySelector('.team-cell').textContent = '—';
    tr.querySelector('.coach-cell').classList.add('muted');
    tr.querySelector('.team-cell').classList.add('muted');
  });
  qsa('.pool .pool-round').forEach(el => el.textContent = '1');
  setNowDrawing(null, 0);
}

// --- Logique du tirage par tours ---
function prepareOrder(){
  // permutation aléatoire de 0..23
  state.order = shuffle(Array.from({length:24}, (_,i)=>i));
  state.round = 0;
  state.poolIndex = 0;
}

function nextSlot(){
  // renvoie {round, poolIndex} ou null si terminé
  if(state.round >= 4) return null;
  return { round: state.round, poolIndex: state.poolIndex };
}

function advanceSlotPointer(){
  state.poolIndex++;
  if(state.poolIndex >= 6){
    state.poolIndex = 0;
    state.round++;
  }
}

function pickNext(){
  // Sélectionne l'équipe suivante selon l'ordre et le slot (round, pool)
  const slot = nextSlot();
  if(!slot) return null; // terminé

  // index dans la permutation: round * 6 + poolIndex
  const orderIndex = slot.round * 6 + slot.poolIndex;
  const teamId = state.order[orderIndex];
  const team = state.teams[teamId];
  return { teamId, team, poolIndex: slot.poolIndex, round: slot.round };
}

// --- Animation ---
function startSpin(finalName, callback){
  // Fait défiler des noms rapidement puis s'arrête sur finalName
  const revealTeam = qs('#revealTeam');
  const revealPool = qs('#revealPool');
  let t = 0;
  const spinNames = state.order
    .map(id => state.teams[id].team)
    .filter(n => n !== finalName); // éviter de retomber trop souvent dessus

  clearInterval(state.spinTimer);
  state.spinTimer = setInterval(()=>{
    const name = spinNames[Math.floor(Math.random()*spinNames.length)] || finalName;
    revealTeam.textContent = name;
    t += 60;
  }, 60);

  // durée de spin ~1.2s puis callback
  setTimeout(()=>{
    clearInterval(state.spinTimer);
    revealTeam.textContent = finalName;
    callback();
  }, 1200 + Math.random()*400);
}

function doOneDraw({ animate = true } = {}){
  const pick = pickNext();
  if(!pick){
    stopDrawing();
    finalizeDone();
    return;
  }
  const { teamId, team, poolIndex, round } = pick;
  qs('#revealPool').textContent = `attribuée à la poule ${poolIndex+1}`;

  const reveal = ()=>{
    markAssigned(teamId, poolIndex, round);
    setNowDrawing(team, poolIndex);
    advanceSlotPointer();
    // si on est en mode automatique, on laisse la boucle continuer
  };

  if(animate){
    startSpin(team.team, reveal);
  }else{
    setNowDrawing(team, poolIndex);
    reveal();
  }
}

function startDrawing(){
  if(state.running) return;
  state.running = true;
  setToggleButtonRunning(true);
  // boucle: un tirage toutes ~1.7s (incluant l'animation interne)
  doOneDraw({ animate: true });
  clearInterval(state.mainTimer);
  state.mainTimer = setInterval(()=>{
    doOneDraw({ animate: true });
  }, 1800);
}

function stopDrawing(){
  state.running = false;
  clearInterval(state.mainTimer);
  clearInterval(state.spinTimer);
  setToggleButtonRunning(false);
}

function setToggleButtonRunning(running){
  const btn = qs('#toggleDraw');
  const icon = qs('.icon', btn);
  const label = qs('.label', btn);
  if(running){
    btn.classList.add('danger');
    icon.textContent = '⏸';
    label.textContent = 'Pause';
  }else{
    icon.textContent = '▶';
    label.textContent = "Lancer l'animation";
  }
}

function finalizeDone(){
  const btn = qs('#toggleDraw');
  btn.setAttribute('disabled', 'true');
  qs('#stepOnce').setAttribute('disabled', 'true');
  qs('#revealPool').textContent = 'Tirage terminé';
}

// --- Contrôles ---
function bindControls(){
  qs('#toggleDraw').addEventListener('click', ()=>{
    if(state.running){
      stopDrawing();
    }else{
      startDrawing();
    }
  });
  qs('#stepOnce').addEventListener('click', ()=>{
    if(state.running) return; // éviter conflit
    doOneDraw({ animate: true });
  });
  qs('#reset').addEventListener('click', resetAll);
}

function resetAll(){
  stopDrawing();
  state.assigned = Array(24).fill(false);
  state.pools = Array.from({ length: 6 }, () => []);
  prepareOrder();
  resetUI();
  qs('#toggleDraw').removeAttribute('disabled');
  qs('#stepOnce').removeAttribute('disabled');
}

// --- Initialisation ---
function main(){
  initTeams();
  renderPools();
  renderTeamsList();
  bindControls();
  prepareOrder();
  resetUI();
}
document.addEventListener('DOMContentLoaded', main);
