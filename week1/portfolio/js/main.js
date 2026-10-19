/**
 * Duo Developer Terminal Portfolio - Main JavaScript
 * Implements Theme Switching, Responsive Nav, Dialog Modals with Light-Dismiss Fallback,
 * Form Validation, Interactive Quick CLI, and Intersection Observers.
 */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initMobileNav();
  initActiveNavObserver();
  initModals();
  initContactForm();
  initBackToTop();
  initQuickCli();
});

/* ==========================================================================
   1. Theme Management (Terminal Dark / Light Mode)
   ========================================================================== */
function initTheme() {
  const themeToggle = document.getElementById('themeToggle');
  const themeLabel = document.getElementById('themeLabel');
  const htmlRoot = document.documentElement;

  // Retrieve saved preference or default to dark (classic terminal)
  const savedTheme = localStorage.getItem('portfolio-theme') || 'dark';
  applyTheme(savedTheme);

  // Handle manual toggle click
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const currentTheme = htmlRoot.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      applyTheme(newTheme);
      localStorage.setItem('portfolio-theme', newTheme);
    });
  }

  function applyTheme(theme) {
    htmlRoot.setAttribute('data-theme', theme);
    if (themeLabel) {
      themeLabel.textContent = `[THEME: ${theme.toUpperCase()}]`;
    }
  }
}

/* ==========================================================================
   2. Responsive Mobile Navigation Menu
   ========================================================================== */
function initMobileNav() {
  const mobileToggle = document.getElementById('mobileToggle');
  const navMenu = document.getElementById('navMenu');
  const navLinks = document.querySelectorAll('.nav-link');

  if (!mobileToggle || !navMenu) return;

  function toggleMenu(open) {
    const shouldOpen = open !== undefined ? open : !navMenu.classList.contains('open');
    navMenu.classList.toggle('open', shouldOpen);
    mobileToggle.setAttribute('aria-expanded', String(shouldOpen));
    mobileToggle.textContent = shouldOpen ? '[CLOSE]' : '[MENU]';
  }

  mobileToggle.addEventListener('click', () => toggleMenu());

  // Close menu when clicking any nav link
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (navMenu.classList.contains('open')) {
        toggleMenu(false);
      }
    });
  });

  // Close menu on click outside
  document.addEventListener('click', (event) => {
    if (navMenu.classList.contains('open') &&
        !navMenu.contains(event.target) &&
        !mobileToggle.contains(event.target)) {
      toggleMenu(false);
    }
  });

  // Close menu on Escape key
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navMenu.classList.contains('open')) {
      toggleMenu(false);
      mobileToggle.focus();
    }
  });
}

/* ==========================================================================
   3. Active Section Navigation Observer
   ========================================================================== */
function initActiveNavObserver() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');

  if (!('IntersectionObserver' in window) || sections.length === 0) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      }
    });
  }, {
    rootMargin: '-20% 0px -60% 0px'
  });

  sections.forEach(section => observer.observe(section));
}

/* ==========================================================================
   4. Native <dialog> Modal Management & Light-Dismiss Fallback
   ========================================================================== */
function initModals() {
  const triggers = document.querySelectorAll('.modal-trigger');
  const dialogs = document.querySelectorAll('dialog.modal');

  // Wire trigger buttons
  triggers.forEach(button => {
    button.addEventListener('click', () => {
      const modalId = button.getAttribute('data-modal');
      const dialog = document.getElementById(modalId);
      if (dialog && typeof dialog.showModal === 'function') {
        dialog.showModal();
        document.body.style.overflow = 'hidden';
      }
    });
  });

  dialogs.forEach(dialog => {
    // Restore body scroll on close
    dialog.addEventListener('close', () => {
      document.body.style.overflow = '';
    });

    // Fallback for browsers that do not support the declarative `closedby="any"` attribute
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;

        const rect = dialog.getBoundingClientRect();
        const isDialogContent = (
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width
        );

        if (!isDialogContent) {
          dialog.close();
        }
      });
    }
  });
}

/* ==========================================================================
   5. Interactive Contact Form with CLI Toast
   ========================================================================== */
function initContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = form.elements['name']?.value.trim();
    const email = form.elements['email']?.value.trim();
    const recipient = form.elements['recipient']?.value;
    const subject = form.elements['subject']?.value.trim();
    const message = form.elements['message']?.value.trim();

    // Basic Validation
    if (!name || !email || !subject || !message) {
      showToast('[ERR 400] All input flags are mandatory. Please fill in all fields.', false);
      return;
    }

    if (!isValidEmail(email)) {
      showToast('[ERR 422] Invalid email format supplied.', false);
      return;
    }

    // Determine recipient text
    let target = 'Tuấn Anh & Hữu Hiệp';
    if (recipient === 'anh' || recipient === 'tuananh') target = 'Tuấn Anh (Front-End)';
    if (recipient === 'hiep' || recipient === 'huuhiep') target = 'Hữu Hiệp (Database)';

    // Show simulated success toast
    showToast(`[OK 200] Payload dispatched! Thank you ${name}, routed to ${target}.`, true);
    form.reset();
  });

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}

/* ==========================================================================
   6. Quick CLI Command Jumper
   ========================================================================== */
function initQuickCli() {
  const cliInput = document.getElementById('quickCli');
  if (!cliInput) return;

  cliInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const rawCmd = cliInput.value.trim().toLowerCase();
      cliInput.value = '';

      if (!rawCmd) return;

      switch (rawCmd) {
        case 'counterops':
        case 'pos':
          scrollToSection('projects');
          const p1Modal = document.getElementById('modalProject1');
          if (p1Modal && typeof p1Modal.showModal === 'function') p1Modal.showModal();
          showToast(`$ man counterops(1) [BUFFER OPEN]`, true);
          break;
        case 'travel':
        case 'vietvoyage':
          scrollToSection('projects');
          const p2Modal = document.getElementById('modalProject2');
          if (p2Modal && typeof p2Modal.showModal === 'function') p2Modal.showModal();
          showToast(`$ man travel-planner(1) [BUFFER OPEN]`, true);
          break;
        case 'projects':
        case './projects':
        case 'project':
          scrollToSection('projects');
          showToast(`$ cd ./projects [OK]`, true);
          break;
        case 'team':
        case './team':
          scrollToSection('team');
          showToast(`$ cd ./team [OK]`, true);
          break;
        case 'skills':
        case './skills':
        case 'stack':
          scrollToSection('skills');
          showToast(`$ tree ./skills [OK]`, true);
          break;
        case 'about':
        case './about':
          scrollToSection('about');
          showToast(`$ cat README.md [OK]`, true);
          break;
        case 'contact':
        case './contact':
          scrollToSection('contact');
          showToast(`$ ./send_message.sh [OK]`, true);
          break;
        case 'home':
        case 'top':
        case 'clear':
          window.scrollTo({ top: 0, behavior: 'smooth' });
          showToast(`$ clear [SCREEN RESET]`, true);
          break;
        case 'theme':
          const htmlRoot = document.documentElement;
          const currentTheme = htmlRoot.getAttribute('data-theme') || 'dark';
          const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
          htmlRoot.setAttribute('data-theme', newTheme);
          localStorage.setItem('portfolio-theme', newTheme);
          const themeLabel = document.getElementById('themeLabel');
          if (themeLabel) themeLabel.textContent = `[THEME: ${newTheme.toUpperCase()}]`;
          showToast(`$ setenv THEME=${newTheme.toUpperCase()}`, true);
          break;
        case 'help':
        case '?':
          showToast(`Commands: projects, team, skills, about, contact, clear, theme`, true);
          break;
        default:
          showToast(`[ERR 127] command not found: "${rawCmd}". Type 'help' for options.`, false);
          break;
      }
    }
  });

  function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }
}

/* ==========================================================================
   7. Back to Top Smooth Scroll
   ========================================================================== */
function initBackToTop() {
  const backToTopBtn = document.getElementById('backToTop');
  if (!backToTopBtn) return;

  backToTopBtn.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });
}

/* Global Toast Notification Utility */
let toastTimer = null;
function showToast(message, isSuccess = true) {
  const toast = document.getElementById('feedbackToast');
  const toastMsg = document.getElementById('toastMessage');
  if (!toast || !toastMsg) return;

  if (toastTimer) clearTimeout(toastTimer);

  toastMsg.textContent = message;
  toast.style.borderColor = isSuccess ? 'var(--term-green)' : 'var(--term-red)';
  toast.classList.add('show');

  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 4500);
}
