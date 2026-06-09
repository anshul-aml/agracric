/* AgraCric v3 — players, teams, tournaments, scoring, career + fielding stats */
(function () {
  "use strict";

  // ====== CONFIG (Firebase web config is public-by-design; safe here) ======
  const FIREBASE = {
    apiKey: "AIzaSyADSARW3ZkX-FjTFz4TYK-TLiXgrUZS9zM",
    authDomain: "agracric.firebaseapp.com",
    databaseURL: "https://agracric-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "agracric",
  };
  const SCORER_PIN = "aml2026"; // CHANGE THIS to your own secret.

  // ====== helpers ======
  const $ = (id) => document.getElementById(id);
  const esc = (s) => (s || "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 1700); };
  const initials = (n) => (n || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const uid = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const code4 = () => { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from({ length: 4 }, () => c[Math.floor(Math.random() * c.length)]).join(""); };
  const oversStr = (b) => Math.floor(b / 6) + "." + (b % 6);

  firebase.initializeApp(FIREBASE);
  const db = firebase.database();

  let players = {}, teams = {}, matches = {}, tournaments = {};
  let scorerOK = false, navStack = ["dash"];

  // ====== nav ======
  const MAIN = ["dash", "matches", "tourneys", "players", "teams", "stats"];
  function show(scr) {
    document.querySelectorAll(".screen").forEach((e) => e.classList.add("hide"));
    $("s-" + scr).classList.remove("hide");
    MAIN.forEach((m) => { const b = $("n-" + m); if (b) b.classList.toggle("on", m === scr); });
    window.scrollTo(0, 0);
  }
  window.go = function (scr) {
    navStack = [scr]; show(scr);
    if (scr === "stats") renderLeaderboards();
    if (scr === "tourneys") renderTournaments();
    if (scr === "players") renderPlayers();
    if (scr === "teams") renderTeams();
    if (scr === "matches") renderMatches();
    if (scr === "dash") renderDash();
  };
  function push(scr) { navStack.push(scr); show(scr); }
  window.back = function () { navStack.pop(); const s = navStack[navStack.length - 1] || "dash"; show(s); };
  function curScreen() { return navStack[navStack.length - 1]; }

  // ====== modal ======
  function modal(title, build) { $("modalTitle").textContent = title; $("modalBody").innerHTML = ""; build($("modalBody")); $("modal").classList.remove("hide"); }
  function closeModal() { $("modal").classList.add("hide"); }
  $("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  function requireScorer(cb) {
    if (scorerOK) return cb();
    modal("Scorer PIN", (b) => {
      b.innerHTML = '<input id="pinIn" type="password" placeholder="Enter scorer PIN" /><button class="grn" id="pinGo">Unlock</button>';
      b.querySelector("#pinGo").onclick = () => { if (b.querySelector("#pinIn").value === SCORER_PIN) { scorerOK = true; closeModal(); cb(); } else toast("Wrong PIN"); };
    });
  }

  // ====== data listeners ======
  function blankStats() {
    return { matches: 0, innings: 0, runs: 0, balls: 0, fours: 0, sixes: 0, notOuts: 0, hs: 0, thirties: 0, fifties: 0, hundreds: 0, ducks: 0,
      ballsBowled: 0, runsConceded: 0, wickets: 0, maidens: 0, bestW: -1, bestR: 9999, catches: 0, runOuts: 0, stumpings: 0 };
  }
  db.ref("players").on("value", (s) => { players = s.val() || {}; if (curScreen() === "players") renderPlayers(); if (curScreen() === "stats") renderLeaderboards(); });
  db.ref("teams").on("value", (s) => { teams = s.val() || {}; if (curScreen() === "teams") renderTeams(); });
  db.ref("tournaments").on("value", (s) => { tournaments = s.val() || {}; if (curScreen() === "tourneys") renderTournaments(); });
  db.ref("matchIndex").on("value", (s) => { matches = s.val() || {}; if (curScreen() === "matches") renderMatches(); if (curScreen() === "dash") renderDash(); });

  const teamName = (id) => (teams[id] && teams[id].name) || "—";
  function roleLabel(r) { return { bat: "Batter", bowl: "Bowler", all: "All-rounder", wk: "Keeper" }[r] || "Player"; }

  // ====== PLAYERS ======
  window.openRegister = function () {
    modal("Register Player", (b) => {
      b.innerHTML = '<label>Name</label><input id="rgName" placeholder="Full name" /><label>Role</label><select id="rgRole"><option value="bat">Batter</option><option value="bowl">Bowler</option><option value="all">All-rounder</option><option value="wk">Wicket-keeper</option></select><button class="grn" id="rgGo">Register</button>';
      b.querySelector("#rgGo").onclick = () => {
        const name = b.querySelector("#rgName").value.trim(); if (!name) { toast("Enter a name"); return; }
        const id = uid(); db.ref("players/" + id).set({ id, name, role: b.querySelector("#rgRole").value, createdAt: Date.now(), stats: blankStats() });
        closeModal(); toast(name + " registered");
      };
    });
  };
  window.renderPlayers = function () {
    const q = ($("playerSearch").value || "").toLowerCase();
    const arr = Object.values(players).filter((p) => p.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
    const el = $("playerList");
    if (!arr.length) { el.innerHTML = '<div class="card mut center">No players yet.</div>'; return; }
    el.innerHTML = '<div class="card">' + arr.map((p) => { const s = p.stats || blankStats(); return `<div class="listitem tap" onclick="openProfile('${p.id}')"><div class="avatar">${initials(p.name)}</div><div class="meta"><b>${esc(p.name)}</b><div>${roleLabel(p.role)} • ${s.matches} mat</div></div><div class="val">${s.runs} runs<br><span class="mut">${s.wickets} wkts</span></div></div>`; }).join("") + "</div>";
  };
  window.openProfile = function (id) {
    const p = players[id]; if (!p) return; const s = p.stats || blankStats();
    $("prAv").textContent = initials(p.name); $("prName").textContent = p.name; $("prRole").textContent = roleLabel(p.role);
    const avg = (s.innings - s.notOuts) > 0 ? (s.runs / (s.innings - s.notOuts)).toFixed(1) : "—";
    const sr = s.balls > 0 ? (s.runs / s.balls * 100).toFixed(1) : "—";
    const box = (v, l) => `<div class="stat-box"><b>${v}</b><span>${l}</span></div>`;
    $("prBat").innerHTML = box(s.runs, "Runs") + box(s.innings, "Innings") + box(s.hs, "High Score") + box(avg, "Average") + box(sr, "Strike Rate") + box(s.fifties + s.hundreds, "50s/100s") + box(s.fours, "Fours") + box(s.sixes, "Sixes");
    const econ = s.ballsBowled > 0 ? (s.runsConceded / (s.ballsBowled / 6)).toFixed(1) : "—";
    const bowlAvg = s.wickets > 0 ? (s.runsConceded / s.wickets).toFixed(1) : "—";
    const best = s.bestW >= 0 ? s.bestW + "/" + s.bestR : "—";
    $("prBowl").innerHTML = box(s.wickets, "Wickets") + box(oversStr(s.ballsBowled), "Overs") + box(best, "Best") + box(econ, "Economy") + box(bowlAvg, "Avg") + box(s.maidens, "Maidens");
    $("prField").innerHTML = box(s.catches, "Catches") + box(s.runOuts, "Run-outs") + box(s.stumpings, "Stumpings");
    push("profile");
  };

  // ====== TEAMS ======
  window.renderTeams = function () {
    const arr = Object.values(teams).sort((a, b) => a.name.localeCompare(b.name)); const el = $("teamList");
    if (!arr.length) { el.innerHTML = '<div class="card mut center">No teams yet.</div>'; return; }
    el.innerHTML = '<div class="card">' + arr.map((t) => `<div class="listitem tap" onclick="openTeam('${t.id}')"><div class="avatar">${initials(t.name)}</div><div class="meta"><b>${esc(t.name)}</b><div>${(t.playerIds || []).length} players</div></div><div class="val mut">›</div></div>`).join("") + "</div>";
  };
  window.openCreateTeam = function () {
    modal("Create Team", (b) => {
      b.innerHTML = '<label>Team name</label><input id="tmName" placeholder="e.g. Daya Royals" /><button class="grn" id="tmGo">Create</button>';
      b.querySelector("#tmGo").onclick = () => { const name = b.querySelector("#tmName").value.trim(); if (!name) { toast("Enter a name"); return; } const id = "t" + Date.now().toString(36); db.ref("teams/" + id).set({ id, name, playerIds: [] }); closeModal(); toast(name + " created"); };
    });
  };
  let curTeam = null;
  window.openTeam = function (id) {
    curTeam = id; const t = teams[id]; if (!t) return; $("tvName").textContent = t.name; const ids = t.playerIds || [];
    $("tvCount").textContent = ids.length + " players";
    $("tvSquad").innerHTML = ids.length ? '<div class="card">' + ids.map((pid) => { const p = players[pid]; if (!p) return ""; return `<div class="listitem"><div class="avatar">${initials(p.name)}</div><div class="meta"><b>${esc(p.name)}</b><div>${roleLabel(p.role)}</div></div><button class="ghost sm" onclick="removeFromTeam('${pid}')">Remove</button></div>`; }).join("") + "</div>" : '<div class="card mut center">No players yet.</div>';
    push("teamview");
  };
  window.addToTeamFlow = function () {
    const t = teams[curTeam]; const have = new Set(t.playerIds || []);
    const avail = Object.values(players).filter((p) => !have.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
    modal("Add Player to " + t.name, (b) => {
      let html = avail.map((p) => `<button class="pickbtn" onclick="window._pick('${p.id}')"><span class="avatar" style="width:32px;height:32px;font-size:12px">${initials(p.name)}</span> ${esc(p.name)} <span class="mut" style="margin-left:auto;font-size:12px">${roleLabel(p.role)}</span></button>`).join("");
      html += '<hr/><button class="ghost" onclick="window._newPlayerToTeam()">＋ New player (quick add)</button>';
      b.innerHTML = html || '<p class="mut">All players already added.</p><hr/><button class="ghost" onclick="window._newPlayerToTeam()">＋ New player</button>';
    });
  };
  window._pick = function (pid) { const list = (teams[curTeam].playerIds || []).slice(); list.push(pid); db.ref("teams/" + curTeam + "/playerIds").set(list); closeModal(); toast("Added"); setTimeout(() => openTeam(curTeam), 250); };
  window._newPlayerToTeam = function () { const name = prompt("Player name?"); if (!name) return; const id = uid(); db.ref("players/" + id).set({ id, name: name.trim(), role: "all", createdAt: Date.now(), stats: blankStats() }).then(() => window._pick(id)); };
  window.removeFromTeam = function (pid) { const list = (teams[curTeam].playerIds || []).filter((x) => x !== pid); db.ref("teams/" + curTeam + "/playerIds").set(list); setTimeout(() => openTeam(curTeam), 200); };

  // ====== TOURNAMENTS ======
  window.renderTournaments = function () {
    const arr = Object.values(tournaments).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); const el = $("tourneyList");
    if (!arr.length) { el.innerHTML = '<div class="card mut center">No tournaments yet. Create AML 2.0!</div>'; return; }
    el.innerHTML = '<div class="card">' + arr.map((t) => `<div class="listitem tap" onclick="openTournament('${t.id}')"><div class="avatar">${initials(t.name)}</div><div class="meta"><b>${esc(t.name)}</b><div>${(t.teamIds || []).length} teams</div></div><div class="val mut">›</div></div>`).join("") + "</div>";
  };
  window.openCreateTournament = function () {
    const tArr = Object.values(teams);
    modal("Create Tournament", (b) => {
      let html = '<label>Tournament name</label><input id="tnName" placeholder="e.g. AML 2.0" /><label>Select teams</label>';
      html += tArr.length ? tArr.map((t) => `<button class="pickbtn" data-id="${t.id}" onclick="this.classList.toggle('on')"><span class="avatar" style="width:30px;height:30px;font-size:11px">${initials(t.name)}</span> ${esc(t.name)}</button>`).join("") : '<p class="mut">Create teams first.</p>';
      html += '<button class="grn mt" id="tnGo">Create</button>';
      b.innerHTML = html;
      b.querySelector("#tnGo").onclick = () => {
        const name = b.querySelector("#tnName").value.trim(); if (!name) { toast("Enter a name"); return; }
        const teamIds = Array.from(b.querySelectorAll(".pickbtn.on")).map((x) => x.getAttribute("data-id"));
        const id = "tn" + Date.now().toString(36); db.ref("tournaments/" + id).set({ id, name, teamIds, createdAt: Date.now() });
        closeModal(); toast(name + " created");
      };
    });
  };
  window.openTournament = function (id) {
    const t = tournaments[id]; if (!t) return;
    $("tnvName").textContent = t.name; $("tnvMeta").textContent = (t.teamIds || []).length + " teams";
    // standings
    const S = {}; (t.teamIds || []).forEach((tid) => { S[tid] = { teamId: tid, p: 0, w: 0, l: 0, ti: 0, pts: 0, rf: 0, of: 0, ra: 0, oa: 0 }; });
    const tMatches = Object.values(matches).filter((m) => m.tournamentId === id && m.done);
    tMatches.forEach((m) => {
      const a = m.teamAId, b = m.teamBId; const inns = m.summary || [];
      let aFor = null, bFor = null; inns.forEach((i) => { if (i.batTeamId === a) aFor = i; if (i.batTeamId === b) bFor = i; });
      if (S[a]) { S[a].p++; if (aFor) { S[a].rf += aFor.runs; S[a].of += aFor.eff; } if (bFor) { S[a].ra += bFor.runs; S[a].oa += bFor.eff; } }
      if (S[b]) { S[b].p++; if (bFor) { S[b].rf += bFor.runs; S[b].of += bFor.eff; } if (aFor) { S[b].ra += aFor.runs; S[b].oa += aFor.eff; } }
      if (m.winnerId === "tie") { if (S[a]) { S[a].ti++; S[a].pts++; } if (S[b]) { S[b].ti++; S[b].pts++; } }
      else if (S[m.winnerId]) { S[m.winnerId].w++; S[m.winnerId].pts += 2; const loser = m.winnerId === a ? b : a; if (S[loser]) S[loser].l++; }
    });
    const rows = Object.values(S).map((s) => { s.nrr = (s.of > 0 ? s.rf / s.of : 0) - (s.oa > 0 ? s.ra / s.oa : 0); return s; }).sort((x, y) => y.pts - x.pts || y.nrr - x.nrr);
    $("tnvStandings").innerHTML = rows.length ? rows.map((s) => `<tr><td>${esc(teamName(s.teamId))}</td><td>${s.p}</td><td>${s.w}</td><td>${s.l}</td><td><b>${s.pts}</b></td><td>${s.nrr >= 0 ? "+" : ""}${s.nrr.toFixed(2)}</td></tr>`).join("") : '<tr><td colspan="6" class="mut">No completed matches yet.</td></tr>';
    // matches list
    $("tnvMatches").innerHTML = tMatches.length || Object.values(matches).some((m) => m.tournamentId === id) ?
      '<div class="card">' + Object.values(matches).filter((m) => m.tournamentId === id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map(matchRow).join("") + "</div>"
      : '<div class="card mut center">No matches yet. Start one and pick this tournament.</div>';
    // caps (fetch full matches for player aggregation)
    $("tnvOrange").innerHTML = '<span class="mut">Loading…</span>'; $("tnvPurple").innerHTML = "";
    computeCaps(id);
    push("tourview");
  };
  function computeCaps(id) {
    const codes = Object.values(matches).filter((m) => m.tournamentId === id && m.done).map((m) => m.code);
    if (!codes.length) { $("tnvOrange").innerHTML = '<span class="mut">No data yet.</span>'; return; }
    Promise.all(codes.map((c) => db.ref("matches/" + c).get().then((s) => s.val()).catch(() => null))).then((arr) => {
      const bat = {}, bowl = {};
      arr.filter(Boolean).forEach((m) => (m.innings || []).forEach((inn) => {
        Object.values(inn.batters || {}).forEach((b) => { bat[b.id] = (bat[b.id] || { name: b.name, v: 0 }); bat[b.id].v += b.r; });
        Object.values(inn.bowlers || {}).forEach((w) => { bowl[w.id] = (bowl[w.id] || { name: w.name, v: 0 }); bowl[w.id].v += w.wkts; });
      }));
      const top = (obj) => Object.values(obj).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 5);
      const fmt = (list, unit) => list.length ? list.map((x, i) => `<div class="listitem"><div class="mut" style="width:18px">${i + 1}</div><div class="avatar" style="width:30px;height:30px;font-size:11px">${initials(x.name)}</div><div class="meta"><b>${esc(x.name)}</b></div><div class="val"><b>${x.v}</b> ${unit}</div></div>`).join("") : '<span class="mut">No data.</span>';
      $("tnvOrange").innerHTML = fmt(top(bat), "runs"); $("tnvPurple").innerHTML = fmt(top(bowl), "wkts");
    });
  }

  // ====== MATCH LIST ======
  window.renderMatches = function () {
    const arr = Object.values(matches).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); const el = $("matchList");
    if (!arr.length) { el.innerHTML = '<div class="card mut center">No matches yet.</div>'; return; }
    el.innerHTML = '<div class="card">' + arr.map(matchRow).join("") + "</div>";
  };
  function renderDash() {
    const arr = Object.values(matches).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6);
    $("dashMatches").innerHTML = arr.length ? '<div class="card">' + arr.map(matchRow).join("") + "</div>" : '<div class="card mut center">No matches yet. Start one above!</div>';
  }
  function matchRow(m) {
    const status = m.done ? (m.result || "Completed") : "● LIVE";
    const act = m.done ? `viewCard('${m.code}')` : `openMatch('${m.code}')`;
    const tn = m.tournamentId && tournaments[m.tournamentId] ? `<span class="mut"> • ${esc(tournaments[m.tournamentId].name)}</span>` : "";
    return `<div class="listitem tap" onclick="${act}"><div class="meta"><b>${esc(m.teamAName)} vs ${esc(m.teamBName)}</b><div class="${m.done ? "mut" : ""}">${esc(status)}${tn}</div></div><div class="val mut">${m.code}</div></div>`;
  }

  // ====== MATCH MODEL ======
  let M = null, matchRef = null, isScorer = false, history = [];
  let pend = null; // pending setup before toss
function inningsObj(bId, bName, wId, wName) {
  return {
    batTeamId: bId,
    batTeamName: bName,
    bowlTeamId: wId,
    bowlTeamName: wName,

    runs: 0,
    wkts: 0,
    balls: 0,

    extras: {
      wd: 0,
      nb: 0,
      bye: 0,
      lb: 0
    },

    batters: {},
    bowlers: {}
  };
}
  function curInn() { return M.innings[M.cur]; }
  function ensureBat(inn, id, name) { if (!inn.batters[id]) inn.batters[id] = { id, name, r: 0, b: 0, f: 0, s: 0, out: false, outType: "", outBy: "", outBowler: "" }; }
  function ensureBowl(inn, id, name) { if (!inn.bowlers[id]) inn.bowlers[id] = { id, name, balls: 0, runs: 0, wkts: 0, maidens: 0, _ov: 0 }; }

  window.newMatchFlow = function () {
    requireScorer(() => {
      const tArr = Object.values(teams);
      if (tArr.length < 2) { toast("Create at least 2 teams first"); go("teams"); return; }
      const opts = tArr.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
      $("suTeamA").innerHTML = opts; $("suTeamB").innerHTML = opts; if (tArr[1]) $("suTeamB").value = tArr[1].id;
      const tnArr = Object.values(tournaments);
      $("suTourney").innerHTML = '<option value="">— Casual match —</option>' + tnArr.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
      push("setup");
    });
  };
  $("suOvers").addEventListener("change", function () { $("suCustomBox").classList.toggle("hide", this.value !== "custom"); });

  window.gotoToss = function () {
    const aId = $("suTeamA").value, bId = $("suTeamB").value;
    if (aId === bId) { toast("Pick two different teams"); return; }
    const a = teams[aId], b = teams[bId];
    if (!(a.playerIds || []).length || !(b.playerIds || []).length) { toast("Both teams need players"); return; }
    let ov = $("suOvers").value; ov = ov === "custom" ? Math.max(1, parseInt($("suCustom").value || "6", 10)) : parseInt(ov, 10);
    pend = { a, b, ov, tournamentId: $("suTourney").value || null,
      rules: { oversPerBowler: Math.max(0, parseInt($("suOPB").value || "0", 10)), wideRuns: Math.max(1, parseInt($("suWide").value || "1", 10)), nbRuns: Math.max(1, parseInt($("suNB").value || "1", 10)) },
      toss: { winner: null, decision: null } };
    $("tossA").textContent = a.name; $("tossB").textContent = b.name;
    ["tossA", "tossB", "tossBat", "tossBowl"].forEach((x) => $(x).classList.remove("on"));
    push("toss");
  };
  window.setToss = function (w) { pend.toss.winner = w; $("tossA").classList.toggle("on", w === "A"); $("tossB").classList.toggle("on", w === "B"); };
  window.setDecision = function (d) { pend.toss.decision = d; $("tossBat").classList.toggle("on", d === "bat"); $("tossBowl").classList.toggle("on", d === "bowl"); };

  window.confirmToss = function () {
    if (!pend.toss.winner || !pend.toss.decision) { toast("Set toss winner & choice"); return; }
    const A = pend.a, B = pend.b;
    const winnerTeam = pend.toss.winner === "A" ? A : B, loserTeam = pend.toss.winner === "A" ? B : A;
    const batTeam = pend.toss.decision === "bat" ? winnerTeam : loserTeam;
    const bowlTeam = pend.toss.decision === "bat" ? loserTeam : winnerTeam;
    M = {
      code: code4(), createdAt: Date.now(), tournamentId: pend.tournamentId,
      teamAId: A.id, teamBId: B.id, teamAName: A.name, teamBName: B.name, overs: pend.ov, rules: pend.rules,
      toss: { winnerName: winnerTeam.name, decision: pend.toss.decision },
      innings: [inningsObj(batTeam.id, batTeam.name, bowlTeam.id, bowlTeam.name)], cur: 0,
      striker: null, nonStriker: null, bowler: null, thisOver: [],
      target: null, done: false, result: "", winnerId: null, summary: null, statsApplied: false, updated: Date.now(),
    };
    isScorer = true; history = []; matchRef = db.ref("matches/" + M.code);
    pickFromTeam(batTeam.id, "Select striker", (s) => {
      M.striker = s; ensureBat(curInn(), s.id, s.name);
      pickFromTeam(batTeam.id, "Select non-striker", (ns) => {
        M.nonStriker = ns; ensureBat(curInn(), ns.id, ns.name);
        pickFromTeam(bowlTeam.id, "Opening bowler", (bw) => {
          M.bowler = bw; ensureBowl(curInn(), bw.id, bw.name);
          matchRef.set(M); db.ref("matchIndex/" + M.code).set(indexEntry());
          openMatchScreen(); listenMatch(); toast("Match started — " + M.code);
        });
      }, [s.id]);
    });
  };
  function indexEntry() { return { code: M.code, teamAName: M.teamAName, teamBName: M.teamBName, teamAId: M.teamAId, teamBId: M.teamBId, createdAt: M.createdAt, done: M.done, result: M.result, tournamentId: M.tournamentId }; }

  function pickFromTeam(teamId, title, cb, excludeIds) {
    const t = teams[teamId]; const ex = new Set(excludeIds || []); const ids = (t.playerIds || []).filter((id) => !ex.has(id));
    modal(title, (b) => {
      let html = ids.map((id) => { const p = players[id]; if (!p) return ""; return `<button class="pickbtn" onclick="window._pf('${id}')"><span class="avatar" style="width:32px;height:32px;font-size:12px">${initials(p.name)}</span> ${esc(p.name)}</button>`; }).join("");
      html += '<hr/><button class="ghost" onclick="window._pfNew(\'' + teamId + '\')">＋ New player</button>'; b.innerHTML = html;
    });
    window._pf = (id) => { closeModal(); cb({ id, name: players[id].name }); };
    window._pfNew = (tid) => { const name = prompt("Player name?"); if (!name) return; const id = uid(); db.ref("players/" + id).set({ id, name: name.trim(), role: "all", createdAt: Date.now(), stats: blankStats() }).then(() => { const list = (teams[tid].playerIds || []).slice(); list.push(id); db.ref("teams/" + tid + "/playerIds").set(list); closeModal(); cb({ id, name: name.trim() }); }); };
  }

  window.openMatch = function (code) {
    matchRef = db.ref("matches/" + code);
    matchRef.get().then((snap) => { if (!snap.exists()) { toast("Match not found"); return; } M = snap.val(); isScorer = scorerOK && !M.done; openMatchScreen(); listenMatch(); });
  };
  function openMatchScreen() { push("match"); $("mShare").textContent = location.origin + location.pathname + "?m=" + M.code; $("mScorer").classList.toggle("hide", !isScorer); }
  function listenMatch() { matchRef.off(); matchRef.on("value", (s) => { const d = s.val(); if (!d) return; if (!isScorer) M = d; renderMatch(d); }); }
  window.leaveMatch = function () { if (matchRef) matchRef.off(); go("matches"); };
  function save() { if (!isScorer || !matchRef) return; M.updated = Date.now(); matchRef.set(M); }
  function snap() { history.push(JSON.stringify(M)); if (history.length > 50) history.shift(); }
  function guard() { if (!isScorer) { toast("View-only"); return true; } if (M.done) { toast("Match finished"); return true; } return false; }
  function swap() { const t = M.striker; M.striker = M.nonStriker; M.nonStriker = t; }
function legalBall() {
  const inn = curInn();

  inn.balls++;
  inn.batters[M.striker.id].b++;
  inn.bowlers[M.bowler.id].balls++;

  checkEnd();

  if (!M.done && inn.balls % 6 === 0) {
    endOver();
  }
}

  window.ball = function (r) {
    if (!M.bowler) {
  toast("Select bowler first");
  return;
}
    if (guard()) return; snap(); const inn = curInn(); const bt = inn.batters[M.striker.id]; const bw = inn.bowlers[M.bowler.id];
    inn.runs += r; bt.r += r; if (r === 4) bt.f++; if (r === 6) bt.s++; bw.runs += r; bw._ov += r; M.thisOver.push(String(r));
    if (r % 2 === 1) swap(); legalBall(); save(); if (r === 4) toast("FOUR!"); else if (r === 6) toast("SIX!");
  };

  // dismissal flow
  window.wicket = function () { if (guard()) return; openDismissal(); };
  function openDismissal() {
    modal("How out?", (b) => {
      const types = [["bowled", "Bowled"], ["caught", "Caught"], ["lbw", "LBW"], ["runout", "Run out"], ["stumped", "Stumped"], ["hitwicket", "Hit wicket"]];
      b.innerHTML = types.map((t) => `<button class="pickbtn" onclick="window._dis('${t[0]}')">${t[1]}</button>`).join("");
    });
  }
  window._dis = function (type) {
    closeModal(); const inn = curInn();
    if (type === "caught" || type === "runout" || type === "stumped") pickFromTeam(inn.bowlTeamId, "Fielder", (f) => completeWicket(type, f.id));
    else completeWicket(type, null);
  };
  function completeWicket(type, fielderId) {
    snap(); const inn = curInn(); const st = inn.batters[M.striker.id];
    st.out = true; st.outType = type; st.outBowler = M.bowler.id; if (fielderId) st.outBy = fielderId;
    inn.wkts++; if (type !== "runout") inn.bowlers[M.bowler.id].wkts++; M.thisOver.push("W"); toast("Wicket!");
    if (inn.wkts >= 10) { legalBall(); save(); return; }
    const batted = Object.keys(inn.batters);
    pickFromTeam(inn.batTeamId, "New batter", (nb) => { ensureBat(inn, nb.id, nb.name); M.striker = nb; legalBall(); save(); }, batted.concat([M.nonStriker.id]));
  }
window.extra = function(type){

    if (guard()) return;

    snap();

    const inn = curInn();
    const bw = inn.bowlers[M.bowler.id];

    // WIDE
    if(type === "wd"){

        let extraRuns = parseInt(
            prompt(
                "Additional runs after wide?\n\n0 = only wide\n1 = wide + run\n4 = wide boundary",
                "0"
            )
        );

        if(isNaN(extraRuns)) return;

        const total = 1 + extraRuns;
      if (extraRuns % 2 === 1) {
    swap();
}

        inn.runs += total;
      inn.extras.wd += total;
        bw.runs += total;
        bw._ov += total;

        M.thisOver.push(
            extraRuns === 0
                ? "WD"
                : "WD+" + extraRuns
        );

        save();
        return;
    }

    // NO BALL FROM BAT
    if(type === "nb"){

        let batRuns = parseInt(
            prompt(
                "Runs scored from bat?\n\n0 1 2 3 4 6",
                "0"
            )
        );

        if(isNaN(batRuns)) return;

        const bt = inn.batters[M.striker.id];

        inn.runs += 1 + batRuns;
      inn.extras.nb += 1;

        bt.r += batRuns;

        if(batRuns === 4) bt.f++;
        if(batRuns === 6) bt.s++;

        bw.runs += 1 + batRuns;
        bw._ov += 1 + batRuns;

        M.thisOver.push(
            batRuns === 0
                ? "NB"
                : "NB+" + batRuns
        );

        save();
        return;
    }

    // BYE
    if(type === "bye"){

        let runs = parseInt(
            prompt("Bye runs? (1-4)", "1")
        );

        if(isNaN(runs) || runs < 1) return;

        inn.runs += runs;
      inn.extras.bye += runs;
      if (runs % 2 === 1) {
    swap();
}

        M.thisOver.push("B" + runs);

        legalBall();

        save();
        return;
    }

    // LEG BYE
    if(type === "lb"){

        let runs = parseInt(
            prompt("Leg bye runs? (1-4)", "1")
        );

        if(isNaN(runs) || runs < 1) return;

        inn.runs += runs;
      inn.extras.lb += runs;
      if (runs % 2 === 1) {
    swap();
}

        M.thisOver.push("LB" + runs);

        legalBall();

        save();
        return;
    }
};
  
  window.addRuns = function () { if (guard()) return; const n = parseInt(prompt("Bonus/penalty runs to add to batting side?", "5") || "0", 10); if (!n) return; snap(); curInn().runs += n; M.thisOver.push("+" + n); save(); toast("+" + n + " runs"); };
  window.swapStrike = function () { if (guard()) return; snap(); swap(); save(); };
  window.changeBowler = function () { if (guard()) return; const inn = curInn(); pickFromTeam(inn.bowlTeamId, "Select bowler", (bw) => { snap(); ensureBowl(inn, bw.id, bw.name); if (M.rules.oversPerBowler > 0) { const o = Math.floor(inn.bowlers[bw.id].balls / 6); if (o >= M.rules.oversPerBowler) toast("⚠ " + bw.name + " at over limit"); } M.bowler = bw; save(); }); };

  function endOver() {
    const inn = curInn(); const bw = inn.bowlers[M.bowler.id]; if (bw._ov === 0) bw.maidens++; bw._ov = 0; swap();M.bowler = null;
    if (isScorer && !M.done) pickFromTeam(inn.bowlTeamId, "Next over — bowler", (nb) => { ensureBowl(inn, nb.id, nb.name); if (M.rules.oversPerBowler > 0) { const o = Math.floor(inn.bowlers[nb.id].balls / 6); if (o >= M.rules.oversPerBowler) toast("⚠ " + nb.name + " at over limit"); } M.bowler = nb; save(); });
    M.thisOver = [];
  }
  function checkEnd() {
    const inn = curInn(); const maxB = M.overs * 6;
    if (M.cur === 1 && M.target != null && inn.runs >= M.target) return finish();
    if (inn.wkts >= 10 || inn.balls >= maxB) { if (M.cur === 0) secondInnings(); else finish(); }
  }
  function secondInnings() {
    M.target = curInn().runs + 1; const prev = curInn();
    M.innings.push(inningsObj(prev.bowlTeamId, prev.bowlTeamName, prev.batTeamId, prev.batTeamName)); M.cur = 1; M.thisOver = []; save();
    if (isScorer) { const inn = curInn(); pickFromTeam(inn.batTeamId, "2nd inns — striker", (s) => { M.striker = s; ensureBat(inn, s.id, s.name); pickFromTeam(inn.batTeamId, "Non-striker", (ns) => { M.nonStriker = ns; ensureBat(inn, ns.id, ns.name); pickFromTeam(inn.bowlTeamId, "Opening bowler", (bw) => { M.bowler = bw; ensureBowl(inn, bw.id, bw.name); save(); }); }, [s.id]); }); }
    toast("Innings break — target " + M.target);
  }
  window.endInnings = function () { if (guard()) return; if (M.cur === 0) { snap(); secondInnings(); } else { snap(); finish(); } };

  function finish() {
    M.done = true; const inn = curInn();
    if (M.cur === 1 && M.target != null) {
      if (inn.runs >= M.target) { M.result = inn.batTeamName + " won by " + (10 - inn.wkts) + " wkts"; M.winnerId = inn.batTeamId; }
      else if (inn.runs === M.target - 1) { M.result = "Match tied"; M.winnerId = "tie"; }
      else { M.result = inn.bowlTeamName + " won by " + (M.target - 1 - inn.runs) + " runs"; M.winnerId = inn.bowlTeamId; }
    } else { M.result = "Innings ended"; M.winnerId = null; }
    M.summary = M.innings.map((i) => ({ batTeamId: i.batTeamId, runs: i.runs, eff: (i.wkts >= 10 ? M.overs : i.balls / 6) }));
    applyStats(); save();
    db.ref("matchIndex/" + M.code).update({ done: true, result: M.result, winnerId: M.winnerId, summary: M.summary });
    toast(M.result);
  }
  window.undo = function () { if (guard()) return; if (!history.length) { toast("Nothing to undo"); return; } M = JSON.parse(history.pop()); save(); toast("Undone"); };

  function applyStats() {
    if (M.statsApplied) return; const touched = {};
    M.innings.forEach((inn) => {
      Object.values(inn.batters || {}).forEach((bt) => {
        const p = players[bt.id]; if (!p) return; const s = p.stats || blankStats();
        s.innings++; s.runs += bt.r; s.balls += bt.b; s.fours += bt.f; s.sixes += bt.s;
        if (!bt.out) s.notOuts++; if (bt.r > s.hs) s.hs = bt.r;
        if (bt.r >= 100) s.hundreds++; else if (bt.r >= 50) s.fifties++; else if (bt.r >= 30) s.thirties++;
        if (bt.r === 0 && bt.out) s.ducks++;
        // fielding credit to the fielder
        if (bt.outBy && players[bt.outBy]) { const fp = players[bt.outBy]; fp.stats = fp.stats || blankStats(); if (bt.outType === "caught") fp.stats.catches++; else if (bt.outType === "runout") fp.stats.runOuts++; else if (bt.outType === "stumped") fp.stats.stumpings++; touched[bt.outBy] = fp; }
        p.stats = s; touched[bt.id] = p;
      });
      Object.values(inn.bowlers || {}).forEach((bw) => {
        const p = players[bw.id]; if (!p) return; const s = p.stats || blankStats();
        s.ballsBowled += bw.balls; s.runsConceded += bw.runs; s.wickets += bw.wkts; s.maidens += bw.maidens;
        if (bw.wkts > s.bestW || (bw.wkts === s.bestW && bw.runs < s.bestR)) { s.bestW = bw.wkts; s.bestR = bw.runs; }
        p.stats = s; touched[bw.id] = p;
      });
    });
    Object.values(touched).forEach((p) => { p.stats.matches++; db.ref("players/" + p.id + "/stats").set(p.stats); });
    M.statsApplied = true;
  }

  function renderMatch(d) {
    const inn = d.innings[d.cur];
     let partnershipRuns = 0;
let partnershipBalls = 0;
    Object.values(inn.batters || {}).forEach((b) => {

    if (!b.out) {

        partnershipRuns += b.r;
        partnershipBalls += b.b;
    }

});
    $("mTeams").textContent = inn.batTeamName + " vs " + inn.bowlTeamName + "  •  Inns " + (d.cur + 1) + " / " + d.overs + " ov";
    $("mScore").innerHTML = inn.runs + '<small>/' + inn.wkts + "</small>"; $("mOvers").textContent = oversStr(inn.balls) + " overs";
    const od = inn.balls / 6; $("mCrr").innerHTML =
    (od > 0
        ? "CRR " + (inn.runs / od).toFixed(2)
        : "")
    +
    "<br>Partnership "
    +
    partnershipRuns
    +
    " ("
    +
    partnershipBalls
    +
    ")";
    $("mToss").textContent = d.toss && d.toss.winnerName ? d.toss.winnerName + " won toss, chose to " + d.toss.decision : "";
    if (d.cur === 1 && d.target != null && !d.done) {

    const need = d.target - inn.runs;
    const bl = d.overs * 6 - inn.balls;

    let rrr = 0;

    if (bl > 0) {
        rrr = (need * 6 / bl).toFixed(2);
    }

    $("mTarget").innerHTML =
        "Need " + need +
        " off " + bl +
        "<br><small>RRR " + rrr + "</small>";
}
    else if (d.done) $("mTarget").textContent = d.result; else $("mTarget").textContent = "";
    $("mCode").textContent = "CODE " + d.code;
   
   const sId = d.striker && d.striker.id;
const nsId = d.nonStriker && d.nonStriker.id;
    const br = $("mBat"); br.innerHTML = "";
    Object.values(inn.batters || {}).forEach((b) => { if (b.out || b.id === sId || b.id === nsId) { const sr = b.b ? (b.r / b.b * 100).toFixed(0) : "0"; const cls = b.id === sId && !d.done ? "strike" : ""; br.innerHTML += `<tr><td class="${cls}">${esc(b.name)}${b.out ? " (out)" : ""}</td><td>${b.r}</td><td>${b.b}</td><td>${b.f}</td><td>${b.s}</td><td>${sr}</td></tr>`; } });
    const wId = d.bowler && d.bowler.id; const wr = $("mBowl"); wr.innerHTML = "";
    Object.values(inn.bowlers || {}).forEach((w) => { if (w.balls > 0 || w.id === wId) { const econ = w.balls ? (w.runs / (w.balls / 6)).toFixed(1) : "0.0"; const cls = w.id === wId && !d.done ? "strike" : ""; wr.innerHTML += `<tr><td class="${cls}">${esc(w.name)}</td><td>${oversStr(w.balls)}</td><td>${w.maidens}</td><td>${w.runs}</td><td>${w.wkts}</td><td>${econ}</td></tr>`; } });
    const to = $("mOver"); to.innerHTML = (d.thisOver && d.thisOver.length) ? d.thisOver.map((x) => { let c = "overball"; if (x === "W") c += " ob-w"; else if (x === "4") c += " ob-4"; else if (x === "6") c += " ob-6"; else if (x.startsWith("wd") || x.startsWith("nb") || x === "b" || x === "lb" || x.startsWith("+")) c += " ob-x"; return `<span class="${c}">${x}</span>`; }).join("") : '<span class="mut">—</span>';
  }

  window.viewCard = function (code) {
    db.ref("matches/" + code).get().then((s) => {
      if (!s.exists()) { toast("Not found"); return; } const d = s.val();
      let html = `<div class="card sb"><div class="teams">${esc(d.teamAName)} vs ${esc(d.teamBName)}</div><div class="big" style="font-size:22px">${esc(d.result || "Completed")}</div><div class="mt"><span class="pill">${d.code}</span></div></div>`;
      (d.innings || []).forEach((inn) => {
html += `<div class="card"><h3 style="font-size:15px;margin-bottom:8px">${esc(inn.batTeamName)} — ${inn.runs}/${inn.wkts} <span class="mut">(${oversStr(inn.balls)})</span></h3>`;

const ex = inn.extras || {
  wd: 0,
  nb: 0,
  bye: 0,
  lb: 0
};

html += `
<div class="mut" style="margin-bottom:10px">
  Extras ${ex.wd + ex.nb + ex.bye + ex.lb}
  (Wd ${ex.wd}, Nb ${ex.nb}, B ${ex.bye}, Lb ${ex.lb})
</div>
`;

html += `<table class="stat-tbl"><thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead><tbody>`;
        Object.values(inn.batters || {}).forEach((b) => { const sr = b.b ? (b.r / b.b * 100).toFixed(0) : "0"; html += `<tr><td>${esc(b.name)}${b.out ? "" : " *"}</td><td>${b.r}</td><td>${b.b}</td><td>${b.f}</td><td>${b.s}</td><td>${sr}</td></tr>`; });
        html += '</tbody></table><hr/><table class="stat-tbl"><thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th></tr></thead><tbody>';
        Object.values(inn.bowlers || {}).forEach((w) => { html += `<tr><td>${esc(w.name)}</td><td>${oversStr(w.balls)}</td><td>${w.maidens}</td><td>${w.runs}</td><td>${w.wkts}</td></tr>`; });
        html += "</tbody></table></div>";
      });
      $("cardBody").innerHTML = html; push("card");
    });
  };

  function renderLeaderboards() {
    const arr = Object.values(players);
    const top = (key, fmt) => { const s = arr.filter((p) => p.stats && p.stats[key] > 0).sort((a, b) => b.stats[key] - a.stats[key]).slice(0, 10); return s.length ? s.map((p, i) => `<div class="listitem"><div class="mut" style="width:20px">${i + 1}</div><div class="avatar" style="width:34px;height:34px;font-size:12px">${initials(p.name)}</div><div class="meta"><b>${esc(p.name)}</b></div><div class="val"><b>${fmt(p.stats)}</b></div></div>`).join("") : '<div class="mut center">No data yet.</div>'; };
    $("lbRuns").innerHTML = top("runs", (s) => s.runs); $("lbWkts").innerHTML = top("wickets", (s) => s.wickets); $("lbSixes").innerHTML = top("sixes", (s) => s.sixes);
  }

  function boot() {
    const m = new URLSearchParams(location.search).get("m");
    if (m) { isScorer = false; openMatch(m.toUpperCase()); } else { go("dash"); }
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  setTimeout(boot, 300);
})();
