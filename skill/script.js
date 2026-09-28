const VIEWS = ["home", "members", "projects", "contact"];

function normalizeRoute(hash) {
  const id = String(hash || "").replace(/^#/, "");
  return VIEWS.includes(id) ? id : "home";
}

function validateContact(fields) {
  const errors = {};
  if (!String(fields.name || "").trim()) errors.name = "Nhập tên.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(fields.email || "").trim())) {
    errors.email = "Email chưa đúng.";
  }
  if (!String(fields.message || "").trim()) errors.message = "Nhập lời nhắn.";
  return errors;
}

function assertSelfCheck() {
  if (normalizeRoute("") !== "home") throw new Error("empty hash");
  if (normalizeRoute("#projects") !== "projects") throw new Error("projects");
  if (normalizeRoute("#nope") !== "home") throw new Error("unknown hash");
  const ok = validateContact({ name: "An", email: "a@b.co", message: "hi" });
  if (Object.keys(ok).length !== 0) throw new Error("valid form");
  const bad = validateContact({ name: " ", email: "nope", message: "" });
  if (!bad.name || !bad.email || !bad.message) throw new Error("invalid form");
}

function init() {
  const nav = document.querySelector("#site-nav");
  const menuBtn = document.querySelector(".menu-btn");
  const tabs = [...document.querySelectorAll(".tab")];
  const panels = [...document.querySelectorAll(".panel")];
  const filters = [...document.querySelectorAll(".filter")];
  const cards = [...document.querySelectorAll(".card")];
  const form = document.querySelector("#contact-form");
  const status = document.querySelector("#form-status");

  function showView(hash) {
    const id = normalizeRoute(hash);
    document.querySelectorAll(".view").forEach((view) => {
      const on = view.id === `view-${id}`;
      view.classList.toggle("is-on", on);
      view.hidden = !on;
    });
    document.querySelectorAll(".nav-link").forEach((link) => {
      if (link.getAttribute("href") === `#${id}`) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function selectMember(id) {
    tabs.forEach((tab) => {
      const on = tab.dataset.member === id;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
    });
    panels.forEach((panel) => {
      panel.hidden = panel.id !== `panel-${id}`;
    });
  }

  function closeMenu() {
    nav.classList.remove("is-open");
    menuBtn.setAttribute("aria-expanded", "false");
  }

  menuBtn.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    menuBtn.setAttribute("aria-expanded", String(open));
  });

  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });

  document.querySelectorAll("[data-open-member]").forEach((link) => {
    link.addEventListener("click", () => selectMember(link.dataset.openMember));
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => selectMember(tab.dataset.member));
  });

  document.querySelector(".tablist").addEventListener("keydown", (event) => {
    const index = tabs.indexOf(document.activeElement);
    if (index < 0) return;
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    tabs[next].focus();
    selectMember(tabs[next].dataset.member);
  });

  filters.forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.filter;
      filters.forEach((item) => {
        const on = item === button;
        item.classList.toggle("is-on", on);
        item.setAttribute("aria-pressed", String(on));
      });
      cards.forEach((card) => {
        card.hidden = id !== "all" && card.dataset.member !== id;
      });
    });
  });

  document.querySelectorAll('a[href="#"]').forEach((link) => {
    link.addEventListener("click", (event) => event.preventDefault());
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = {
      name: form.name.value,
      email: form.email.value,
      message: form.message.value,
    };
    const errors = validateContact(data);
    ["name", "email", "message"].forEach((key) => {
      form.querySelector(`[data-error="${key}"]`).textContent = errors[key] || "";
    });
    if (Object.keys(errors).length) {
      status.textContent = "";
      return;
    }
    form.reset();
    status.textContent = "Đã nhận. Đây là bản demo, tin nhắn không được gửi đi.";
  });

  window.addEventListener("hashchange", () => showView(location.hash));
  showView(location.hash);
}

if (typeof document === "undefined") {
  assertSelfCheck();
} else {
  init();
}
