(() => {
  const supportsFinePointer = window.matchMedia('(pointer: fine)').matches;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!supportsFinePointer || prefersReducedMotion) {
    return;
  }

  const root = document.documentElement;
  let pointerFrame;

  document.addEventListener('pointermove', (event) => {
    window.cancelAnimationFrame(pointerFrame);
    pointerFrame = window.requestAnimationFrame(() => {
      root.style.setProperty('--cursor-x', `${event.clientX}px`);
      root.style.setProperty('--cursor-y', `${event.clientY}px`);
      document.body.classList.add('has-pointer');
    });
  }, { passive: true });

  document.querySelectorAll('[data-tilt-card]').forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      const bounds = card.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width;
      const y = (event.clientY - bounds.top) / bounds.height;

      card.style.setProperty('--rx', `${(0.5 - y) * 3.2}deg`);
      card.style.setProperty('--ry', `${(x - 0.5) * 4.2}deg`);
      card.style.setProperty('--glow-x', `${x * 100}%`);
      card.style.setProperty('--glow-y', `${y * 100}%`);
    });

    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
      card.style.setProperty('--glow-x', '50%');
      card.style.setProperty('--glow-y', '50%');
    });
  });

  const formPanel = document.querySelector('[data-tilt-panel]');

  if (formPanel) {
    formPanel.addEventListener('pointermove', (event) => {
      const bounds = formPanel.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width;
      const y = (event.clientY - bounds.top) / bounds.height;

      formPanel.style.setProperty('--panel-rx', `${(0.5 - y) * 1.2}deg`);
      formPanel.style.setProperty('--panel-ry', `${(x - 0.5) * 1.5}deg`);
    });

    formPanel.addEventListener('pointerleave', () => {
      formPanel.style.setProperty('--panel-rx', '0deg');
      formPanel.style.setProperty('--panel-ry', '0deg');
    });
  }
})();
