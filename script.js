/* ProLab Performance — Tabs + UI polish + Features
   Requisitos implementados:
   - Preserva: header, hero, objectives, plano dinâmico, IMC, HIIT (30s loop), toast, back-to-top, reveal, parallax
   - Layout por abas (ARIA tablist) + persistência (localStorage) + deep-link (hash)
   - IMC corrigido (vírgula/ponto, validação, zero, aria-live)
   - Planos: nível + rotina semanal + export/print
   - Ferramentas: IMC, HIIT ring SVG, checklist semanal persistida, quiz 3 perguntas (feedback imediato)
   - Perfil: form persistida, prefill IMC, stats (IMC, objetivo, nível)
   - Performance: IntersectionObserver (reveal + nav ativa), rAF (scroll/parallax)
   - A11y: teclado para tabs, radiogroups, Esc para menu mobile, focus management
*/

(() => {
  "use strict";

  /* -----------------------------
     Helpers
  ------------------------------ */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const STORAGE = {
    activeTab: "prolab.activeTab",
    objective: "prolab.selectedObjective",
    planLevel: "prolab.planLevel",
    profile: "prolab.profile",
    checklistPrefix: "prolab.checklist.", // + weekKey
  };

  const safeJSONParse = (s, fallback) => {
    try { return JSON.parse(s); } catch { return fallback; }
  };
  const loadJSON = (key, fallback = null) => safeJSONParse(localStorage.getItem(key), fallback);
  const saveJSON = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  // Pt-PT decimal parsing: accepts "1,75", "1.75", and "1.234,56"
  function parseLocaleNumber(input) {
    const raw = String(input ?? "").trim();
    if (!raw) return null;

    let s = raw.replace(/\s+/g, "");
    const hasDot = s.includes(".");
    const hasComma = s.includes(",");

    if (hasDot && hasComma) {
      // assume dot thousands + comma decimal
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(",", ".");
    }

    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function computeIMC(pesoKg, alturaM) {
    if (!Number.isFinite(pesoKg) || !Number.isFinite(alturaM)) return null;
    if (pesoKg <= 0 || alturaM <= 0) return null;

    const imc = pesoKg / (alturaM * alturaM);
    if (!Number.isFinite(imc)) return null;

    let cls = "Peso normal";
    if (imc < 18.5) cls = "Abaixo do peso";
    else if (imc < 25) cls = "Peso normal";
    else if (imc < 30) cls = "Excesso de peso";
    else cls = "Obesidade";

    return { imc, cls };
  }

  function format2(n) {
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  /* -----------------------------
     DOM
  ------------------------------ */
  const dom = {
    body: document.body,

    header: $(".site-header"),
    topBtn: $("#topBtn"),
    toast: $("#toast"),

    navToggle: $("#navToggle"),
    navMenu: $("#navMenu"),
    navBackdrop: $("#navBackdrop"),

    tabButtons: $$('[role="tab"]'),
    tabPanels: $$('[role="tabpanel"]'),

    // Home / Objetivos
    objectiveGroup: $("#objectiveGroup"),
    objectiveButtons: $$("[data-objective]"),

    // Planos
    levelGroup: $("#levelGroup"),
    levelButtons: $$("[data-level]"),
    planCard: $("#planCard"),
    routineBody: $("#routineBody"),
    printPlan: $("#printPlan"),

    // Ferramentas: IMC
    imcForm: $("#imcForm"),
    peso: $("#peso"),
    altura: $("#altura"),
    resultado: $("#resultado"),

    // Ferramentas: Timer
    timerRing: $("#timerRing"),
    timerValue: $("#timerValue"),
    timerProgress: $("#timerProgress"),
    timerStart: $("#timerStart"),
    timerReset: $("#timerReset"),
    timerPhase: $("#timerPhase"),

    // Checklist
    checklist: $("#checklist"),
    checklistBar: $("#checklistBar"),
    checklistMeta: $("#checklistMeta"),
    weekLabel: $("#weekLabel"),
    resetChecklist: $("#resetChecklist"),

    // Quiz
    quizForm: $("#quizForm"),
    quizScore: $("#quizScore"),
    resetQuiz: $("#resetQuiz"),

    // Perfil
    profileForm: $("#profileForm"),
    profileMsg: $("#profileMsg"),
    nome: $("#nome"),
    idade: $("#idade"),
    pesoPerfil: $("#pesoPerfil"),
    alturaPerfil: $("#alturaPerfil"),

    statIMC: $("#statIMC"),
    statIMCText: $("#statIMCText"),
    statObjetivo: $("#statObjetivo"),
    statNivel: $("#statNivel"),

    // Hero for parallax
    hero: $(".hero"),
  };

  /* -----------------------------
     Toast
  ------------------------------ */
  let toastTimer = null;

  function showToast(message, variant = "info", duration = 2800) {
    if (!dom.toast) return;

    dom.toast.textContent = message;
    dom.toast.dataset.variant = variant;
    dom.toast.style.setProperty("--toast-duration", `${duration}ms`);
    dom.toast.classList.add("toast--show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      dom.toast.classList.remove("toast--show");
    }, duration);
  }

  /* -----------------------------
     Ripple micro-interaction
  ------------------------------ */
  document.addEventListener("pointerdown", (e) => {
    if (reduceMotion) return;
    const target = e.target.closest("[data-ripple]");
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "ripple";

    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;

    target.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  });

  /* -----------------------------
     Mobile nav
  ------------------------------ */
  function openNav() {
    dom.body.classList.add("nav-open");
    dom.navToggle?.setAttribute("aria-expanded", "true");
    dom.navBackdrop?.setAttribute("aria-hidden", "false");

    // focus first tab for keyboard users
    dom.tabButtons[0]?.focus({ preventScroll: true });
  }

  function closeNav({ returnFocus = false } = {}) {
    dom.body.classList.remove("nav-open");
    dom.navToggle?.setAttribute("aria-expanded", "false");
    dom.navBackdrop?.setAttribute("aria-hidden", "true");
    if (returnFocus) dom.navToggle?.focus({ preventScroll: true });
  }

  dom.navToggle?.addEventListener("click", () => {
    dom.body.classList.contains("nav-open") ? closeNav() : openNav();
  });

  dom.navBackdrop?.addEventListener("click", () => closeNav());

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dom.body.classList.contains("nav-open")) {
      closeNav({ returnFocus: true });
    }
  });

  /* -----------------------------
     Tabs (ARIA tablist)
     - roving tabindex
     - arrows + Home/End
     - state persisted + deep-link via hash
  ------------------------------ */
  const TAB_ORDER = ["home", "planos", "ferramentas", "perfil"];
  const tabByName = (name) => dom.tabButtons.find((b) => b.dataset.tab === name);
  const panelByName = (name) => dom.tabPanels.find((p) => p.dataset.tabpanel === name);

  function setTabState(name, { focus = false, updateHash = true } = {}) {
    dom.tabButtons.forEach((btn) => {
      const active = btn.dataset.tab === name;
      btn.setAttribute("aria-selected", String(active));
      btn.classList.toggle("is-active", active);
      btn.tabIndex = active ? 0 : -1;
      if (active && focus) btn.focus({ preventScroll: true });
    });

    dom.tabPanels.forEach((panel) => {
      const active = panel.dataset.tabpanel === name;
      panel.toggleAttribute("hidden", !active);
    });

    localStorage.setItem(STORAGE.activeTab, name);

    // Update hash without scroll jump
    if (updateHash) {
      history.replaceState(null, "", `#${name}`);
    }

    // When switching tabs, refresh observers for reveal + section nav
    observeRevealsInActivePanel();
    initSectionNavObserver();
    updateProfileStats();
  }

  function getActiveTabName() {
    const active = dom.tabButtons.find((b) => b.getAttribute("aria-selected") === "true");
    return active?.dataset.tab || "home";
  }

  function openTab(name, opts = {}) {
    if (!TAB_ORDER.includes(name)) name = "home";
    setTabState(name, opts);

    // close mobile nav if open
    if (dom.body.classList.contains("nav-open")) closeNav();
  }

  // Tab clicks
  dom.tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => openTab(btn.dataset.tab, { focus: false, updateHash: true }));
  });

  // Keyboard support (auto-activate)
  const tablist = dom.tabButtons[0]?.parentElement;
  tablist?.addEventListener("keydown", (e) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "];
    if (!keys.includes(e.key)) return;

    const current = document.activeElement?.closest('[role="tab"]');
    if (!current) return;

    let idx = TAB_ORDER.indexOf(current.dataset.tab);

    if (e.key === "ArrowLeft") idx = (idx - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    if (e.key === "ArrowRight") idx = (idx + 1) % TAB_ORDER.length;
    if (e.key === "Home") idx = 0;
    if (e.key === "End") idx = TAB_ORDER.length - 1;

    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      openTab(TAB_ORDER[idx], { focus: true, updateHash: true });
    }

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openTab(current.dataset.tab, { focus: true, updateHash: true });
    }
  });

  // Deep-linking via hash: #home/#planos/... or a section id like #tools-imc
  function handleHashNavigation(hash) {
    const clean = (hash || "").replace("#", "");
    if (!clean) return false;

    // If hash matches a tab name
    if (TAB_ORDER.includes(clean)) {
      openTab(clean, { focus: false, updateHash: false });
      return true;
    }

    // Otherwise, try to find the element and open its panel
    const el = document.getElementById(clean);
    if (!el) return false;

    const panel = el.closest('[role="tabpanel"]');
    const panelName = panel?.dataset.tabpanel;
    if (panelName && TAB_ORDER.includes(panelName)) {
      openTab(panelName, { focus: false, updateHash: false });

      // Wait a tick for layout (panel un-hidden)
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      });
      return true;
    }
    return false;
  }

  window.addEventListener("hashchange", () => {
    handleHashNavigation(location.hash);
  });

  /* -----------------------------
     Scroll reveal (IntersectionObserver, stagger)
  ------------------------------ */
  let revealObserver = null;
  const observedReveals = new WeakSet();

  function initRevealObserver() {
    if (reduceMotion) {
      $$("[data-reveal]").forEach((el) => el.classList.add("is-visible"));
      return;
    }
    if (!("IntersectionObserver" in window)) {
      $$("[data-reveal]").forEach((el) => el.classList.add("is-visible"));
      return;
    }

    revealObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const el = entry.target;
        const delay = Number(el.dataset.delay || 0);
        el.style.setProperty("--reveal-delay", `${delay}ms`);
        el.classList.add("is-visible");

        obs.unobserve(el);
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -10% 0px" });
  }

  function observeRevealsInActivePanel() {
    if (!revealObserver) return;
    const activePanel = panelByName(getActiveTabName());
    if (!activePanel) return;

    const els = $$("[data-reveal]", activePanel);
    els.forEach((el) => {
      if (observedReveals.has(el)) return;
      observedReveals.add(el);
      revealObserver.observe(el);
    });
  }

  /* -----------------------------
     Section nav active state (IntersectionObserver)
     - applies to .panel-nav links in the active panel
  ------------------------------ */
  let sectionObserver = null;

  function initSectionNavObserver() {
    if (sectionObserver) sectionObserver.disconnect();

    const activePanel = panelByName(getActiveTabName());
    if (!activePanel) return;

    const nav = $(".panel-nav", activePanel);
    if (!nav) return;

    const links = $$("[data-subnav-link]", nav);
    const sections = $$("[data-section]", activePanel);

    if (!("IntersectionObserver" in window) || !sections.length || !links.length) return;

    const byId = new Map(links.map((a) => [a.getAttribute("href"), a]));

    const setActive = (id) => {
      links.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${id}`));
    };

    sectionObserver = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting);
      if (!visible.length) return;

      visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      const id = visible[0].target.id;
      if (id && byId.get(`#${id}`)) setActive(id);
    }, {
      root: null,
      rootMargin: "-35% 0px -55% 0px",
      threshold: [0.05, 0.15, 0.3, 0.5, 0.75],
    });

    sections.forEach((sec) => sectionObserver.observe(sec));

    // default active: first link that matches
    const first = sections[0]?.id;
    if (first) setActive(first);
  }

  // Close nav on in-panel anchor click (mobile friendliness)
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    if (dom.body.classList.contains("nav-open")) closeNav();
  });

  /* -----------------------------
     Scroll updates: header shrink + back-to-top + parallax
     - requestAnimationFrame throttling
  ------------------------------ */
  let latestY = window.scrollY;
  let ticking = false;

  function isHomeActive() {
    return getActiveTabName() === "home";
  }

  function updateOnScroll() {
    const y = latestY;

    dom.header?.classList.toggle("is-scrolled", y > 8);
    dom.topBtn?.classList.toggle("is-visible", y > 700);

    if (!reduceMotion && dom.hero && isHomeActive()) {
      const py = Math.min(y * 0.25, 140);
      dom.hero.style.setProperty("--parallax-y", `${py}px`);
    }

    ticking = false;
  }

  function onScroll() {
    latestY = window.scrollY || 0;
    if (!ticking) {
      requestAnimationFrame(updateOnScroll);
      ticking = true;
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  updateOnScroll();

  dom.topBtn?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  });

  /* -----------------------------
     Cross-tab buttons (data-open-tab + optional scroll)
  ------------------------------ */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-open-tab]");
    if (!btn) return;

    const tab = btn.dataset.openTab;
    const scrollTo = btn.dataset.scrollTo;

    openTab(tab, { focus: false, updateHash: true });

    if (scrollTo) {
      requestAnimationFrame(() => {
        const el = document.querySelector(scrollTo);
        el?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      });
    }
  });

  /* -----------------------------
     Objective selection (radiogroup)
     - updates Planos tab
     - persists selection
  ------------------------------ */
  const OBJECTIVE_LABEL = {
    hipertrofia: "Hipertrofia",
    emagrecimento: "Emagrecimento",
    resistencia: "Resistência",
    forca: "Força",
  };

  function getObjective() {
    return localStorage.getItem(STORAGE.objective) || "";
  }
  function setObjective(key) {
    localStorage.setItem(STORAGE.objective, key);
    updateObjectiveUI(key);
    renderPlan();
    updateProfileStats();
    showToast("Objetivo atualizado", "info");
  }

  function updateObjectiveUI(selectedKey) {
    dom.objectiveButtons.forEach((b) => {
      const selected = b.dataset.objective === selectedKey;
      b.classList.toggle("is-selected", selected);
      b.setAttribute("aria-checked", String(selected));
      b.tabIndex = selected ? 0 : -1;
    });

    // Perfil stat
    dom.statObjetivo && (dom.statObjetivo.textContent = selectedKey ? OBJECTIVE_LABEL[selectedKey] : "—");
  }

  dom.objectiveButtons.forEach((btn) => {
    btn.addEventListener("click", () => setObjective(btn.dataset.objective));
  });

  // Arrow keys within objective radiogroup
  dom.objectiveGroup?.addEventListener("keydown", (e) => {
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"];
    if (!keys.includes(e.key)) return;

    e.preventDefault();
    const buttons = dom.objectiveButtons;
    const current = document.activeElement?.closest("[data-objective]");
    let idx = Math.max(0, buttons.indexOf(current));

    const dir = (e.key === "ArrowRight" || e.key === "ArrowDown") ? 1 : -1;
    idx = (idx + dir + buttons.length) % buttons.length;

    const next = buttons[idx];
    next.focus({ preventScroll: true });
    setObjective(next.dataset.objective);
  });

  /* -----------------------------
     Plan level selection (radiogroup)
     - persists selection
  ------------------------------ */
  const LEVEL_LABEL = {
    iniciante: "Iniciante",
    intermedio: "Intermédio",
    avancado: "Avançado",
  };

  function getLevel() {
    return localStorage.getItem(STORAGE.planLevel) || "iniciante";
  }
  function setLevel(level) {
    localStorage.setItem(STORAGE.planLevel, level);
    updateLevelUI(level);
    renderPlan();
    updateProfileStats();
  }

  function updateLevelUI(level) {
    dom.levelButtons.forEach((b) => {
      const active = b.dataset.level === level;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-checked", String(active));
      b.tabIndex = active ? 0 : -1;
    });
    dom.statNivel && (dom.statNivel.textContent = LEVEL_LABEL[level] || "—");
  }

  dom.levelButtons.forEach((btn) => {
    btn.addEventListener("click", () => setLevel(btn.dataset.level));
  });

  dom.levelGroup?.addEventListener("keydown", (e) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(e.key)) return;

    e.preventDefault();
    const buttons = dom.levelButtons;
    const current = document.activeElement?.closest("[data-level]");
    let idx = Math.max(0, buttons.indexOf(current));

    if (e.key === "ArrowLeft") idx = (idx - 1 + buttons.length) % buttons.length;
    if (e.key === "ArrowRight") idx = (idx + 1) % buttons.length;
    if (e.key === "Home") idx = 0;
    if (e.key === "End") idx = buttons.length - 1;

    const next = buttons[idx];
    next.focus({ preventScroll: true });
    setLevel(next.dataset.level);
  });

  /* -----------------------------
     Plan + Routine data
  ------------------------------ */
  const DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

  const PLAN_DATA = {
    hipertrofia: {
      focus: "Volume + progressão",
      bullets: [
        "Básicos primeiro (supino, agacho, remada).",
        "Progressão semanal pequena e consistente.",
        "Técnica e amplitude controladas.",
      ],
      note: "Mantém 1–2 repetições em reserva (RIR). Sobe carga quando atingires o topo das reps com técnica limpa.",
      routine: {
        iniciante: ["Full-body A", "Descanso/Mobilidade", "Full-body B", "Descanso", "Full-body C", "Caminhada leve", "Descanso"],
        intermedio: ["Peito + tríceps", "Costas + bíceps", "Descanso/Mobilidade", "Pernas", "Ombros + core", "Cardio leve", "Descanso"],
        avancado: ["Peito + tríceps", "Costas + bíceps", "Pernas", "Ombros", "Upper + acessórios", "Cardio leve", "Descanso"],
      },
      daysPerWeek: { iniciante: 3, intermedio: 4, avancado: 5 },
    },
    emagrecimento: {
      focus: "Força + condicionamento",
      bullets: [
        "Força para manter massa (full-body / básicos).",
        "Cardio intervalado curto e controlado (HIIT).",
        "Aumenta passos e consistência semanal.",
      ],
      note: "O fator #1 é consistência: mantém o plano simples e repetível. Sono e proteína fazem diferença.",
      routine: {
        iniciante: ["Full-body + 10min cardio", "Caminhada", "Circuito (HIIT leve)", "Descanso", "Full-body + core", "Cardio leve", "Descanso"],
        intermedio: ["Full-body", "HIIT 10–15min", "Descanso/Mobilidade", "Full-body", "Cardio zona 2", "Caminhada", "Descanso"],
        avancado: ["Full-body (pesado)", "HIIT 12–18min", "Lower + core", "Cardio zona 2", "Upper + acessórios", "Caminhada", "Descanso"],
      },
      daysPerWeek: { iniciante: 3, intermedio: 4, avancado: 5 },
    },
    resistencia: {
      focus: "Base aeróbica + intervalos",
      bullets: [
        "Zona 2 para criar base (conversável).",
        "1 sessão intervalada por semana.",
        "Força leve/média para suporte estrutural.",
      ],
      note: "Aumenta volume gradualmente. Primeiro base, depois intensidade. Recuperação ativa ajuda a manter consistência.",
      routine: {
        iniciante: ["Zona 2 (20–30min)", "Mobilidade", "Força leve (full)", "Descanso", "Intervalos curtos", "Caminhada leve", "Descanso"],
        intermedio: ["Zona 2 (30–45min)", "Força (full)", "Intervalos (6×2min)", "Descanso", "Zona 2 (curto)", "Longo fácil", "Descanso"],
        avancado: ["Zona 2", "Intervalos", "Força (full)", "Zona 2", "Ritmo moderado", "Longo fácil", "Descanso"],
      },
      daysPerWeek: { iniciante: 3, intermedio: 5, avancado: 6 },
    },
    forca: {
      focus: "Cargas altas + técnica",
      bullets: [
        "Básicos com 3–5 reps (força).",
        "Descanso maior nos exercícios principais.",
        "Acessórios para estabilidade e core.",
      ],
      note: "Descansa 2–4 min nos básicos. Mantém técnica perfeita e progressão pequena (2.5–5%).",
      routine: {
        iniciante: ["Força A (agacho/supino)", "Descanso", "Força B (terra/press)", "Mobilidade", "Acessórios + core", "Descanso", "Descanso"],
        intermedio: ["Lower (força)", "Upper (força)", "Descanso", "Lower (volume)", "Upper (volume)", "Mobilidade", "Descanso"],
        avancado: ["Lower (força)", "Upper (força)", "Lower (assist.)", "Upper (assist.)", "Técnica + core", "Mobilidade", "Descanso"],
      },
      daysPerWeek: { iniciante: 3, intermedio: 4, avancado: 5 },
    },
  };

  function renderRoutine(rows) {
    if (!dom.routineBody) return;
    dom.routineBody.innerHTML = rows
      .map((session, i) => `<tr><td>${DAYS[i]}</td><td>${session}</td></tr>`)
      .join("");
  }

  function renderPlan() {
    const obj = getObjective();
    const level = getLevel();

    // Update profile summary (always)
    dom.statObjetivo && (dom.statObjetivo.textContent = obj ? OBJECTIVE_LABEL[obj] : "—");
    dom.statNivel && (dom.statNivel.textContent = LEVEL_LABEL[level] || "—");

    if (!dom.planCard) return;

    if (!obj || !PLAN_DATA[obj]) {
      dom.planCard.innerHTML = `
        <div class="plan-empty">
          <p class="plan-empty-title">Ainda não escolheste um objetivo.</p>
          <p class="plan-empty-text">Vai à aba <strong>Home</strong>, seleciona um objetivo e volta aqui.</p>
        </div>
      `;
      renderRoutine(["Seleciona um objetivo para gerar a rotina.", "—", "—", "—", "—", "—", "—"]);
      return;
    }

    const data = PLAN_DATA[obj];
    const days = data.daysPerWeek[level] ?? 3;

    // Plan swap animation (optional)
    dom.planCard.classList.remove("is-updating");
    void dom.planCard.offsetWidth;
    if (!reduceMotion) dom.planCard.classList.add("is-updating");

    dom.planCard.innerHTML = `
      <div class="plan-head">
        <p class="plan-kicker">${OBJECTIVE_LABEL[obj]} • ${LEVEL_LABEL[level]}</p>
        <h3 class="plan-title">Plano de ${OBJECTIVE_LABEL[obj]} (${LEVEL_LABEL[level]})</h3>
        <p class="plan-meta">
          <span class="chip">${days} dias/semana</span>
          <span class="chip chip-soft">Foco: ${data.focus}</span>
          <span class="chip chip-soft">Ciclo: 6–12 semanas</span>
        </p>
      </div>

      <div class="plan-body">
        <ul class="plan-list">
          ${data.bullets.map((b) => `<li>${b}</li>`).join("")}
        </ul>
        <div class="plan-note">
          <p><strong>Dica:</strong> ${data.note}</p>
        </div>
      </div>
    `;

    renderRoutine(data.routine[level]);
  }

  /* -----------------------------
     Print plan
  ------------------------------ */
  dom.printPlan?.addEventListener("click", () => {
    // Ensure Planos tab is active before print
    openTab("planos", { focus: false, updateHash: true });

    // Let layout settle then print
    setTimeout(() => {
      window.print();
    }, 120);
  });

  /* -----------------------------
     IMC (fixed)
  ------------------------------ */
  function setIMCResult(text, { isError = false } = {}) {
    if (!dom.resultado) return;
    dom.resultado.textContent = text;
    dom.resultado.classList.toggle("is-error", isError);
  }

  dom.imcForm?.addEventListener("submit", (e) => {
    e.preventDefault();

    const peso = parseLocaleNumber(dom.peso?.value);
    const altura = parseLocaleNumber(dom.altura?.value);

    const calc = computeIMC(peso, altura);

    if (!calc) {
      setIMCResult("Preenche peso e altura corretamente (valores > 0).", { isError: true });
      showToast("Valores inválidos no IMC", "error");
      return;
    }

    setIMCResult(`IMC: ${format2(calc.imc)} — ${calc.cls}`, { isError: false });
    showToast("IMC calculado", "info");
  });

  /* -----------------------------
     HIIT Timer (30s loop) + SVG ring
     - Start/Pause/Reset
     - Smooth progress via rAF
  ------------------------------ */
  const HIIT = {
    durationMs: 30_000,
    running: false,
    startTs: 0,
    pausedElapsed: 0,
    raf: 0,
    circumference: 0,
    lastCycle: 0,
  };

  function initRing() {
    if (!dom.timerProgress) return;
    const r = Number(dom.timerProgress.getAttribute("r")) || 52;
    HIIT.circumference = 2 * Math.PI * r;
    dom.timerProgress.style.strokeDasharray = `${HIIT.circumference} ${HIIT.circumference}`;
    dom.timerProgress.style.strokeDashoffset = "0";
  }

  function updateTimerUI(remainingMs) {
    const sec = Math.max(0, Math.ceil(remainingMs / 1000));
    dom.timerValue && (dom.timerValue.textContent = String(sec));
    dom.timerRing && dom.timerRing.setAttribute("aria-valuenow", String(sec));

    if (dom.timerProgress && HIIT.circumference) {
      const ratio = remainingMs / HIIT.durationMs;
      const offset = HIIT.circumference * (1 - ratio);
      dom.timerProgress.style.strokeDashoffset = String(offset);
    }

    if (dom.timerStart) {
      dom.timerStart.textContent = HIIT.running ? "Pausar" : "Iniciar";
      dom.timerStart.setAttribute("aria-pressed", String(HIIT.running));
    }
  }

  function tickTimer() {
    if (!HIIT.running) return;

    const now = performance.now();
    const elapsed = now - HIIT.startTs;
    const cycle = Math.floor(elapsed / HIIT.durationMs);

    if (cycle !== HIIT.lastCycle) {
      HIIT.lastCycle = cycle;
      showToast("Descanso!", "info", 2000);
    }

    const within = elapsed % HIIT.durationMs;
    const remaining = HIIT.durationMs - within;

    updateTimerUI(remaining);
    HIIT.raf = requestAnimationFrame(tickTimer);
  }

  function startTimer() {
    if (HIIT.running) return;
    HIIT.running = true;
    HIIT.startTs = performance.now() - HIIT.pausedElapsed;
    cancelAnimationFrame(HIIT.raf);
    tickTimer();
  }

  function pauseTimer() {
    if (!HIIT.running) return;
    HIIT.running = false;
    HIIT.pausedElapsed = performance.now() - HIIT.startTs;
    cancelAnimationFrame(HIIT.raf);
    updateTimerUI(Math.max(0, HIIT.durationMs - (HIIT.pausedElapsed % HIIT.durationMs)));
  }

  function resetTimer() {
    HIIT.running = false;
    HIIT.pausedElapsed = 0;
    HIIT.lastCycle = 0;
    cancelAnimationFrame(HIIT.raf);
    updateTimerUI(HIIT.durationMs);
    showToast("Temporizador reiniciado", "info");
  }

  dom.timerStart?.addEventListener("click", () => {
    HIIT.running ? pauseTimer() : startTimer();
  });

  dom.timerReset?.addEventListener("click", () => resetTimer());

  /* -----------------------------
     Checklist semanal (persisted by week)
  ------------------------------ */
  function startOfWeekKey(date = new Date()) {
    // Monday-based week key
    const d = new Date(date);
    const day = (d.getDay() + 6) % 7; // Mon=0
    d.setDate(d.getDate() - day);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const WEEK_KEY = startOfWeekKey();
  const CHECK_KEY = STORAGE.checklistPrefix + WEEK_KEY;

  const CHECK_DAYS = [
    { key: "seg", label: "Segunda" },
    { key: "ter", label: "Terça" },
    { key: "qua", label: "Quarta" },
    { key: "qui", label: "Quinta" },
    { key: "sex", label: "Sexta" },
    { key: "sab", label: "Sábado" },
    { key: "dom", label: "Domingo" },
  ];

  function loadChecklist() {
    const saved = loadJSON(CHECK_KEY, null);
    if (saved && typeof saved === "object") return saved;

    // default
    const obj = {};
    CHECK_DAYS.forEach((d) => (obj[d.key] = false));
    saveJSON(CHECK_KEY, obj);
    return obj;
  }

  let checklistState = loadChecklist();

  function renderChecklist() {
    if (!dom.checklist) return;

    dom.weekLabel && (dom.weekLabel.textContent = `Início: ${WEEK_KEY}`);
    dom.checklist.innerHTML = CHECK_DAYS.map((d) => {
      const checked = checklistState[d.key] ? "checked" : "";
      return `
        <label class="check-item">
          <input type="checkbox" data-day="${d.key}" ${checked} />
          <span>${d.label}</span>
        </label>
      `;
    }).join("");

    updateChecklistMeta();
  }

  function updateChecklistMeta() {
    const total = CHECK_DAYS.length;
    const done = CHECK_DAYS.reduce((acc, d) => acc + (checklistState[d.key] ? 1 : 0), 0);
    const pct = Math.round((done / total) * 100);

    dom.checklistBar && (dom.checklistBar.style.width = `${pct}%`);
    dom.checklistMeta && (dom.checklistMeta.textContent = `${done}/${total} concluídos`);
  }

  dom.checklist?.addEventListener("change", (e) => {
    const cb = e.target.closest('input[type="checkbox"][data-day]');
    if (!cb) return;

    const day = cb.dataset.day;
    checklistState[day] = cb.checked;
    saveJSON(CHECK_KEY, checklistState);
    updateChecklistMeta();
  });

  dom.resetChecklist?.addEventListener("click", () => {
    CHECK_DAYS.forEach((d) => (checklistState[d.key] = false));
    saveJSON(CHECK_KEY, checklistState);
    renderChecklist();
    showToast("Checklist reposta", "info");
  });

  /* -----------------------------
     Quiz (3 questions) — immediate feedback
  ------------------------------ */
  function updateQuizScore() {
    if (!dom.quizForm || !dom.quizScore) return;
    const qs = $$(".quiz-q", dom.quizForm);
    let score = 0;

    qs.forEach((q) => {
      const answer = q.dataset.answer;
      const name = `q${q.dataset.q}`;
      const checked = $(`input[name="${name}"]:checked`, q);
      if (checked && checked.value === answer) score += 1;
    });

    dom.quizScore.textContent = String(score);
  }

  dom.quizForm?.addEventListener("change", (e) => {
    const input = e.target.closest('input[type="radio"]');
    if (!input) return;

    const q = input.closest(".quiz-q");
    if (!q) return;

    const answer = q.dataset.answer;
    const feedback = $(".feedback", q);

    q.classList.remove("is-correct", "is-wrong");

    if (input.value === answer) {
      q.classList.add("is-correct");
      if (feedback) feedback.textContent = "✅ Correto";
    } else {
      q.classList.add("is-wrong");
      if (feedback) feedback.textContent = "❌ Incorreto";
    }

    updateQuizScore();
  });

  dom.resetQuiz?.addEventListener("click", () => {
    if (!dom.quizForm) return;

    $$('input[type="radio"]', dom.quizForm).forEach((i) => (i.checked = false));
    $$(".quiz-q", dom.quizForm).forEach((q) => {
      q.classList.remove("is-correct", "is-wrong");
      const fb = $(".feedback", q);
      if (fb) fb.textContent = "";
    });

    updateQuizScore();
    showToast("Quiz reiniciado", "info");
  });

  /* -----------------------------
     Perfil (persisted)
     - saves name/age/weight/height
     - prefill IMC fields
     - stats: IMC + objective + level
  ------------------------------ */
  function loadProfile() {
    return loadJSON(STORAGE.profile, {
      nome: "",
      idade: "",
      peso: "",
      altura: "",
    });
  }

  function saveProfile(profile) {
    saveJSON(STORAGE.profile, profile);
  }

  function prefillProfileForm() {
    const p = loadProfile();
    if (dom.nome) dom.nome.value = p.nome ?? "";
    if (dom.idade) dom.idade.value = p.idade ?? "";
    if (dom.pesoPerfil) dom.pesoPerfil.value = p.peso ?? "";
    if (dom.alturaPerfil) dom.alturaPerfil.value = p.altura ?? "";
  }

  function prefillIMCInputsFromProfile({ onlyIfEmpty = true } = {}) {
    const p = loadProfile();
    if (!dom.peso || !dom.altura) return;

    if (!p.peso || !p.altura) return;

    if (!onlyIfEmpty || !String(dom.peso.value || "").trim()) dom.peso.value = String(p.peso);
    if (!onlyIfEmpty || !String(dom.altura.value || "").trim()) dom.altura.value = String(p.altura);
  }

  function updateProfileStats() {
    const p = loadProfile();
    const peso = parseLocaleNumber(p.peso);
    const altura = parseLocaleNumber(p.altura);
    const calc = computeIMC(peso, altura);

    if (dom.statIMC) dom.statIMC.textContent = calc ? format2(calc.imc) : "—";
    if (dom.statIMCText) dom.statIMCText.textContent = calc ? calc.cls : "Preenche peso e altura no Perfil.";

    const obj = getObjective();
    dom.statObjetivo && (dom.statObjetivo.textContent = obj ? OBJECTIVE_LABEL[obj] : "—");

    const lvl = getLevel();
    dom.statNivel && (dom.statNivel.textContent = LEVEL_LABEL[lvl] || "—");
  }

  dom.profileForm?.addEventListener("submit", (e) => {
    e.preventDefault();

    const profile = {
      nome: String(dom.nome?.value || "").trim(),
      idade: String(dom.idade?.value || "").trim(),
      peso: String(dom.pesoPerfil?.value || "").trim(),
      altura: String(dom.alturaPerfil?.value || "").trim(),
    };

    // Light validation (do not block name-only profiles)
    const peso = profile.peso ? parseLocaleNumber(profile.peso) : null;
    const altura = profile.altura ? parseLocaleNumber(profile.altura) : null;

    if (profile.peso && (peso === null || peso <= 0)) {
      dom.profileMsg.textContent = "Peso inválido.";
      showToast("Peso inválido no Perfil", "error");
      return;
    }
    if (profile.altura && (altura === null || altura <= 0)) {
      dom.profileMsg.textContent = "Altura inválida.";
      showToast("Altura inválida no Perfil", "error");
      return;
    }

    saveProfile(profile);
    dom.profileMsg.textContent = "Perfil guardado com sucesso.";
    showToast("Perfil guardado", "info");

    // Prefill IMC inputs (but don't override user typing)
    prefillIMCInputsFromProfile({ onlyIfEmpty: true });
    updateProfileStats();
  });

  /* -----------------------------
     Init
  ------------------------------ */
  initRing();
  updateTimerUI(HIIT.durationMs);

  initRevealObserver();
  renderChecklist();
  updateQuizScore();

  // Prefill forms from storage
  prefillProfileForm();
  prefillIMCInputsFromProfile({ onlyIfEmpty: true });

  // Restore objective + level
  updateObjectiveUI(getObjective());
  updateLevelUI(getLevel());

  // Restore tab from hash or storage (priority: hash)
  const handled = handleHashNavigation(location.hash);
  if (!handled) {
    const lastTab = localStorage.getItem(STORAGE.activeTab) || "home";
    openTab(TAB_ORDER.includes(lastTab) ? lastTab : "home", { focus: false, updateHash: true });
  }

  // Render plan AFTER tab restore (depends on selection)
  renderPlan();

  // Observers for active panel
  observeRevealsInActivePanel();
  initSectionNavObserver();
  updateProfileStats();
})();
