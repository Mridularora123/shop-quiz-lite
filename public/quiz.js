(function () {
  /* =========================
     Fetch config (quiz.json)
  ========================== */
  async function fetchConfig() {
    const res = await fetch('/apps/quiz/config');
    return res.json();
  }

  /* =========================
     Small DOM helper
  ========================== */
  function h(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k === 'for') el.htmlFor = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.substring(2), v);
      else el.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach((c) =>
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
    );
    return el;
  }

  /* =========================
     Main renderer
  ========================== */
  function renderQuiz(container, cfg) {
    const state = {
      step: 0,
      answersMap: {} // will store: { tonefaces: 'tone_light', undertone: 'undertone_warm' }
    };

    // Shell
    const wrapper = h('div', { class: 'quiz-lite-wrapper' });
    const qArea = h('div', { class: 'quiz-lite-question' });
    const dots = h('div', { class: 'quiz-dots', role: 'tablist', 'aria-label': 'Progress' });
    const nav = h('div', { class: 'quiz-lite-nav' });
    const prevBtn = h('button', { class: 'quiz-lite-btn', type: 'button' }, ['Previous']);
    const nextBtn = h('button', { class: 'quiz-lite-btn', type: 'button' }, ['Continue']);
    nav.appendChild(prevBtn);
    nav.appendChild(nextBtn);
    wrapper.appendChild(qArea);
    wrapper.appendChild(dots);
    wrapper.appendChild(nav);
    container.innerHTML = '';
    container.appendChild(wrapper);

    /* =========================
       Step 1: Tone slider + Faces
       - Stores answer under q.id === "tonefaces"
    ========================== */
    function renderToneFaces(q, mount) {
      if (q.title) mount.appendChild(h('h3', {}, [q.title]));
      if (q.subtitle) mount.appendChild(h('p', { class: 'q-sub' }, [q.subtitle]));

      const stops = Array.isArray(q.stops) ? q.stops : [];
      const maxIndex = Math.max(0, (stops.length || 1) - 1);

      // Clickable tone labels
      const labels = h(
        'div',
        { class: 'tone-stops' },
        stops.map((s) => h('button', { class: 'tone-stop', type: 'button' }, [s]))
      );

      // Gradient bar + range thumb inside positioned wrapper
      const toneWrap = h('div', { class: 'tone-wrap' });
      const bar = h('div', { class: 'tone-bar' });
      const input = h('input', {
        type: 'range',
        min: 0,
        max: String(maxIndex),
        step: 1,
        value: '0',
        class: 'tone-range',
        'aria-label': 'Skin tone group'
      });
      toneWrap.appendChild(bar);
      toneWrap.appendChild(input);

      // Faces grid
      const grid = h('div', { class: 'faces-grid' });
      (q.options || []).forEach((opt) => {
        const tile = h('button', {
          class: 'face-tile',
          type: 'button',
          'data-group': String(opt.group ?? 0),
          'aria-label': opt.label || 'face'
        }, [h('img', { src: opt.image || '', alt: opt.label || 'face' })]);

        // restore selected
        if (state.answersMap[q.id] && String(state.answersMap[q.id]) === String(opt.value)) {
          tile.classList.add('is-selected');
        }

        // clicking a face selects it AND moves thumb to its group
        tile.addEventListener('click', () => {
          const idx = Number(tile.getAttribute('data-group') || 0);
          input.value = String(idx);
          updateToneIndex(idx);

          grid.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected'));
          tile.classList.add('is-selected');

          // store under tonefaces (matches your combos.when key)
          state.answersMap[q.id] = String(opt.value);
          validateNext();
        });

        grid.appendChild(tile);
      });

      function updateToneIndex(idx) {
        // Active label
        [...labels.children].forEach((el, j) => el.classList.toggle('active', j === idx));
        // Dim faces not in this tone group
        grid.querySelectorAll('.face-tile').forEach((el) => {
          const group = Number(el.getAttribute('data-group') || 0);
          el.classList.toggle('is-dim', group !== idx);
        });
      }

      // Clicking label moves thumb + updates dimming
      [...labels.children].forEach((btn, idx) => {
        btn.addEventListener('click', () => {
          input.value = String(idx);
          updateToneIndex(idx);
          // Note: user must still click a face to choose exact value
          validateNext();
        });
      });

      // Mount
      mount.appendChild(labels);
      mount.appendChild(toneWrap);
      mount.appendChild(grid);

      // Init
      updateToneIndex(0);

      input.addEventListener('input', () => {
        const idx = Number(input.value);
        updateToneIndex(idx);
      });

      // enable next only when a face (tonefaces) has been chosen
      function validateNext() {
        nextBtn.disabled = !state.answersMap[q.id];
      }
      validateNext();
    }

    /* =========================
       Step 2: Undertone
       - Stores answer under "undertone"
    ========================== */
    function renderUndertone(q, mount) {
      if (q.title) mount.appendChild(h('h3', {}, [q.title]));
      if (q.subtitle) mount.appendChild(h('p', { class: 'q-sub' }, [q.subtitle]));

      const row = h('div', { class: 'undertone-row' });
      (q.options || []).forEach((opt) => {
        const id = `ut-${opt.value}`;
        const card = h('label', { class: 'undertone-card', for: id });

        const bar = h('div', { class: 'undertone-bar' });
        if (opt.color) bar.style.background = opt.color;

        const radio = h('input', {
          type: 'radio',
          id,
          name: q.id, // "undertone"
          value: String(opt.value),
          class: 'sr-only'
        });

        if (state.answersMap[q.id] && String(state.answersMap[q.id]) === String(opt.value)) {
          radio.checked = true;
          card.classList.add('is-selected');
        }

        radio.addEventListener('change', () => {
          state.answersMap[q.id] = radio.value;
          row.querySelectorAll('.undertone-card').forEach((c) => c.classList.remove('is-selected'));
          card.classList.add('is-selected');
        });

        card.appendChild(bar);
        card.appendChild(h('div', { class: 'undertone-dot' }));
        card.appendChild(h('div', { class: 'undertone-title' }, [opt.label || '']));
        card.appendChild(h('div', { class: 'undertone-desc' }, [opt.desc || '']));
        card.appendChild(radio);

        row.appendChild(card);
      });

      mount.appendChild(row);
      nextBtn.disabled = false; // allow continue even if skipped
    }

    /* =========================
       Fallback renderer (radios/checkboxes)
    ========================== */
    function renderDefault(q, mount) {
      if (q.title) mount.appendChild(h('h3', {}, [q.title]));
      if (q.subtitle) mount.appendChild(h('p', { class: 'q-sub' }, [q.subtitle]));

      const opts = h('div', { class: 'quiz-lite-options' });
      (q.options || []).forEach((opt) => {
        const id = `opt-${q.id}-${opt.value}`;
        const input = h('input', {
          type: q.type === 'multi' ? 'checkbox' : 'radio',
          name: q.id,
          value: String(opt.value),
          id
        });

        const saved = state.answersMap[q.id];
        if (q.type === 'multi') {
          if (Array.isArray(saved) && saved.includes(String(opt.value))) input.checked = true;
        } else {
          if (saved != null && String(saved) === String(opt.value)) input.checked = true;
        }

        input.addEventListener('change', () => {
          if (q.type === 'multi') {
            const arr = Array.isArray(state.answersMap[q.id]) ? [...state.answersMap[q.id]] : [];
            if (input.checked) {
              if (!arr.includes(input.value)) arr.push(input.value);
            } else {
              const i = arr.indexOf(input.value);
              if (i >= 0) arr.splice(i, 1);
            }
            state.answersMap[q.id] = arr;
          } else {
            state.answersMap[q.id] = input.value;
          }
        });

        const lbl = h('label', { class: 'quiz-lite-opt', for: id }, [input, h('span', {}, [opt.label])]);
        opts.appendChild(lbl);
      });

      mount.appendChild(opts);
      nextBtn.disabled = false;
    }

    /* =========================
       Progress dots + Step switcher
    ========================== */
    function renderDots() {
      dots.innerHTML = '';
      (cfg.questions || []).forEach((_, i) => {
        const dot = h('span', {
          class: `quiz-dot${i === state.step ? ' active' : ''}`,
          role: 'tab',
          'aria-selected': i === state.step ? 'true' : 'false'
        });
        dots.appendChild(dot);
      });
    }

    function showStep() {
      const q = cfg.questions[state.step];
      qArea.innerHTML = '';
      if (!q) return;

      if (q.layout === 'tone-faces') {
        renderToneFaces(q, qArea);
      } else if (q.layout === 'undertone') {
        renderUndertone(q, qArea);
      } else {
        renderDefault(q, qArea);
      }

      renderDots();
      prevBtn.style.display = state.step === 0 ? 'none' : 'inline-block';
      nextBtn.textContent = state.step === cfg.questions.length - 1 ? 'See results' : 'Continue';
    }

    /* =========================
       Results helpers
    ========================== */
    function cardHtml(p) {
      const title = p.title || (p.handle ? p.handle.replace(/-/g, ' ') : 'Product');
      const url = p.handle ? `/products/${p.handle}` : '#';
      const img = p.image || `https://via.placeholder.com/600x600?text=${encodeURIComponent(title)}`;
      const price = (p.price != null) ? formatMoney(p.price, p.currency) : '';
      return `
        <a class="ql-card" href="${url}">
          <div class="ql-img"><img src="${img}" alt="${title}"></div>
          <div class="ql-info">
            <div class="ql-title">${title}</div>
            ${price ? `<div class="ql-price">${price}</div>` : ``}
          </div>
        </a>
      `;
    }

    function detectCurrency() {
      try {
        if (window.Shopify && Shopify.currency && Shopify.currency.active) return Shopify.currency.active;
      } catch (_) { }
      const m =
        document.querySelector('meta[itemprop="priceCurrency"]') ||
        document.querySelector('meta[property="og:price:currency"]');
      return m ? m.getAttribute('content') : '';
    }

    function formatMoney(amount, currency) {
      if (amount == null) return '';
      const n = Number(amount);
      if (Number.isNaN(n)) return '';
      // amount is in major units (e.g. 12.34). If you feed cents, divide by 100 first.
      return `${currency ? currency + ' ' : ''}${n.toFixed(2)}`;
    }

    function fetchProductByHandle(handle) {
      // Public Shopify endpoint, no token needed
      return fetch(`/products/${handle}.js`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(p => {
          const img =
            (Array.isArray(p.images) && p.images[0]) ||
            p.featured_image ||
            `https://via.placeholder.com/600x600?text=${encodeURIComponent(p.title || handle)}`;

          const firstVar = Array.isArray(p.variants) && p.variants[0] ? p.variants[0] : null;
          // Shopify .js returns price in CENTS (integer)
          const priceMajor = firstVar && typeof firstVar.price === 'number'
            ? firstVar.price / 100
            : (firstVar && typeof firstVar.price === 'string'
              ? Number(firstVar.price) / 100
              : null);

          return {
            handle,
            title: p.title || handle.replace(/-/g, ' '),
            image: img,
            price: priceMajor,
            currency: detectCurrency()
          };
        })
        .catch(() => ({
          handle,
          title: handle.replace(/-/g, ' '),
          image: `https://via.placeholder.com/600x600?text=${encodeURIComponent(handle)}`,
          price: null,
          currency: ''
        }));
    }


    /* =========================
       Submit: combos first, fallback to API
    ========================== */
    function submit() {
      function matchCombos(combos, answersMap) {
        if (!Array.isArray(combos)) return null;
        for (const combo of combos) {
          let ok = true;
          for (const [k, expected] of Object.entries(combo.when || {})) {
            if (String(answersMap[k]) !== String(expected)) { ok = false; break; }
          }
          if (ok) return combo.recommend || [];
        }
        return null;
      }

      const handles = matchCombos(cfg.combos, state.answersMap);

      if (handles && handles.length) {
        Promise
          .all(handles.map(h => fetchProductByHandle(h)))
          .then(products => { showResults(products); })
          .catch(() => {
            // graceful fallback to simple placeholders if something fails
            const products = handles.map(handle => ({
              handle,
              title: handle.replace(/-/g, ' '),
              image: `https://via.placeholder.com/600x600?text=${encodeURIComponent(handle)}`,
              price: null,
              currency: ''
            }));
            showResults(products);
          });
        return;
      }

      // Fallback to backend if no combo matched
      fetch('/apps/quiz/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: Object.entries(state.answersMap).map(([qid, val]) => ({ questionId: qid, value: val }))
        })
      })
        .then(res => res.json())
        .then(data => { showResults((data && data.products) || []); })
        .catch(() => { showResults([]); });
    }

    function showResults(products) {
      container.innerHTML = '';
      const box = h('div', { class: 'quiz-lite-results' });
      box.appendChild(h('h3', {}, [cfg.resultsTitle || 'Your best shade matches']));
      const grid = h('div', { class: 'quiz-lite-grid' });
      grid.innerHTML = products.length
        ? products.map(cardHtml).join('')
        : `<p>No matches yet — try different answers.</p>`;
      box.appendChild(grid);
      container.appendChild(box);
    }

    // Nav
    nextBtn.addEventListener('click', () => {
      if (state.step < (cfg.questions?.length || 0) - 1) {
        state.step++;
        showStep();
      } else {
        submit();
      }
    });
    prevBtn.addEventListener('click', () => {
      if (state.step > 0) {
        state.step--;
        showStep();
      }
    });

    showStep();
  }

  /* =========================
     Bootstrap
  ========================== */
  async function init() {
    const mount = document.querySelector('[data-quiz-lite]') || document.getElementById('shop-quiz');
    if (!mount) return;
    const resp = await fetchConfig();
    if (!resp?.success) return;
    renderQuiz(mount, resp.config);
  }

  /* =========================
     Styles (Rare Beauty-ish)
  ========================== */
  const css = `
    .quiz-lite-wrapper{border:1px solid #eee;padding:24px;border-radius:20px;max-width:1100px;margin:0 auto;font-family:ui-sans-serif,system-ui,-apple-system;background:#fffdfb}
    .quiz-lite-question h3{margin:0 0 6px 0;font-size:20px}
    .quiz-lite-nav{display:flex;gap:8px;justify-content:space-between;margin-top:18px}
    .quiz-lite-btn{padding:12px 20px;border:1px solid #ddd;border-radius:999px;background:#fff;cursor:pointer;letter-spacing:.2em;font-weight:700}
    .quiz-dots{display:flex;gap:6px;justify-content:center;margin:14px 0}
    .quiz-dot{width:6px;height:6px;border-radius:50%;background:#ddd;display:inline-block}
    .quiz-dot.active{background:#7a1d3c}
    .q-sub{margin:6px 0 12px;color:#555}

    /* Step 1: tone labels + gradient + slider thumb */
    .tone-stops{display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;font-size:11px;letter-spacing:.12em}
    .tone-stop{opacity:.65;border:0;background:none;cursor:pointer;padding:0;font-weight:700}
    .tone-stop.active{opacity:1;color:#111}
    .tone-wrap{ position:relative; height:26px; margin:0 0 12px 0 }
    .tone-bar{
      display:block!important; position:absolute; left:0; right:0; top:7px; height:13px; border-radius:8px;
      background:linear-gradient(90deg,#f6e4d2 0%,#f0c7a1 20%,#dea67a 40%,#c9885e 60%,#9a5a3d 80%,#5f3423 100%);
    }
    .tone-range{
      position:absolute; left:0; right:0; top:0; height:26px;
      appearance:none; background:transparent; margin:0; padding:0;
    }
    .tone-range::-webkit-slider-runnable-track{ background:transparent; height:26px }
    .tone-range::-moz-range-track{ background:transparent; height:26px }
    .tone-range::-ms-track{ background:transparent; border-color:transparent; color:transparent; height:26px }
    .tone-range::-webkit-slider-thumb{
      -webkit-appearance:none; appearance:none;
      width:18px; height:18px; border-radius:50%;
      background:#111; border:2px solid #fff; box-shadow:0 0 0 2px #111; cursor:pointer; margin-top:4px;
    }
    .tone-range::-moz-range-thumb{
      width:18px; height:18px; border-radius:50%;
      background:#111; border:2px solid #fff; box-shadow:0 0 0 2px #111; cursor:pointer;
    }

    .faces-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}
    @media (max-width: 980px){ .faces-grid{grid-template-columns:repeat(3,1fr)} }
    @media (max-width: 560px){ .faces-grid{grid-template-columns:repeat(2,1fr)} }
    .face-tile{border:0;padding:0;background:#fff;border-radius:2px;overflow:hidden;position:relative;cursor:pointer}
    .face-tile img{display:block;width:100%;height:220px;object-fit:cover}
    .face-tile.is-dim::after{content:'';position:absolute;inset:0;background:#fff;opacity:.65;pointer-events:none}
    .face-tile.is-selected{outline:2px solid #7a1d3c;outline-offset:-2px}

    /* Step 2: Undertone */
    .undertone-row{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:12px}
    @media (max-width: 780px){ .undertone-row{grid-template-columns:1fr} }
    .undertone-card{display:block;border:1px solid #eee;border-radius:12px;padding:16px 16px 18px 16px;background:#fff;cursor:pointer;position:relative}
    .undertone-card.is-selected{box-shadow:0 0 0 2px #111 inset}
    .undertone-bar{height:6px;border-radius:6px;margin-bottom:12px}
    .undertone-dot{width:12px;height:12px;border:2px solid #111;border-radius:999px;position:absolute;left:16px;top:34px;background:#fff}
    .undertone-title{font-weight:800;letter-spacing:.35em;margin-left:26px}
    .undertone-desc{color:#555;margin-left:26px;margin-top:6px}
    .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

    /* Results */
    .quiz-lite-results{max-width:1100px;margin:0 auto}
    .quiz-lite-grid{display:grid;grid-template-columns:repeat(3,minmax(220px,1fr));gap:16px}
    .ql-card{border:1px solid #eee;border-radius:16px;overflow:hidden;text-decoration:none;color:inherit;display:block;background:#fff}
    .ql-img img{display:block;width:100%;height:220px;object-fit:cover}
    .ql-info{padding:12px}
    .ql-title{font-weight:600}
    .ql-price{margin-top:4px}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded', init);
})();
