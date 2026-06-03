/* CricHeros — live scoring engine + Firebase sync */
(function () {
  "use strict";

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const show = (id) => $(id).classList.remove("hide");
  const hide = (id) => $(id).classList.add("hide");
  const toast = (m) => {
    const t = $("toast"); t.textContent = m; t.classList.add("show");
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 1600);
  };
  const code4 = () => {
    const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 4 }, () => c[Math.floor(Math.random() * c.length)]).join("");
  };

  // ---------- state ----------
  let db = null;           // firebase database ref
  let cfg = null;          // firebase config + pin
  let matchRef = null;     // current match db ref
  let M = null;            // match state object (the source of truth)
  let isScorer = false;
  let history = [];        // snapshots for undo (scorer only)

  // ---------- firebase config (localStorage) ----------
  function loadCfg() {
    try { return JSON.parse(localStorage.getItem("crh_cfg") || "null"); } catch { return null; }
  }
  function initFirebase(c) {
    if (firebase.apps && firebase.apps.length) firebase.app();
    else firebase.initializeApp({ apiKey: c.key, databaseURL: c.db, projectId: c.proj });
    db = firebase.database();
  }
  window.saveCfg = function () {
    const c = {
      db: $("cfgDb").value.trim(),
      key: $("cfgKey").value.trim(),
      proj: $("cfgProj").value.trim(),
      pin: $("cfgPin").value.trim(),
    };
    if (!c.db || !c.key || !c.pin) { toast("Fill databaseURL, API key & PIN"); return; }
    localStorage.setItem("crh_cfg", JSON.stringify(c));
    cfg = c; initFirebase(c);
    hide("cfgScreen"); show("home");
    toast("Setup saved");
  };

  // ---------- match model ----------
  // transient rule toggles set on home screen
  const RULES = { wideLegal: false, nbLegal: false };
  window.toggleRule = function (key, btn) {
    RULES[key] = !RULES[key];
    const label = key === "wideLegal" ? "Wide = legal ball: " : "No-ball = legal ball: ";
    btn.textContent = label + (RULES[key] ? "ON" : "OFF");
    btn.classList.toggle("on", RULES[key]);
  };

  function newMatchState(teamA, teamB, overs, batFirst) {
    const batting = batFirst === "A" ? teamA : teamB;
    const bowling = batFirst === "A" ? teamB : teamA;
    return {
      code: code4(),
      teamA, teamB, overs,
      innings: 1,
      target: null,
      done: false, result: "",
      batTeam: batting, bowlTeam: bowling,
      runs: 0, wkts: 0, balls: 0, // legal balls bowled this innings
      batters: {}, // name -> {r,b,f,s,out}
      bowlers: {}, // name -> {balls,runs,wkts,maidens,_overRuns}
      striker: "", nonStriker: "", bowler: "",
      thisOver: [], // strings for current over display
      rules: {
        oversPerBowler: 0,
        wideRuns: 1, nbRuns: 1,
        wideLegal: false, nbLegal: false,
      },
      updated: Date.now(),
    };
  }

  function ensureBatter(n) { if (!M.batters[n]) M.batters[n] = { r: 0, b: 0, f: 0, s: 0, out: false }; }
  function ensureBowler(n) { if (!M.bowlers[n]) M.bowlers[n] = { balls: 0, runs: 0, wkts: 0, maidens: 0, _overRuns: 0 }; }

  // ---------- start / join ----------
  window.startMatch = function () {
    const a = $("teamA").value.trim() || "Team A";
    const b = $("teamB").value.trim() || "Team B";
    let ov = $("oversSel").value;
    ov = ov === "custom" ? Math.max(1, parseInt($("customOv").value || "6", 10)) : parseInt(ov, 10);
    const batFirst = $("tossSel").value;

    M = newMatchState(a, b, ov, batFirst);
    // apply rules from form
    M.rules.oversPerBowler = Math.max(0, parseInt($("oversPerBowler").value || "0", 10));
    M.rules.wideRuns = Math.max(1, parseInt($("wideRuns").value || "1", 10));
    M.rules.nbRuns = Math.max(1, parseInt($("nbRuns").value || "1", 10));
    M.rules.wideLegal = RULES.wideLegal;
    M.rules.nbLegal = RULES.nbLegal;
    // prompt opening players
    const s = prompt("Striker name?", "Batter 1") || "Batter 1";
    const ns = prompt("Non-striker name?", "Batter 2") || "Batter 2";
    const bw = prompt("Opening bowler?", "Bowler 1") || "Bowler 1";
    M.striker = s; M.nonStriker = ns; M.bowler = bw;
    ensureBatter(s); ensureBatter(ns); ensureBowler(bw);

    isScorer = true; history = [];
    matchRef = db.ref("matches/" + M.code);
    matchRef.set(M);
    bindMatchScreen();
    listenMatch();
    toast("Match started — code " + M.code);
  };

  window.joinMatch = function () {
    const c = ($("joinCode").value.trim() || "").toUpperCase();
    if (!c) { toast("Enter match code"); return; }
    isScorer = false;
    matchRef = db.ref("matches/" + c);
    matchRef.get().then((snap) => {
      if (!snap.exists()) { toast("No match with that code"); return; }
      bindMatchScreen();
      listenMatch();
    });
  };

  function bindMatchScreen() {
    hide("home"); show("match");
    $("sbCode").textContent = "CODE " + (M ? M.code : matchRef.key);
    if (isScorer) {
      show("scorerPad");
      const url = location.origin + location.pathname + "?m=" + matchRef.key;
      $("shareUrl").textContent = url;
    } else {
      hide("scorerPad");
    }
  }

  // ---------- realtime listen ----------
  function listenMatch() {
    matchRef.on("value", (snap) => {
      const data = snap.val();
      if (!data) return;
      if (!isScorer) M = data; // viewers mirror remote state
      render(data);
    });
  }

  function push() {
    if (!isScorer || !matchRef) return;
    M.updated = Date.now();
    matchRef.set(M);
  }

  function snapshot() { history.push(JSON.stringify(M)); if (history.length > 40) history.shift(); }

  // ---------- scoring actions ----------
  function legalBall() {
    M.balls++;
    M.batters[M.striker].b++;
    M.bowlers[M.bowler].balls++;
    // end of over?
    if (M.balls % 6 === 0) endOver();
    checkInningsEnd();
  }

  window.ball = function (r) {
    if (guard()) return; snapshot();
    M.runs += r;
    M.batters[M.striker].r += r;
    if (r === 4) M.batters[M.striker].f++;
    if (r === 6) M.batters[M.striker].s++;
    M.bowlers[M.bowler].runs += r;
    M.bowlers[M.bowler]._overRuns += r;
    M.thisOver.push(String(r));
    if (r % 2 === 1) swap();        // odd runs rotate strike
    legalBall();
    push(); maybeToast(r);
  };

  window.wicket = function () {
    if (guard()) return; snapshot();
    M.batters[M.striker].out = true;
    M.wkts++;
    M.bowlers[M.bowler].wkts++;
    M.thisOver.push("W");
    M.bowlers[M.bowler]._overRuns += 0;
    legalBall();
    push();
    if (!M.done) {
      const nb = prompt("New batter name?", "Batter " + (M.wkts + 2));
      if (nb) { ensureBatter(nb); M.striker = nb; push(); }
    }
    toast("Wicket!");
  };

  window.extra = function (type) {
    if (guard()) return; snapshot();
    const r = M.rules || { wideRuns: 1, nbRuns: 1, wideLegal: false, nbLegal: false };
    if (type === "wd") {
      const add = r.wideRuns;
      M.runs += add; M.bowlers[M.bowler].runs += add; M.bowlers[M.bowler]._overRuns += add;
      M.thisOver.push(add > 1 ? "wd" + add : "wd");
      if (r.wideLegal) legalBall();
    } else if (type === "nb") {
      const add = r.nbRuns;
      M.runs += add; M.bowlers[M.bowler].runs += add; M.bowlers[M.bowler]._overRuns += add;
      M.thisOver.push(add > 1 ? "nb" + add : "nb");
      if (r.nbLegal) legalBall();
    } else if (type === "bye") {
      M.runs++; M.thisOver.push("b"); legalBall(); // bye always a legal ball
    }
    push();
  };

  window.swapStrike = function () { if (guard()) return; snapshot(); swap(); push(); };
  function swap() { const t = M.striker; M.striker = M.nonStriker; M.nonStriker = t; }

  window.newBatter = function () {
    if (guard()) return; const n = prompt("Batter name (replaces striker)?"); if (!n) return;
    snapshot(); ensureBatter(n); M.striker = n; push();
  };

  window.newBowler = function () {
    if (guard()) return; const n = prompt("Bowler name?"); if (!n) return;
    snapshot(); ensureBowler(n); M.bowler = n; push();
  };

  function endOver() {
    // maiden check
    const b = M.bowlers[M.bowler];
    if (b._overRuns === 0) b.maidens++;
    b._overRuns = 0;
    swap(); // strike rotates at over end
    if (isScorer && !M.done) {
      const limit = M.rules ? M.rules.oversPerBowler : 0;
      let n = prompt("Next over — bowler name?", "");
      if (n) {
        ensureBowler(n);
        if (limit > 0) {
          const oversBowled = Math.floor(M.bowlers[n].balls / 6);
          if (oversBowled >= limit) {
            toast("⚠ " + n + " has bowled " + oversBowled + "/" + limit + " overs");
          }
        }
        M.bowler = n;
      }
    }
    M.thisOver = [];
  }

  function checkInningsEnd() {
    const maxBalls = M.overs * 6;
    const allOut = M.wkts >= 10;
    const oversDone = M.balls >= maxBalls;
    const chased = M.innings === 2 && M.target != null && M.runs >= M.target;
    if (chased) { finishMatch("chase"); return; }
    if (allOut || oversDone) {
      if (M.innings === 1) startSecondInnings();
      else finishMatch("defend");
    }
  }

  function startSecondInnings() {
    M.target = M.runs + 1;
    const prevBat = M.batTeam;
    M.batTeam = M.bowlTeam; M.bowlTeam = prevBat;
    M.innings = 2; M.runs = 0; M.wkts = 0; M.balls = 0;
    M.batters = {}; M.bowlers = {}; M.thisOver = [];
    push();
    if (isScorer) {
      const s = prompt("2nd innings striker?", "Batter 1") || "Batter 1";
      const ns = prompt("Non-striker?", "Batter 2") || "Batter 2";
      const bw = prompt("Opening bowler?", "Bowler 1") || "Bowler 1";
      M.striker = s; M.nonStriker = ns; M.bowler = bw;
      ensureBatter(s); ensureBatter(ns); ensureBowler(bw); push();
    }
    toast("Innings break — target " + M.target);
  }

  window.endInnings = function () {
    if (guard()) return;
    if (M.innings === 1) { snapshot(); startSecondInnings(); }
    else { snapshot(); finishMatch("manual"); }
  };

  function finishMatch(kind) {
    M.done = true;
    if (M.innings === 2 && M.target != null) {
      if (M.runs >= M.target) M.result = M.batTeam + " won by " + (10 - M.wkts) + " wkts";
      else if (M.runs === M.target - 1) M.result = "Match tied";
      else M.result = M.bowlTeam + " won by " + (M.target - 1 - M.runs) + " runs";
    } else {
      M.result = "Innings ended — " + M.runs + "/" + M.wkts;
    }
    push(); toast(M.result);
  }

  window.undo = function () {
    if (guard()) return;
    if (!history.length) { toast("Nothing to undo"); return; }
    M = JSON.parse(history.pop());
    push(); toast("Undone");
  };

  function guard() {
    if (!isScorer) { toast("View-only mode"); return true; }
    if (M && M.done) { toast("Match finished"); return true; }
    return false;
  }
  function maybeToast(r) { if (r === 4) toast("FOUR!"); else if (r === 6) toast("SIX!"); }

  // ---------- render ----------
  function oversStr(balls) { return Math.floor(balls / 6) + "." + (balls % 6); }
  function render(d) {
    if (!d) return;
    $("sbTeams").textContent = d.batTeam + "  vs  " + d.bowlTeam + "   •   Inns " + d.innings + " / " + d.overs + " ov";
    $("sbScore").innerHTML = d.runs + '<small>/' + d.wkts + "</small>";
    $("sbOvers").textContent = oversStr(d.balls) + " overs";
    const ovDone = d.balls / 6;
    $("sbCrr").textContent = ovDone > 0 ? "CRR " + (d.runs / ovDone).toFixed(2) : "";
    if (d.innings === 2 && d.target != null && !d.done) {
      const need = d.target - d.runs;
      const ballsLeft = d.overs * 6 - d.balls;
      $("sbTarget").textContent = "Need " + need + " off " + ballsLeft + " balls";
    } else if (d.done) {
      $("sbTarget").textContent = d.result;
    } else $("sbTarget").textContent = "";
    $("sbCode").textContent = "CODE " + d.code;

    // batters (show not-out + current)
    const br = $("batRows"); br.innerHTML = "";
    Object.keys(d.batters || {}).forEach((n) => {
      const b = d.batters[n];
      if (b.out || n === d.striker || n === d.nonStriker) {
        const sr = b.b ? ((b.r / b.b) * 100).toFixed(0) : "0";
        const cls = n === d.striker && !d.done ? "strike" : "";
        const nm = b.out ? n + " (out)" : n;
        br.innerHTML += `<tr><td class="${cls}">${nm}</td><td>${b.r}</td><td>${b.b}</td><td>${b.f}</td><td>${b.s}</td><td>${sr}</td></tr>`;
      }
    });

    // bowler (current)
    const wr = $("bowlRows"); wr.innerHTML = "";
    Object.keys(d.bowlers || {}).forEach((n) => {
      const w = d.bowlers[n];
      if (w.balls > 0 || n === d.bowler) {
        const ov = oversStr(w.balls);
        const econ = w.balls ? (w.runs / (w.balls / 6)).toFixed(1) : "0.0";
        const cls = n === d.bowler && !d.done ? "strike" : "";
        wr.innerHTML += `<tr><td class="${cls}">${n}</td><td>${ov}</td><td>${w.maidens}</td><td>${w.runs}</td><td>${w.wkts}</td><td>${econ}</td></tr>`;
      }
    });

    // this over
    const to = $("thisOver");
    if (!d.thisOver || !d.thisOver.length) { to.innerHTML = '<span class="muted">—</span>'; }
    else {
      to.innerHTML = d.thisOver.map((x) => {
        let c = "overball";
        if (x === "W") c += " ob-w";
        else if (x === "4") c += " ob-4";
        else if (x === "6") c += " ob-6";
        else if (x.startsWith("wd") || x.startsWith("nb") || x === "b") c += " ob-x";
        return `<span class="${c}">${x}</span>`;
      }).join("");
    }
  }

  // ---------- share ----------
  window.copyShare = function () {
    const url = $("shareUrl").textContent;
    navigator.clipboard?.writeText(url).then(() => toast("Link copied")).catch(() => toast(url));
  };

  // ---------- nav ----------
  $("reConfig").onclick = () => { hide("home"); show("cfgScreen"); };
  $("leaveMatch").onclick = () => {
    if (matchRef) matchRef.off();
    hide("match"); show("home"); M = null; isScorer = false;
  };

  // ---------- boot ----------
  function boot() {
    cfg = loadCfg();
    if (!cfg) { show("cfgScreen"); return; }
    initFirebase(cfg);
    // deep link viewer?  ?m=CODE
    const params = new URLSearchParams(location.search);
    const m = params.get("m");
    if (m) {
      isScorer = false;
      matchRef = db.ref("matches/" + m.toUpperCase());
      matchRef.get().then((snap) => {
        if (snap.exists()) { M = snap.val(); bindMatchScreen(); listenMatch(); }
        else { toast("Match not found"); show("home"); }
      });
    } else {
      show("home");
    }
  }
  boot();

  // service worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
