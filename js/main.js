/* ============================================================
   InteractIA — interacción y animaciones (vanilla JS)
   ============================================================ */
(function () {
  'use strict';

  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Posición de scroll unificada (iOS Safari incluido)
  const getScrollY = () =>
    window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;

  /* ------------------------------------------------------------
     Íconos Lucide
     ------------------------------------------------------------ */
  if (window.lucide) {
    window.lucide.createIcons();
  }

  /* ------------------------------------------------------------
     VIDEO DEL HERO — ping-pong loop
     Sin atributo loop: el video avanza y, al llegar al final, se
     reproduce hacia atrás manejando currentTime con rAF. Nunca hay
     salto de frame porque solo cambia de dirección en los extremos.
     ------------------------------------------------------------ */
  const heroVideo = document.getElementById('hero-video');
  if (heroVideo) {
    // Elegir la fuente por JS: el atributo media de <source> en <video>
    // no es confiable en Chrome (ignora el media query y toma la primera).
    const want = window.matchMedia('(max-width: 767px)').matches
      ? 'assets/hero-mobile.mp4'
      : 'assets/hero-hd.mp4';
    if (!(heroVideo.currentSrc || '').includes(want.split('/').pop())) {
      heroVideo.src = want;
    }

    // Refuerzo explícito de los atributos críticos para iOS
    heroVideo.muted = true;
    heroVideo.playsInline = true;

    if (prefersReducedMotion) {
      // Sin ping-pong: pausado en el primer frame (o el poster)
      heroVideo.autoplay = false;
      heroVideo.pause();
      heroVideo.currentTime = 0;
    } else {
      let direction = 1;
      let lastTimestamp = null;
      let accumulated = 0; // acumulador: seeks a ~30fps, suave y sin jitter en iOS
      let rafId = null;
      let booted = false;  // el loop ya arrancó al menos una vez
      let inView = true;   // lo mantiene actualizado el IntersectionObserver
      const EDGE = 0.05; // margen en los extremos
      const SEEK_INTERVAL = 1 / 30;

      function step(timestamp) {
        if (lastTimestamp === null) lastTimestamp = timestamp;
        // Clamp del delta: si la pestaña estuvo oculta, no dar un salto
        const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
        lastTimestamp = timestamp;
        accumulated += delta;

        // Actualizar currentTime cada ~33ms (30fps efectivos):
        // imperceptible y evita saturar el pipeline de seeks del navegador
        if (accumulated >= SEEK_INTERVAL && heroVideo.duration) {
          const newTime = heroVideo.currentTime + accumulated * direction;
          accumulated = 0;

          if (newTime >= heroVideo.duration - EDGE) {
            direction = -1;
            heroVideo.currentTime = heroVideo.duration - EDGE;
          } else if (newTime <= EDGE) {
            direction = 1;
            heroVideo.currentTime = EDGE;
          } else {
            heroVideo.currentTime = newTime;
          }
        }
        rafId = requestAnimationFrame(step);
      }

      function stopLoop() {
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = null;
        lastTimestamp = null;
      }

      // Arranque/reanudación LIMPIA: cancela cualquier rAF previo,
      // resetea el timestamp y relanza. Segura de llamar mil veces.
      function ensureRunning() {
        if (!booted || !inView || document.visibilityState !== 'visible') return;
        stopLoop();
        rafId = requestAnimationFrame(step);
      }

      // Warm-up del decoder: iOS no pinta frames al hacer seek si el
      // video nunca reprodujo. play() explícito con fallback a primera
      // interacción del usuario (Low Power Mode bloquea autoplay).
      function warmUp() {
        const playPromise = heroVideo.play();
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            console.warn('Autoplay bloqueado por navegador, esperando interacción del usuario', error);
            document.addEventListener('touchstart', () => heroVideo.play().catch(() => {}), { once: true });
            document.addEventListener('click', () => heroVideo.play().catch(() => {}), { once: true });
          });
        }
      }

      // En cuanto el video de verdad reproduce, el rAF toma el control
      // (pausamos: el tiempo lo maneja el ping-pong, no el playback)
      heroVideo.addEventListener('playing', () => {
        heroVideo.pause();
        booted = true;
        ensureRunning();
      });

      // Esperar HAVE_FUTURE_DATA (>=3): en iOS, >=2 es insuficiente
      if (heroVideo.readyState >= 3) {
        warmUp();
      } else {
        heroVideo.addEventListener('canplay', warmUp, { once: true });
      }

      // Viewport: pausar fuera, reanudar al volver
      new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            inView = entry.isIntersecting;
            if (inView) ensureRunning();
            else stopLoop();
          });
        },
        { threshold: 0.1 }
      ).observe(heroVideo);

      // Ciclo de vida de pestaña/ventana: en TODOS estos eventos se
      // re-dispara limpiamente (el freeze clásico era volver de una
      // pestaña oculta con el pipeline de video suspendido)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          warmUp(); // re-inicia el pipeline de decodificación suspendido
          ensureRunning();
        } else {
          stopLoop();
        }
      });
      window.addEventListener('focus', ensureRunning);
      window.addEventListener('pageshow', () => {
        warmUp();
        ensureRunning();
      });
    }
  }

  /* ------------------------------------------------------------
     TYPEWRITER en el H1: "estás" → "puedes" → "quieres" en loop
     ------------------------------------------------------------ */
  const twTarget = document.getElementById('typewriter');
  if (twTarget && !prefersReducedMotion) {
    const WORDS = ['estás', 'puedes', 'quieres'];
    const TYPE_MS = 120;
    const DELETE_MS = 55;
    const HOLD_MS = 2000;
    let wordIdx = 0;

    function typeWord(word, i) {
      twTarget.textContent = word.slice(0, i);
      if (i < word.length) {
        setTimeout(() => typeWord(word, i + 1), TYPE_MS);
      } else {
        setTimeout(() => deleteWord(word, word.length), HOLD_MS);
      }
    }
    function deleteWord(word, i) {
      twTarget.textContent = word.slice(0, i);
      if (i > 0) {
        setTimeout(() => deleteWord(word, i - 1), DELETE_MS);
      } else {
        wordIdx = (wordIdx + 1) % WORDS.length;
        setTimeout(() => typeWord(WORDS[wordIdx], 0), 350);
      }
    }
    // Arranca borrando la palabra inicial ya renderizada ("estás")
    setTimeout(() => deleteWord(WORDS[0], WORDS[0].length), HOLD_MS);
  }
  // Con reduced-motion el CSS oculta el cursor y queda "estás" estático

  /* ------------------------------------------------------------
     CONTEO en los números de "Así trabajo contigo" (00 → 0N)
     ------------------------------------------------------------ */
  const stepNums = Array.from(document.querySelectorAll('.step-num'));
  if (stepNums.length && !prefersReducedMotion) {
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    function countUp(el) {
      const target = parseInt(el.textContent.trim(), 10) || 0;
      const DURATION = 1000;
      let start = null;
      function frame(ts) {
        if (start === null) start = ts;
        const t = Math.min((ts - start) / DURATION, 1);
        const val = Math.round(easeOutCubic(t) * target);
        el.textContent = String(val).padStart(2, '0');
        if (t < 1) requestAnimationFrame(frame);
      }
      el.textContent = '00';
      requestAnimationFrame(frame);
    }

    const countObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            countUp(entry.target);
            countObserver.unobserve(entry.target); // solo la primera vez
          }
        });
      },
      { threshold: 0.4 }
    );
    stepNums.forEach((el) => countObserver.observe(el));
  }

  /* ------------------------------------------------------------
     TYPEWRITER rápido en las descripciones de los pasos
     (sin cursor; ~0.6-0.8s por párrafo; solo la primera vez)
     ------------------------------------------------------------ */
  const stepParas = Array.from(document.querySelectorAll('.tl-step .tl-content p'));
  if (stepParas.length && !prefersReducedMotion) {
    stepParas.forEach((p) => {
      p.dataset.fullText = p.textContent.trim().replace(/\s+/g, ' ');
      // Reservar la altura final para que la página no salte al escribir
      p.style.minHeight = `${Math.ceil(p.getBoundingClientRect().height)}px`;
      p.textContent = '';
    });

    const typeObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          typeObserver.unobserve(entry.target); // solo la primera vez
          const p = entry.target;
          const full = p.dataset.fullText;
          let i = 0;
          const iv = setInterval(() => {
            i = Math.min(i + 2, full.length); // 2 caracteres por tick
            p.textContent = full.slice(0, i);
            if (i >= full.length) clearInterval(iv);
          }, 14);
        });
      },
      { threshold: 0.5 }
    );
    stepParas.forEach((p) => typeObserver.observe(p));
  }

  /* ------------------------------------------------------------
     NAV: fondo al scrollear + menú móvil
     ------------------------------------------------------------ */
  const nav = document.getElementById('nav');
  const burger = document.getElementById('burger');
  const mobileMenu = document.getElementById('mobile-menu');

  function updateNav() {
    nav.classList.toggle('scrolled', getScrollY() > 24);
  }
  updateNav();

  burger.addEventListener('click', () => {
    const open = mobileMenu.classList.toggle('open');
    burger.classList.toggle('active', open);
    document.body.style.overflow = open ? 'hidden' : '';
    // Stagger de los items del menú
    mobileMenu.querySelectorAll('.menu-item').forEach((el, i) => {
      el.style.transitionDelay = open ? `${0.08 + i * 0.05}s` : '0s';
    });
  });

  mobileMenu.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      mobileMenu.classList.remove('open');
      burger.classList.remove('active');
      document.body.style.overflow = '';
    });
  });

  /* ------------------------------------------------------------
     BOTÓN MAGNÉTICO (solo dispositivos con cursor)
     ------------------------------------------------------------ */
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (canHover && !prefersReducedMotion) {
    const magnets = Array.from(document.querySelectorAll('.magnetic'));
    const RADIUS = 130;

    window.addEventListener(
      'mousemove',
      (e) => {
        for (const btn of magnets) {
          const r = btn.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const dx = e.clientX - cx;
          const dy = e.clientY - cy;
          const dist = Math.hypot(dx, dy);

          if (dist < RADIUS) {
            const pull = (1 - dist / RADIUS) * 0.42;
            btn.style.transition = 'transform 0.3s ease-out';
            btn.style.transform = `translate3d(${dx * pull}px, ${dy * pull}px, 0)`;
            const label = btn.querySelector('.btn-label');
            if (label) {
              label.style.transform = `translate3d(${dx * pull * 0.35}px, ${dy * pull * 0.35}px, 0)`;
            }
          } else if (btn.style.transform && btn.style.transform !== 'translate3d(0px, 0px, 0)') {
            btn.style.transition = 'transform 0.6s ease-in-out';
            btn.style.transform = 'translate3d(0px, 0px, 0)';
            const label = btn.querySelector('.btn-label');
            if (label) label.style.transform = 'translate3d(0px, 0px, 0)';
          }
        }
      },
      { passive: true }
    );
  }

  /* ------------------------------------------------------------
     REVEAL de secciones y elementos (IntersectionObserver)
     ------------------------------------------------------------ */
  // Stagger automático: a los hijos marcados se les asigna un delay incremental
  document.querySelectorAll('[data-stagger]').forEach((parent) => {
    const step = parseFloat(parent.dataset.stagger) || 0.08;
    parent.querySelectorAll(':scope > .reveal').forEach((el, i) => {
      el.style.setProperty('--reveal-delay', `${i * step}s`);
    });
  });

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
  );
  document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

  // Secciones "encendidas" por la luz (borde/glow de las cards)
  const litObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle('lit', entry.isIntersecting);
      });
    },
    { threshold: 0.25 }
  );
  document.querySelectorAll('section[data-lit]').forEach((s) => litObserver.observe(s));

  /* ------------------------------------------------------------
     FRASE DE CIERRE: iluminación palabra por palabra
     ------------------------------------------------------------ */
  const closingLine = document.getElementById('closing-line');
  if (closingLine) {
    const words = closingLine.textContent.trim().split(/\s+/);
    closingLine.textContent = '';
    words.forEach((word, i) => {
      const span = document.createElement('span');
      span.className = 'w';
      span.textContent = word;
      span.style.setProperty('--w-delay', `${i * 0.07}s`);
      closingLine.appendChild(span);
      if (i < words.length - 1) closingLine.appendChild(document.createTextNode(' '));
    });

    const lineObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            closingLine.classList.add('lit-up');
            lineObserver.disconnect();
          }
        });
      },
      { threshold: 0.5 }
    );
    lineObserver.observe(closingLine);
  }

  /* ------------------------------------------------------------
     FAQ — acordeón
     ------------------------------------------------------------ */
  document.querySelectorAll('.faq-item').forEach((item) => {
    item.querySelector('.faq-q').addEventListener('click', () => {
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach((o) => o.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });

  /* ------------------------------------------------------------
     CONSTELACIÓN del stack: red de líneas entre las tarjetas.
     Al hover de una tarjeta se intensifican sus conexiones.
     ------------------------------------------------------------ */
  const constellation = document.getElementById('constellation');
  if (constellation) {
    const linesSvg = constellation.querySelector('.const-lines');
    const constCards = Array.from(constellation.querySelectorAll('.const-card'));
    // Red: cada tarjeta conecta con las cercanas (no grid, malla orgánica)
    const EDGES = [[0, 1], [0, 2], [1, 2], [1, 3], [2, 3]];

    function drawConstellation() {
      if (window.innerWidth < 1024) {
        linesSvg.innerHTML = '';
        return;
      }
      const cr = constellation.getBoundingClientRect();
      linesSvg.setAttribute('viewBox', `0 0 ${cr.width} ${cr.height}`);
      linesSvg.innerHTML = '';
      EDGES.forEach(([a, b]) => {
        const ra = constCards[a].getBoundingClientRect();
        const rb = constCards[b].getBoundingClientRect();
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', ra.left - cr.left + ra.width / 2);
        line.setAttribute('y1', ra.top - cr.top + ra.height / 2);
        line.setAttribute('x2', rb.left - cr.left + rb.width / 2);
        line.setAttribute('y2', rb.top - cr.top + rb.height / 2);
        line.dataset.a = a;
        line.dataset.b = b;
        linesSvg.appendChild(line);
      });
    }

    constCards.forEach((card, i) => {
      card.addEventListener('mouseenter', () => {
        linesSvg.querySelectorAll('line').forEach((l) => {
          if (+l.dataset.a === i || +l.dataset.b === i) l.classList.add('active');
        });
      });
      card.addEventListener('mouseleave', () => {
        linesSvg.querySelectorAll('line.active').forEach((l) => l.classList.remove('active'));
      });
    });

    drawConstellation();
    window.addEventListener('load', drawConstellation);
    // Redibujar cuando terminan los reveals (los rects se mueven 26px)
    setTimeout(drawConstellation, 2200);
    let constTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(constTimer);
      constTimer = setTimeout(drawConstellation, 200);
    });
  }

  /* ------------------------------------------------------------
     FORMULARIO DE CONTACTO — mailto como fallback simple.
     (Si Santi luego configura Formspree/Web3Forms, basta con
     reemplazar el bloque del mailto por un fetch al endpoint.)
     ------------------------------------------------------------ */
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    const submitBtn = document.getElementById('cf-submit');
    const submitLabel = submitBtn.querySelector('.btn-label');
    const originalLabel = submitLabel.innerHTML; // texto + flecha SVG
    const errorMsg = document.getElementById('cf-error');
    const EMAIL = 'santiagojsilvav@gmail.com';

    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();

      // Validación básica: todos los campos requeridos
      const fields = Array.from(contactForm.querySelectorAll('.field-input'));
      let valid = true;
      fields.forEach((f) => {
        const empty = !f.value.trim();
        f.classList.toggle('invalid', empty);
        if (empty) valid = false;
      });
      errorMsg.classList.toggle('hidden', valid);
      if (!valid) return;

      const val = (name) => contactForm.querySelector(`[name="${name}"]`).value.trim();
      const subject = `Consulta desde interactia.agency - ${val('name')}`;
      const body = [
        `Nombre: ${val('name')}`,
        `Tipo de negocio: ${val('business')}`,
        `WhatsApp: ${val('whatsapp')}`,
        '',
        val('message'),
      ].join('\n');

      submitLabel.textContent = 'Enviando...';
      submitBtn.disabled = true;

      window.location.href =
        `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      setTimeout(() => {
        submitLabel.textContent = '¡Enviado! Te respondo pronto';
        setTimeout(() => {
          submitLabel.innerHTML = originalLabel; // restaura texto + flecha
          submitBtn.disabled = false;
          contactForm.reset();
        }, 4000);
      }, 1000);
    });

    // Al escribir, limpiar el estado de error del campo
    contactForm.addEventListener('input', (e) => {
      if (e.target.classList.contains('field-input') && e.target.value.trim()) {
        e.target.classList.remove('invalid');
      }
    });
  }

  /* ============================================================
     CAMINO DE LUZ
     Un trazo SVG orgánico que recorre toda la página y se
     "dibuja" con el scroll, con un cometa de luz en la punta.
     ============================================================ */
  const lightLayer = document.getElementById('light-layer');
  const lightSvg = document.getElementById('light-svg');
  const comet = document.getElementById('comet');
  const trails = lightSvg ? Array.from(lightSvg.querySelectorAll('path')) : [];

  let pathLength = 0;
  let samples = []; // [{ len, x, y }] — tabla para buscar la punta por posición Y
  let nodeMarks = []; // nodos del timeline: se encienden al pasar la punta
  let constZone = null; // banda vertical de la constelación (red energizable)
  let currentLen = 0;
  let targetLen = 0;
  let rafId = null;
  let settled = false;

  // Curva por tramos con TANGENTE VERTICAL en cada waypoint: cada
  // segmento es una S monótona en Y, así que el trazo no puede formar
  // rulos ni auto-intersecciones jamás (a diferencia de Catmull-Rom,
  // que sobregiraba en los cambios de dirección). Los tramos con la
  // misma X quedan perfectamente rectos.
  function smoothPath(pts) {
    if (pts.length < 2) return '';
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const k = (b.y - a.y) * 0.45;
      d += ` C ${a.x.toFixed(1)} ${(a.y + k).toFixed(1)}, ${b.x.toFixed(1)} ${(b.y - k).toFixed(1)}, ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    return d;
  }

  function buildLightPath() {
    if (!lightSvg) return;

    const w = document.documentElement.clientWidth;
    const h = document.documentElement.scrollHeight;
    const isMobile = w < 768;

    lightSvg.setAttribute('width', w);
    lightSvg.setAttribute('height', h);
    lightSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    // Trazado central-orgánico consciente de los títulos: la línea
    // serpentea libremente por el centro (las tarjetas la difuminan con
    // su backdrop-filter al pasar por detrás), y SOLO se aparta hacia el
    // costado con más espacio al cruzar la banda vertical de cada título
    // blanco grande (H2 y frase de cierre), que no tiene blur y se
    // ensuciaría con la línea encima.
    const stops = Array.from(document.querySelectorAll('[data-light-stop]'));
    if (!stops.length) return;

    const firstRect = stops[0].getBoundingClientRect();
    const firstTop = firstRect.top + getScrollY();
    const lastRect = stops[stops.length - 1].getBoundingClientRect();
    const lastBottom = lastRect.top + getScrollY() + lastRect.height;

    const titles = Array.from(document.querySelectorAll('main section h2, #closing-line'));
    const PAD = 60; // margen vertical de seguridad alrededor de cada título

    // Punto de nacimiento de la luz: SIEMPRE debajo del hero (el hero
    // tiene la ciudad opaca encima de esta capa y taparía el punto),
    // a la altura del H2 de "Lo que puedo hacer por tu negocio" —
    // visible al cargar si la sección asoma al final del viewport.
    let startX = w * 0.55;
    let startY = firstTop + 10;
    if (titles.length) {
      const t0 = titles[0].getBoundingClientRect();
      startY = Math.max(t0.top + getScrollY() - 90, firstTop + 10);
    }
    const pts = [{ x: startX, y: startY }];
    let lastY = pts[0].y;
    // y siempre creciente para que la búsqueda de la punta sea estable
    const push = (x, y) => {
      const yy = Math.max(y, lastY + 40);
      pts.push({ x, y: yy });
      lastY = yy;
    };

    let meander = 1; // alterna el lado del serpenteo central
    titles.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const top = r.top + getScrollY();
      const bottom = top + r.height;

      // Lado con más aire respecto al título (izq. o der.), a mitad
      // del espacio libre para no pegarse ni al texto ni al borde.
      // Si el título es tan ancho que no queda margen (frases centradas
      // en móvil), la línea sale del canvas y reaparece más abajo.
      const leftSpace = r.left;
      const rightSpace = w - r.right;
      const space = Math.max(leftSpace, rightSpace);
      let sideX;
      if (space < 56) {
        sideX = leftSpace > rightSpace ? -24 : w + 24;
      } else {
        sideX = leftSpace > rightSpace
          ? Math.max(leftSpace * 0.5, 14)
          : w - Math.max(rightSpace * 0.5, 14);
      }

      // Esquiva el título por el costado…
      push(sideX, top - PAD);
      push(sideX, bottom + PAD);

      // En "Así trabajo contigo" la línea baja RECTA por los nodos del
      // timeline (centro en desktop, izquierda en móvil): la línea de
      // luz ES el conector de los pasos.
      const sec = el.closest('section');
      if (sec && sec.id === 'como-trabajo') {
        const nodes = sec.querySelectorAll('.tl-node');
        if (nodes.length) {
          const f = nodes[0].getBoundingClientRect();
          const nx = f.left + f.width / 2;
          const fy = f.top + getScrollY();
          // El tramo recto termina DESPUÉS del texto completo del último
          // paso (no en su nodo): en móvil la salida en diagonal cruzaba
          // el texto del paso 04.
          const lastStep = sec.querySelector('.tl-step:last-of-type');
          const sb = lastStep.getBoundingClientRect();
          const exitY = sb.top + getScrollY() + sb.height + 15;
          // Entrada 90px por encima del primer nodo: la línea ya viene
          // vertical y recta antes de acercarse al número "01" (el
          // barrido horizontal de la S ocurre lejos, a media distancia
          // del título). Con tangentes verticales no hacen falta pines.
          push(nx, fy - 90);
          push(nx, exitY);
        }
      }

      // …y vuelve a serpentear por el centro hasta el próximo título
      const nextTop = i < titles.length - 1
        ? titles[i + 1].getBoundingClientRect().top + getScrollY()
        : lastBottom;
      if (nextTop - bottom > 420) {
        push(w * (meander > 0 ? 0.63 : 0.37), (bottom + nextTop) / 2);
        meander *= -1;
      }
    });

    // Remate centrado en el padding vacío bajo la última sección
    push(w * 0.5, lastBottom - 30);

    const d = smoothPath(pts);
    trails.forEach((p) => p.setAttribute('d', d));

    const ref = trails[0];
    pathLength = ref.getTotalLength();

    // Tabla de muestras para ubicar la punta según la posición Y del scroll
    const n = Math.max(60, Math.round(pathLength / 30));
    samples = [];
    for (let i = 0; i <= n; i++) {
      const len = (pathLength / n) * i;
      const pt = ref.getPointAtLength(len);
      samples.push({ len, x: pt.x, y: pt.y });
    }

    // Posiciones de los nodos del timeline (para encenderlos con la punta)
    nodeMarks = Array.from(document.querySelectorAll('.tl-node')).map((el) => {
      const r = el.getBoundingClientRect();
      return { el, y: r.top + getScrollY() + r.height / 2 };
    });

    // Zona de la constelación: la red se energiza cuando la punta pasa
    const constEl = document.getElementById('constellation');
    if (constEl) {
      const cr = constEl.getBoundingClientRect();
      constZone = {
        el: constEl,
        top: cr.top + getScrollY() - 120,
        bottom: cr.top + getScrollY() + cr.height + 120,
      };
    }

    // El dibujado por scroll corre SIEMPRE (también con reduced-motion:
    // lo controla el dedo/rueda del usuario, no es animación autónoma)
    trails.forEach((p) => {
      p.style.strokeDasharray = `${pathLength}`;
      p.style.strokeDashoffset = `${pathLength - currentLen}`;
    });
  }

  // La punta de la luz debe estar a ~62% de la altura del viewport actual
  // (innerHeight es dinámico: sigue a la barra de URL de Safari iOS)
  function computeTargetLen() {
    const tipDocY = getScrollY() + window.innerHeight * 0.62;
    // Búsqueda binaria sobre las muestras (Y crece casi monotónicamente)
    let lo = 0;
    let hi = samples.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].y < tipDocY) lo = mid + 1;
      else hi = mid;
    }
    return samples[Math.min(lo, samples.length - 1)].len;
  }

  function pointAt(len) {
    const t = (len / pathLength) * (samples.length - 1);
    const i = Math.min(Math.floor(t), samples.length - 2);
    const f = t - i;
    const a = samples[i];
    const b = samples[i + 1];
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }

  function tick() {
    const delta = targetLen - currentLen;
    if (Math.abs(delta) < 0.5) {
      currentLen = targetLen;
      settled = true;
      rafId = null;
    } else {
      currentLen += delta * 0.1; // suavizado: la luz "persigue" al dedo
      rafId = requestAnimationFrame(tick);
    }

    const offset = pathLength - currentLen;
    trails.forEach((p) => {
      p.style.strokeDashoffset = `${offset}`;
    });

    const tip = pointAt(currentLen);
    comet.style.transform = `translate3d(${tip.x}px, ${tip.y}px, 0)`;

    // Nodos del timeline: encendidos cuando la punta ya pasó por ellos
    for (const n of nodeMarks) {
      n.el.classList.toggle('node-lit', tip.y >= n.y - 8);
    }

    // Red de la constelación: energizada mientras la punta la recorre
    if (constZone) {
      constZone.el.classList.toggle(
        'net-lit',
        tip.y >= constZone.top && tip.y <= constZone.bottom
      );
    }
  }

  function wake() {
    targetLen = computeTargetLen();
    if (settled || rafId === null) {
      settled = false;
      if (rafId === null) rafId = requestAnimationFrame(tick);
    }
  }

  if (lightSvg && trails.length) {
    buildLightPath();

    // Scroll + touchmove (Safari iOS a veces solo actualiza fluido con
    // el touchmove explícito mientras el dedo arrastra). Ambos passive;
    // el trabajo real (dashoffset) ocurre dentro del rAF de tick().
    const handleScroll = () => {
      updateNav();
      wake();
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('touchmove', handleScroll, { passive: true });
    wake();

    // Reconstruir si cambia el layout (resize, acordeón abierto, fuentes)
    let rebuildTimer = null;
    function scheduleRebuild() {
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(() => {
        buildLightPath();
        wake();
      }, 180);
    }
    window.addEventListener('resize', scheduleRebuild);
    window.addEventListener('load', scheduleRebuild);
    // El swap de las fuentes web mueve los títulos: reconstruir al cargar
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(scheduleRebuild);
    }
    if ('ResizeObserver' in window) {
      new ResizeObserver(scheduleRebuild).observe(document.body);
    }
  } else {
    window.addEventListener('scroll', updateNav, { passive: true });
  }
})();
