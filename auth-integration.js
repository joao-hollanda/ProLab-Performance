(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);

  let loggedIn = false;
  let currentUser = null;

  /* -----------------------------------------------------------
     Utilizador MOCK para testes (funciona sem PHP/MySQL).
     Faz login com estas credenciais para entrar como utilizador
     de teste. Remove este bloco quando o backend estiver pronto.
  ------------------------------------------------------------ */
  const MOCK_FLAG = "prolab.mockSession";
  const MOCK_USER = {
    email: "teste@prolab.pt",
    password: "teste123",
    user: { id: 0, nome: "João Teste", email: "teste@prolab.pt" },
    perfil: {
      nome: "João Teste",
      idade: 24,
      peso_kg: "78",
      altura_m: "1,78",
      objetivo: "hipertrofia",
      nivel: "intermedio",
    },
  };

  const isMockActive = () => localStorage.getItem(MOCK_FLAG) === "1";

  function activateMock() {
    const p = MOCK_USER.perfil;
    localStorage.setItem(MOCK_FLAG, "1");
    localStorage.setItem("prolab.profile", JSON.stringify({
      nome: p.nome,
      idade: String(p.idade),
      peso: p.peso_kg,
      altura: p.altura_m,
    }));
    localStorage.setItem("prolab.selectedObjective", p.objetivo);
    localStorage.setItem("prolab.planLevel", p.nivel);
  }

  function clearMock() {
    localStorage.removeItem(MOCK_FLAG);
  }

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });

    return response.json();
  }

  function showAuthMessage(element, text) {
    if (element) element.textContent = text;
  }

function setAuthButtons() {
  const openLogin = $("#openLogin");
  const openRegister = $("#openRegister");
  const logoutButton = $("#logoutButton");

  const protectedTabs = [
    $("#tab-planos"),
    $("#tab-ferramentas"),
    $("#tab-perfil"),
  ];

  if (openLogin) openLogin.hidden = loggedIn;
  if (openRegister) openRegister.hidden = loggedIn;
  if (logoutButton) logoutButton.hidden = !loggedIn;

  document.body.classList.toggle("logged-out", !loggedIn);
  document.body.classList.toggle("logged-in", loggedIn);

  // Mostra/esconde apenas os BOTÕES das abas protegidas.
  // A visibilidade dos PAINÉIS é controlada só pelo sistema de abas (script.js),
  // senão os 3 painéis abrem todos ao mesmo tempo no login (página gigante e vazia).
  protectedTabs.forEach((tab) => {
    if (tab) tab.hidden = !loggedIn;
  });

  if (!loggedIn) {
    localStorage.setItem("prolab.activeTab", "home");

    document.querySelectorAll('[role="tab"]').forEach((tab) => {
      tab.setAttribute("aria-selected", "false");
      tab.classList.remove("is-active");
      tab.tabIndex = -1;
    });

    document.querySelectorAll('[role="tabpanel"]').forEach((panel) => {
      panel.hidden = true;
    });

    const homeTab = $("#tab-home");
    const homePanel = $("#panel-home");

    if (homeTab) {
      homeTab.hidden = false;
      homeTab.setAttribute("aria-selected", "true");
      homeTab.classList.add("is-active");
      homeTab.tabIndex = 0;
    }

    if (homePanel) {
      homePanel.hidden = false;
    }

    history.replaceState(null, "", "#home");
  }
}

  function parseLocaleNumber(input) {
    const raw = String(input ?? "").trim();

    if (!raw) return null;

    let value = raw.replace(/\s+/g, "");

    if (value.includes(".") && value.includes(",")) {
      value = value.replace(/\./g, "").replace(",", ".");
    } else {
      value = value.replace(",", ".");
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  async function checkSession() {
    // Sessão de teste (mock): não toca no backend.
    if (isMockActive()) {
      loggedIn = true;
      currentUser = MOCK_USER.user;
      setAuthButtons();
      return; // o perfil já está em localStorage; o script.js trata do prefill
    }

    try {
      const result = await apiRequest("session.php");

      loggedIn = Boolean(result.logged_in);
      currentUser = result.user || null;

      setAuthButtons();

      if (loggedIn) {
        await loadProfileFromDatabase();
      }
    } catch {
      // Backend indisponível: trata como deslogado em vez de rebentar.
      loggedIn = false;
      currentUser = null;
      setAuthButtons();
    }
  }

  async function loadProfileFromDatabase() {
    const result = await apiRequest("perfil.php");

    if (!result.success || !result.perfil) return;

    const perfil = result.perfil;

    if ($("#nome")) $("#nome").value = perfil.nome || "";
    if ($("#idade")) $("#idade").value = perfil.idade || "";
    if ($("#pesoPerfil")) $("#pesoPerfil").value = perfil.peso_kg || "";
    if ($("#alturaPerfil")) $("#alturaPerfil").value = perfil.altura_m || "";

    localStorage.setItem("prolab.profile", JSON.stringify({
      nome: perfil.nome || "",
      idade: perfil.idade || "",
      peso: perfil.peso_kg || "",
      altura: perfil.altura_m || "",
    }));

    if (perfil.objetivo) {
      localStorage.setItem("prolab.selectedObjective", perfil.objetivo);
    }

    if (perfil.nivel) {
      localStorage.setItem("prolab.planLevel", perfil.nivel);
    }
  }

  async function saveProfileToDatabase() {
    if (!loggedIn) return;
    if (isMockActive()) return; // mock guarda só em localStorage (via script.js)

    const payload = {
      idade: $("#idade")?.value || null,
      peso_kg: parseLocaleNumber($("#pesoPerfil")?.value),
      altura_m: parseLocaleNumber($("#alturaPerfil")?.value),
      objetivo: localStorage.getItem("prolab.selectedObjective") || null,
      nivel: localStorage.getItem("prolab.planLevel") || "iniciante",
    };

    await apiRequest("perfil.php", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  function setupAuth() {
    const loginDialog = $("#loginDialog");
    const registerDialog = $("#registerDialog");
    const openLogin = $("#openLogin");
    const openRegister = $("#openRegister");
    const loginForm = $("#loginForm");
    const registerForm = $("#registerForm");
    const logoutButton = $("#logoutButton");

    const openDialog = (dialog) => {
      if (dialog && !dialog.open) dialog.showModal();
    };

    openLogin?.addEventListener("click", () => openDialog(loginDialog));
    openRegister?.addEventListener("click", () => openDialog(registerDialog));

    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-open-login]")) openDialog(loginDialog);
      if (event.target.closest("[data-open-register]")) openDialog(registerDialog);

      // Botão "Cancelar" / fechar dentro de qualquer diálogo
      const closeButton = event.target.closest("[data-close-dialog]");
      if (closeButton) closeButton.closest("dialog")?.close();
    });
    loginForm?.addEventListener("submit", async (event) => {
      event.preventDefault();

      const data = Object.fromEntries(new FormData(loginForm));

      // Atalho de teste: utilizador mock (sem backend).
      if (data.email === MOCK_USER.email && data.password === MOCK_USER.password) {
        activateMock();
        showAuthMessage($("#loginMsg"), "Sessão de teste iniciada.");
        loginDialog?.close();
        alert(`Bem-vindo, ${MOCK_USER.user.nome}! (conta de teste)`);
        window.location.reload();
        return;
      }

      const result = await apiRequest("login.php", {
        method: "POST",
        body: JSON.stringify(data),
      });

      showAuthMessage($("#loginMsg"), result.message || "");

      if (result.success) {
        loggedIn = true;
        currentUser = result.user;

        loginDialog?.close();
        setAuthButtons();

        await loadProfileFromDatabase();

        alert(`Bem-vindo, ${currentUser.nome}!`);
        window.location.reload();
      }
    });

    registerForm?.addEventListener("submit", async (event) => {
      event.preventDefault();

      const data = Object.fromEntries(new FormData(registerForm));

      const result = await apiRequest("register.php", {
        method: "POST",
        body: JSON.stringify(data),
      });

      showAuthMessage($("#registerMsg"), result.message || "");

      if (result.success) {
        registerDialog?.close();
        loginDialog?.showModal();
      }
    });

    logoutButton?.addEventListener("click", async () => {
      const wasMock = isMockActive();

      if (wasMock) {
        clearMock();
      } else {
        try {
          await apiRequest("logout.php", { method: "POST", body: "{}" });
        } catch {
          /* backend indisponível — termina sessão localmente na mesma */
        }
      }

      loggedIn = false;
      currentUser = null;

      setAuthButtons();

      localStorage.removeItem("prolab.profile");
      localStorage.removeItem("prolab.selectedObjective");
      localStorage.removeItem("prolab.planLevel");
      localStorage.setItem("prolab.activeTab", "home");

      alert("Sessão terminada.");

      // Mock: recarrega a página atual (pode ser index.html/file://).
      if (wasMock) {
        window.location.reload();
      } else {
        window.location.href = "index.php#home";
      }
    });

    $("#profileForm")?.addEventListener("submit", () => {
      setTimeout(saveProfileToDatabase, 100);
    });

    document.addEventListener("click", (event) => {
      if (
        event.target.closest("[data-objective]") ||
        event.target.closest("[data-level]")
      ) {
        setTimeout(saveProfileToDatabase, 250);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    setupAuth();
    await checkSession();
  });
})();