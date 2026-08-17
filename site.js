// Mark JS active, then trigger the first-load hero intro after first paint
document.documentElement.classList.add('js');
window.addEventListener('DOMContentLoaded', function () {
  setTimeout(function () { document.documentElement.classList.add('is-loaded'); }, 80);
});

// Shared site behaviour: sticky nav, mobile menu, scroll reveals
(function () {
  var nav = document.querySelector('.nav');
  var toggle = document.querySelector('.nav__toggle');
  var links = document.querySelector('.nav__links');

  function onScroll() {
    if (!nav) return;
    if (window.scrollY > 40) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (toggle && links) {
    toggle.addEventListener('click', function () {
      links.classList.toggle('open');
    });
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { links.classList.remove('open'); });
    });
  }

  // Reveal on scroll — snappy, with a light stagger for grouped items
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('.reveal').forEach(function (el) {
    if (!reduceMotion && el.parentElement) {
      var sibs = [].slice.call(el.parentElement.children).filter(function (c) { return c.classList.contains('reveal'); });
      var idx = sibs.indexOf(el);
      if (idx > 0) el.style.transitionDelay = Math.min(idx, 6) * 65 + 'ms';
    }
    io.observe(el);
  });


  /* ---------------------------------------------------------------
     Auto-playing, muted-by-default video with a click-to-unmute button.
     Usage: add  data-video="videos/clip.mp4"  (and optionally
     data-poster="images/clip.jpg") to any .ph / .hero-photo /
     .hero__media-fill element. Everything below is automatic.
     --------------------------------------------------------------- */
  var ICON_MUTED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';
  var ICON_SOUND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>';

  var clips = [];  // every enhanced clip: { video, btn }

  function setMuted(clip, muted) {
    clip.video.muted = muted;
    if (clip.btn) {
      clip.btn.innerHTML = muted ? ICON_MUTED : ICON_SOUND;
      clip.btn.setAttribute('aria-label', muted ? 'Unmute video' : 'Mute video');
    }
  }
  function tryPlay(v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }

  function makeButton(clip) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vid-sound';
    btn.setAttribute('aria-label', 'Unmute video');
    btn.innerHTML = ICON_MUTED;
    btn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var turnOn = clip.video.muted;
      // Only one clip plays sound at a time — mute every other clip first.
      if (turnOn) clips.forEach(function (c) { if (c !== clip) setMuted(c, true); });
      setMuted(clip, !turnOn);
      if (turnOn) tryPlay(clip.video);
    });
    return btn;
  }

  // Play only what's on screen; pause (and mute) clips that scroll away.
  var vio = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var clip = e.target._clip;
      if (!clip) return;
      if (e.isIntersecting) {
        tryPlay(clip.video);
      } else {
        clip.video.pause();
        if (!clip.video.muted) setMuted(clip, true);   // keep the one-sound rule tidy
      }
    });
  }, { threshold: 0.4 });

  function enhanceOne(host) {
    if (host._clip) return;                       // already enhanced
    var src = host.getAttribute('data-video');
    if (!src) return;

    var video = document.createElement('video');
    video.className = 'vid';
    video.muted = true;            // muted by default — required for autoplay
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    // Desktop: buffer ahead so below-the-fold films start instantly when
    // scrolled to. Mobile / data-saver keeps the lighter metadata preload.
    var saveData = navigator.connection && navigator.connection.saveData;
    video.preload = (saveData || window.matchMedia('(max-width: 760px)').matches) ? 'metadata' : 'auto';
    if (host.getAttribute('data-poster')) video.poster = host.getAttribute('data-poster');
    video.src = src;

    var clip = { video: video, btn: null };
    host._clip = clip;

    // Swap in the video (and show the sound button) once frames exist.
    // Fires on 'loadeddata' OR 'playing' — mobile browsers load almost
    // nothing until play() is called, so 'loadeddata' alone may never come.
    var activated = false;
    function activate() {
      if (activated) return;
      activated = true;
      host.classList.add('has-video');
      // data-nosound: silent clips (e.g. the home hero) get no mute button
      if (!host.hasAttribute('data-nosound')) {
        clip.btn = makeButton(clip);
        host.appendChild(clip.btn);
      }
    }
    video.addEventListener('loadeddata', activate);
    video.addEventListener('playing', activate);

    // If the file is missing, leave the placeholder untouched.
    video.addEventListener('error', function () {
      vio.unobserve(host);
      var i = clips.indexOf(clip); if (i > -1) clips.splice(i, 1);
      if (video.parentNode) video.parentNode.removeChild(video);
    });

    // Low Power Mode / data-saver blocks autoplay entirely — a tap on the
    // (frozen or poster) video starts it manually.
    video.addEventListener('click', function (e) {
      if (video.paused) { e.preventDefault(); e.stopPropagation(); tryPlay(video); }
    });

    host.insertBefore(video, host.firstChild);
    clips.push(clip);
    vio.observe(host);   // watch visibility immediately — the observer's
                         // play() call is what makes mobile start loading
  }

  // Public: enhance any [data-video] elements within scope (default: whole doc).
  // Safe to call repeatedly — already-enhanced hosts are skipped. Used by
  // dynamically-rendered pages (e.g. project.html) after they build their DOM.
  function enhance(scope) {
    (scope || document).querySelectorAll('[data-video]').forEach(enhanceOne);
  }
  window.JSVideos = { enhance: enhance };
  enhance(document);
})();

/* ---------------------------------------------------------------------
   Selected Work grid (home) — first six published projects as
   text-on-image cards: location eyebrow, serif title, agent · brokerage.
   --------------------------------------------------------------------- */
(async function () {
  var grid = document.getElementById('sw-grid');
  if (!grid) return;
  if (window.PROJECTS_READY) { try { await window.PROJECTS_READY; } catch (e) {} }
  var data = (window.PROJECTS_DATA || []).filter(function (p) { return !p.draft && p.cover_url; }).slice(0, 6);
  if (!data.length) { grid.parentElement.parentElement.style.display = 'none'; return; }

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];}); }

  grid.innerHTML = data.map(function (p) {
    var agent = [p.shot_for, p.brokerage].filter(Boolean).join(' · ');
    var href = p.cms ? '/project?slug=' + encodeURIComponent(p.slug) : '/project/' + esc(p.slug);
    return '<a class="sw-card reveal" href="' + href + '">' +
      '<img src="' + esc(p.cover_url) + '" alt="' + esc(p.title) + ' — ' + esc(p.location) + '" loading="lazy" decoding="async">' +
      '<span class="sw-card__loc">' + esc(p.location) + '</span>' +
      '<span class="sw-card__body"><span class="sw-card__title">' + esc(p.title) + '</span>' +
      (agent ? '<span class="sw-card__agent" style="display:block">' + esc(agent) + '</span>' : '') +
      '</span></a>';
  }).join('');

  // the reveal observer has already run — trigger these directly
  requestAnimationFrame(function () {
    grid.querySelectorAll('.reveal').forEach(function (el, i) {
      el.style.transitionDelay = Math.min(i, 6) * 65 + 'ms';
      el.classList.add('in');
    });
  });
})();

/* ---------------------------------------------------------------------
   Projects carousel (coverflow) — builds from window.PROJECTS, peeking
   neighbours, arrows, click-to-center, swipe, and seamless infinite loop.
   --------------------------------------------------------------------- */
(async function () {
  var car = document.getElementById('pcar');
  if (!car) return;
  if (window.PROJECTS_READY) { try { await window.PROJECTS_READY; } catch (e) {} }
  if (!window.PROJECTS || !window.PROJECTS.length) return;

  var base = window.PROJECTS, N = base.length;
  var viewport = car.querySelector('.pcar__viewport');
  var track = car.querySelector('.pcar__track');
  var locEl = car.querySelector('.pcar__loc');
  // With a single project there's nothing to loop — show one centered
  // slide and hide the arrows (drafts are filtered out of PROJECTS).
  var single = N < 2;
  var REPS = single ? 1 : 3;    // triple the list for an infinite feel
  var active = single ? 0 : N;  // start in the middle copy
  if (single) car.querySelectorAll('.pcar__arrow').forEach(function (a) { a.style.display = 'none'; });

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];}); }

  var html = '';
  for (var r = 0; r < REPS; r++) {
    for (var i = 0; i < N; i++) {
      var p = base[i];
      var media = p.img
        ? '<div class="ph ph--wide"><img src="' + esc(p.img) + '" alt="' + esc(p.title) + '" loading="lazy" decoding="async"></div>'
        : '<div class="ph ph--wide"></div>';
      html += '<div class="pslide" data-i="' + (r*N+i) + '" data-href="' + esc(p.file) + '" data-base="' + i + '">' +
        media +
        '<div class="pslide__overlay"><div class="pslide__title">' + esc(p.title) + '</div>' +
        '<span class="pslide__btn">View project</span></div></div>';
    }
  }
  track.innerHTML = html;
  var slides = Array.prototype.slice.call(track.children);

  function center(i, instant) {
    var slide = slides[i]; if (!slide) return;
    if (instant) track.classList.add('no-anim');   // freeze track + slide transitions
    var x = viewport.clientWidth / 2 - (slide.offsetLeft + slide.offsetWidth / 2);
    track.style.transform = 'translateX(' + x + 'px)';
    slides.forEach(function (s) { s.classList.toggle('is-active', s === slide); });
    if (locEl) locEl.textContent = base[+slide.dataset.base].loc;
    if (instant) { void track.offsetWidth; track.classList.remove('no-anim'); }   // re-enable after reflow
  }

  function go(n) { if (single) return; active += n; center(active); }

  // seamless loop: after the animated move lands in an outer copy, jump
  // back to the equivalent middle slide with no transition.
  track.addEventListener('transitionend', function (e) {
    if (e.propertyName !== 'transform') return;
    if (active < N) { active += N; center(active, true); }
    else if (active >= 2 * N) { active -= N; center(active, true); }
  });

  car.querySelector('.pcar__arrow--next').addEventListener('click', function () { go(1); });
  car.querySelector('.pcar__arrow--prev').addEventListener('click', function () { go(-1); });

  track.addEventListener('click', function (e) {
    var slide = e.target.closest('.pslide'); if (!slide) return;
    if (e.target.closest('.pslide__btn')) {
      if (slide.classList.contains('is-active')) location.href = slide.dataset.href;
      return;
    }
    if (!slide.classList.contains('is-active')) { active = +slide.dataset.i; center(active); }
  });

  // drag / swipe
  var down = null;
  viewport.addEventListener('pointerdown', function (e) { down = e.clientX; viewport.classList.add('dragging'); });
  window.addEventListener('pointerup', function (e) {
    if (down === null) return;
    var dx = e.clientX - down; down = null; viewport.classList.remove('dragging');
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  });

  // autoplay (pauses on hover / interaction; off for a single slide)
  var timer = single ? null : setInterval(function () { go(1); }, 4000);
  function pause(){ clearInterval(timer); }
  function resume(){ pause(); if (!single) timer = setInterval(function () { go(1); }, 4000); }
  car.addEventListener('mouseenter', pause);
  car.addEventListener('mouseleave', resume);
  car.addEventListener('pointerdown', resume);

  window.addEventListener('resize', function () { center(active, true); });
  center(active, true);
  // recenter once images/fonts settle
  setTimeout(function () { center(active, true); }, 250);
  window.addEventListener('load', function () { center(active, true); });
})();

/* ---------------------------------------------------------------------
   Custom inverting cursor — a trailing ring + center dot that grows
   over interactive elements. Fine-pointer, non-reduced-motion only.
   --------------------------------------------------------------------- */
(function () {
  if (!window.matchMedia) return;
  if (!matchMedia('(pointer: fine)').matches) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var ring = document.createElement('div'); ring.className = 'cursor';
  var dot = document.createElement('div'); dot.className = 'cursor-dot';
  document.body.appendChild(ring); document.body.appendChild(dot);
  document.documentElement.classList.add('has-cursor');

  var mx = window.innerWidth / 2, my = window.innerHeight / 2, rx = mx, ry = my;
  var hoverSel = 'a, button, input, textarea, select, .work, .proj-card, .pslide, .reel, .pcar__arrow, .nav__toggle, .vid-sound, [role="button"]';

  // Blue trail — a small pool of fading dots spawned as the cursor moves.
  var pool = [], POOL = 18, pi = 0, lastX = mx, lastY = my, canAnim = !!document.body.animate;
  for (var i = 0; i < POOL; i++) { var d = document.createElement('div'); d.className = 'cursor-trail'; document.body.appendChild(d); pool.push(d); }
  var darkSel = '.hero, .hero-photo, .section--navy, .footer, .ph, .pslide';
  function overDark(x, y) {
    var el = document.elementFromPoint(x, y);
    return !!(el && el.closest && el.closest(darkSel));
  }
  function spawnTrail(x, y) {
    if (!canAnim) return;
    var el = pool[pi]; pi = (pi + 1) % POOL;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.background = overDark(x, y) ? '#ffffff' : '#0f2240';
    el.animate(
      [{ opacity: 0.45, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.2)' }],
      { duration: 700, easing: 'cubic-bezier(.22,1,.36,1)' }
    );
  }

  document.addEventListener('mousemove', function (e) {
    mx = e.clientX; my = e.clientY;
    dot.style.transform = 'translate(' + mx + 'px,' + my + 'px)';
    var dx = mx - lastX, dy = my - lastY;
    if (dx * dx + dy * dy > 160) { spawnTrail(mx, my); lastX = mx; lastY = my; }
  });
  (function loop() {
    rx += (mx - rx) * 0.2; ry += (my - ry) * 0.2;
    ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px)';
    requestAnimationFrame(loop);
  })();

  document.addEventListener('mouseover', function (e) {
    if (e.target.closest && e.target.closest(hoverSel)) ring.classList.add('is-hover');
  });
  document.addEventListener('mouseout', function (e) {
    if (e.target.closest && e.target.closest(hoverSel)) ring.classList.remove('is-hover');
  });
  document.addEventListener('mouseleave', function () { ring.style.opacity = 0; dot.style.opacity = 0; });
  document.addEventListener('mouseenter', function () { ring.style.opacity = 1; dot.style.opacity = 1; });
})();

/* ---------------------------------------------------------------------
   Fullscreen gallery lightbox — JSLightbox.open(urls, startIndex).
   Arrow keys / on-screen arrows / swipe to navigate; Esc, the × button
   or a click on the backdrop to close. Neighbouring photos are
   preloaded so paging feels instant.
   --------------------------------------------------------------------- */
(function () {
  var urls = [], idx = 0, box = null, img = null, count = null, lastFocus = null;

  function build() {
    box = document.createElement('div');
    box.className = 'lb';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Photo viewer');
    box.innerHTML =
      '<figure class="lb__stage"><img class="lb__img" alt=""></figure>' +
      '<button class="lb__close" aria-label="Close viewer">&#10005;</button>' +
      '<button class="lb__arrow lb__arrow--prev" aria-label="Previous photo"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<button class="lb__arrow lb__arrow--next" aria-label="Next photo"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>' +
      '<div class="lb__count" aria-hidden="true"></div>';
    document.body.appendChild(box);
    img = box.querySelector('.lb__img');
    count = box.querySelector('.lb__count');
    box.querySelector('.lb__close').addEventListener('click', close);
    box.querySelector('.lb__arrow--prev').addEventListener('click', function (e) { e.stopPropagation(); go(-1); });
    box.querySelector('.lb__arrow--next').addEventListener('click', function (e) { e.stopPropagation(); go(1); });
    box.addEventListener('click', function (e) {
      if (e.target === box || e.target.classList.contains('lb__stage')) close();
    });
    // swipe
    var x0 = null;
    box.addEventListener('pointerdown', function (e) { x0 = e.clientX; });
    box.addEventListener('pointerup', function (e) {
      if (x0 === null) return;
      var dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    });
  }

  function show() {
    img.src = urls[idx];
    count.textContent = (idx + 1) + ' / ' + urls.length;
    [idx + 1, idx - 1].forEach(function (n) {
      if (n >= 0 && n < urls.length) { (new Image()).src = urls[n]; }
    });
  }
  function go(n) { if (urls.length < 2) return; idx = (idx + n + urls.length) % urls.length; show(); }

  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  }

  function open(list, start) {
    if (!list || !list.length) return;
    urls = list; idx = Math.min(Math.max(start || 0, 0), list.length - 1);
    if (!box) build();
    box.classList.toggle('lb--single', urls.length < 2);
    lastFocus = document.activeElement;
    box.classList.add('open');
    document.documentElement.classList.add('lb-open');
    document.addEventListener('keydown', onKey);
    show();
    box.querySelector('.lb__close').focus();
  }
  function close() {
    if (!box) return;
    box.classList.remove('open');
    document.documentElement.classList.remove('lb-open');
    document.removeEventListener('keydown', onKey);
    img.removeAttribute('src');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  window.JSLightbox = { open: open };
})();

/* ---------------------------------------------------------------------
   Branded error / fail block — the ONE way the site says "something's
   not right". Used by 404.html and by the client pages' fail states so
   every dead link, expired token or missing record looks the same.

     JSError.render(el, { code: '401', ... })  → fills `el` (which should
     carry class "err" — add "err--inline" for compact) and reveals it.

   Options (all optional; code picks the defaults):
     code     '401' | '403' | '404' | '410' | '500'  (also '502'/'503')
     eyebrow  small tracked label      title  headline (HTML ok, use <em>)
     text     one calm sentence (HTML ok)
     actions  [[label, href, solid?], …]   href 'reload' reloads the page
     links    false to drop the quiet site-links row, or [[label, href], …]
     path     true → "You asked for host/path" line (plain 404s)
   --------------------------------------------------------------------- */
(function () {
  var MAIL = 'mailto:jacxbschrader@gmail.com';
  var COPY = {
    '404': { eyebrow: 'Error 404 &mdash; Page not found', title: 'This page has <em>moved on.</em>',
             text: 'The link may be out of date, or the address was mistyped. Nothing’s lost — everything you’re looking for is a click away.',
             actions: [['Back to Home', '/', true], ['View the Work', '/projects', false]] },
    '401': { eyebrow: 'Error 401 &mdash; Sign-in required', title: 'This one’s <em>private.</em>',
             text: 'You’re looking at a client page. Sign in to the client portal and we’ll email you a fresh link — no password to remember.',
             actions: [['Client Portal', '/portal/login', true], ['Back to Home', '/', false]] },
    '403': { eyebrow: 'Error 403 &mdash; Not available', title: 'Not yours <em>to open.</em>',
             text: 'This link belongs to another client’s account. If it should be yours, sign in with your own email and it will appear in your portal.',
             actions: [['Client Portal', '/portal/login', true], ['Contact Jacob', '/contact', false]] },
    '410': { eyebrow: 'Error 410 &mdash; Link expired', title: 'This link has <em>expired.</em>',
             text: 'For your security, client links only work for a while. Sign in to the portal and a fresh one is one click away.',
             actions: [['Client Portal', '/portal/login', true], ['Back to Home', '/', false]] },
    '500': { eyebrow: 'Error 500 &mdash; Something went wrong', title: 'That’s on <em>us.</em>',
             text: 'Something broke on our end while loading this page. Give it another try in a moment — and if it keeps happening, tell Jacob directly.',
             actions: [['Try Again', 'reload', true], ['Email Jacob', MAIL, false]] }
  };
  COPY['502'] = COPY['503'] = COPY['500'];
  var LINKS = [['Services', '/services'], ['Book a Shoot', '/book'], ['Client Portal', '/portal'], ['Contact', '/contact']];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  function render(el, o) {
    if (!el) return;
    o = o || {};
    var code = String(o.code || '404');
    var base = COPY[code] || COPY['404'];
    var eyebrow = o.eyebrow || base.eyebrow, title = o.title || base.title, text = o.text || base.text;
    var actions = o.actions || base.actions;
    var links = o.links === false ? [] : (o.links || LINKS);
    if (!el.classList.contains('err')) el.classList.add('err');
    el.classList.remove('in');
    var h = '<div class="wrap">' +
      '<div class="err__code" aria-hidden="true">' + esc(code) + '</div>' +
      '<div class="err__body">' +
        '<span class="eyebrow err__eyebrow">' + eyebrow + '</span>' +
        '<h1 class="display err__title">' + title + '</h1>' +
        '<p class="err__text">' + text + '</p>' +
        (o.path ? '<p class="err__path">You asked for <code>' + esc(location.host + location.pathname) + '</code></p>' : '') +
        (actions.length ? '<div class="err__actions">' + actions.map(function (a) {
          return '<a class="btn' + (a[2] ? ' btn--solid' : '') + '" href="' + (a[1] === 'reload' ? '#' : esc(a[1])) + '"' +
                 (a[1] === 'reload' ? ' data-reload="1"' : '') + '>' + esc(a[0]) + '</a>';
        }).join('') + '</div>' : '') +
        (links.length ? '<div class="err__links">' + links.map(function (l) {
          return '<a href="' + esc(l[1]) + '">' + esc(l[0]) + '</a>';
        }).join('') + '</div>' : '') +
      '</div></div>';
    el.innerHTML = h;
    el.hidden = false;
    var r = el.querySelector('[data-reload]');
    if (r) r.addEventListener('click', function (e) { e.preventDefault(); location.reload(); });
    document.title = eyebrow.replace(/^Error \d+ &mdash; /, '').replace(/&mdash;/g, '—') + ' — Jacob Schrader';
    // setTimeout, not rAF: background tabs never fire rAF, and we want the
    // reveal queued regardless of visibility.
    setTimeout(function () { el.classList.add('in'); }, 40);
    return el;
  }
  window.JSError = { render: render, copy: COPY };
})();
