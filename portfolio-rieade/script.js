function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function assertSelfCheck() {
  if (!isValidEmail("dev@example.com") || isValidEmail("not-an-email")) {
    throw new Error("self-check failed");
  }
}

function init() {
  const menuBtn = document.querySelector(".menu-toggle");
  const nav = document.querySelector("#primary-nav");

  if (menuBtn && nav) {
    menuBtn.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      menuBtn.setAttribute("aria-expanded", String(open));
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("is-open");
        menuBtn.setAttribute("aria-expanded", "false");
      });
    });
  }

  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));

  function activateTab(tab) {
    tabs.forEach((t) => {
      const selected = t === tab;
      t.classList.toggle("is-active", selected);
      t.setAttribute("aria-selected", String(selected));
      t.tabIndex = selected ? 0 : -1;
    });
    panels.forEach((panel) => {
      const show = panel.id === tab.getAttribute("aria-controls");
      panel.classList.toggle("is-active", show);
      panel.hidden = !show;
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activateTab(tab));
    tab.addEventListener("keydown", (event) => {
      const index = tabs.indexOf(tab);
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next !== index) {
        event.preventDefault();
        tabs[next].focus();
        activateTab(tabs[next]);
      }
    });
  });

  const form = document.getElementById("contact-form");
  const status = document.getElementById("form-status");

  if (form && status) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      status.textContent = "";
      const data = new FormData(form);
      const firstName = String(data.get("firstName") || "").trim();
      const lastName = String(data.get("lastName") || "").trim();
      const email = String(data.get("email") || "").trim();
      const message = String(data.get("message") || "").trim();

      if (!firstName || !lastName) {
        status.textContent = "Please fill in first and last name.";
        return;
      }
      if (!isValidEmail(email)) {
        status.textContent = "Please enter a valid email address.";
        return;
      }
      if (!message) {
        status.textContent = "Please enter a message.";
        return;
      }

      form.reset();
      status.textContent =
        "Message received. This is a demo; nothing was sent to a server.";
    });
  }
}

if (typeof document === "undefined") {
  assertSelfCheck();
} else {
  init();
}
