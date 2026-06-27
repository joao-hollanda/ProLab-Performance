(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);

  let loggedIn = false;
  let currentUser = null;

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

  const protectedPanels = [
    $("#panel-planos"),
    $("#panel-ferramentas"),
    $("#panel-perfil"),
  ];

  if (openLogin) openLogin.hidden = loggedIn;
  if (openRegister) openRegister.hidden = loggedIn;
  if (logoutButton) logoutButton.hidden = !loggedIn;

  document.body.classList.toggle("logged-out", !loggedIn);
  document.body.classList.toggle("logged-in", loggedIn);

  protectedTabs.forEach((tab) => {
    if (tab) tab.hidden = !loggedIn;
  });

  protectedPanels.forEach((panel) => {
    if (panel) panel.hidden = !loggedIn;
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
    const result = await apiRequest("session.php");

    loggedIn = Boolean(result.logged_in);
    currentUser = result.user || null;

    setAuthButtons();

    if (loggedIn) {
      await loadProfileFromDatabase();
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

    openLogin?.addEventListener("click", () => {
      loginDialog?.showModal();
    });

    openRegister?.addEventListener("click", () => {
      registerDialog?.showModal();
    });

    document.addEventListener("click", (event) => {
  const loginButton = event.target.closest("[data-open-login]");
  const registerButton = event.target.closest("[data-open-register]");

  if (loginButton) {
    loginDialog?.showModal();
  }

  if (registerButton) {
    registerDialog?.showModal();
  }
});
    loginForm?.addEventListener("submit", async (event) => {
      event.preventDefault();

      const data = Object.fromEntries(new FormData(loginForm));

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
      await apiRequest("logout.php", {
        method: "POST",
        body: "{}",
      });

      loggedIn = false;
      currentUser = null;

      setAuthButtons();

localStorage.removeItem("prolab.profile");
localStorage.removeItem("prolab.selectedObjective");
localStorage.removeItem("prolab.planLevel");
localStorage.setItem("prolab.activeTab", "home");

alert("Sessão terminada.");
window.location.href = "index.php#home";
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