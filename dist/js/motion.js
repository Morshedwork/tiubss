/** Small, optional enhancements. Every route mount disposes the previous one. */
let disposeCurrent = () => {};

export const motionStyles = `
  html[data-motion="on"] .motion-ready {
    transition: opacity 700ms ease var(--reveal-delay, 0ms),
                translate 700ms cubic-bezier(.2,.7,.2,1) var(--reveal-delay, 0ms);
  }
  html[data-motion="on"] .motion-ready:not(.is-revealed) {
    opacity: 0;
    translate: 0 22px;
  }
  html[data-motion="on"] .motion-ready.is-revealed {
    opacity: 1;
    translate: 0 0;
  }
  html[data-motion="off"] .motion-ready { opacity: 1; translate: none; }
  @media (prefers-reduced-motion: reduce) {
    html:not([data-motion="on"]) .motion-ready { opacity: 1; translate: none; }
  }
  @media print {
    html[data-motion] .motion-ready { opacity: 1 !important; translate: none !important; }
  }
`;

const clamp = (value, limit = 1) => Math.max(-limit, Math.min(limit, value));
const interactive = 'input, textarea, select, button, [contenteditable="true"]';

function savedPreference() {
  try {
    const value = localStorage.getItem('bss-motion');
    return value === 'on' || value === 'off' ? value : null;
  } catch { return null; }
}

export function mountMotion() {
  disposeCurrent();
  const controller = new AbortController();
  const { signal } = controller;
  const root = document.documentElement;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const precise = window.matchMedia?.('(pointer: fine) and (hover: hover)');
  const revealElements = [...document.querySelectorAll('[data-reveal]')];
  const pointerElements = [...document.querySelectorAll('[data-parallax], [data-tilt]')];
  const buttons = [...document.querySelectorAll('[data-motion-toggle]')];
  let preference = savedPreference();
  let observer;
  let frame = 0;
  let enabled = false;
  const pending = new Map();

  if (!document.getElementById('bss-motion-styles')) {
    const style = document.createElement('style');
    style.id = 'bss-motion-styles';
    style.textContent = motionStyles;
    document.head.append(style);
  }

  function resetPointer(element) {
    pending.delete(element);
    element.style.setProperty('--mx', '0');
    element.style.setProperty('--my', '0');
    element.style.setProperty('--tilt-x', '0deg');
    element.style.setProperty('--tilt-y', '0deg');
    if (!pending.size && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  function revealAll() {
    observer?.disconnect();
    observer = null;
    for (const element of revealElements) {
      element.classList.remove('motion-ready');
      element.classList.add('is-revealed');
    }
  }

  function configure() {
    // Changing the preference never re-hides content that has already appeared.
    observer?.disconnect();
    observer = null;
    enabled = preference ? preference === 'on' : !reduced?.matches;
    root.dataset.motion = enabled ? 'on' : 'off';
    for (const button of buttons) {
      const label = enabled ? 'Pause motion' : 'Enable motion';
      const text = button.querySelector('[data-motion-label]');
      (text || button).textContent = label;
      button.setAttribute('aria-label', label);
      // This is a pause toggle: pressed means the motion is paused.
      button.setAttribute('aria-pressed', String(!enabled));
    }
    pointerElements.forEach(resetPointer);
    if (!enabled || reduced?.matches || typeof IntersectionObserver !== 'function') {
      revealAll();
      return;
    }
    try {
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-revealed');
          observer?.unobserve(entry.target);
        }
      }, { threshold: 0.06, rootMargin: '0px 0px -24px 0px' });
      for (const [index, element] of revealElements.entries()) {
        if (element.classList.contains('is-revealed')) continue;
        // Stagger in small groups so a long page never produces a long wait.
        element.style.setProperty('--reveal-delay', `${(index % 4) * 65}ms`);
        observer.observe(element);
        element.classList.add('motion-ready');
      }
    } catch {
      // A partial or unavailable observer must never leave content invisible.
      revealAll();
    }
  }

  function flushPointer() {
    frame = 0;
    for (const [element, point] of pending) {
      if (!element.isConnected) continue;
      if (element.hasAttribute('data-parallax')) {
        element.style.setProperty('--mx', point.x.toFixed(3));
        element.style.setProperty('--my', point.y.toFixed(3));
      }
      if (element.hasAttribute('data-tilt')) {
        element.style.setProperty('--tilt-x', `${(-point.y * 4).toFixed(2)}deg`);
        element.style.setProperty('--tilt-y', `${(point.x * 4).toFixed(2)}deg`);
      }
    }
    pending.clear();
  }

  for (const element of pointerElements) {
    element.addEventListener('pointermove', event => {
      if (!enabled || !precise?.matches || event.pointerType === 'touch') return;
      if (event.target instanceof Element && event.target.closest(interactive)) {
        resetPointer(element);
        return;
      }
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pending.set(element, {
        x: clamp((event.clientX - rect.left) / rect.width * 2 - 1),
        y: clamp((event.clientY - rect.top) / rect.height * 2 - 1)
      });
      if (!frame) frame = requestAnimationFrame(flushPointer);
    }, { passive: true, signal });
    element.addEventListener('pointerleave', () => resetPointer(element), { signal });
    element.addEventListener('pointercancel', () => resetPointer(element), { signal });
    // Keyboard navigation stays visually steady and reveals focusable content.
    element.addEventListener('focusin', () => resetPointer(element), { signal });
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      preference = enabled ? 'off' : 'on';
      try { localStorage.setItem('bss-motion', preference); } catch { /* Session still works. */ }
      configure();
    }, { signal });
  }
  document.addEventListener('focusin', event => {
    const element = event.target instanceof Element ? event.target.closest('.motion-ready') : null;
    if (!element) return;
    element.classList.add('is-revealed');
    observer?.unobserve(element);
  }, { signal });
  reduced?.addEventListener?.('change', configure, { signal });
  precise?.addEventListener?.('change', () => pointerElements.forEach(resetPointer), { signal });
  window.addEventListener('blur', () => pointerElements.forEach(resetPointer), { signal });
  window.addEventListener('storage', event => {
    if (event.key !== 'bss-motion' && event.key !== null) return;
    preference = savedPreference();
    configure();
  }, { signal });

  disposeCurrent = () => {
    controller.abort();
    revealAll();
    pointerElements.forEach(resetPointer);
    pending.clear();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
  configure();
  return disposeCurrent;
}
