(function () {
  // --------- API ---------
  async function fetchConfig() {
    const res = await fetch('/apps/quiz/config');
    return res.json();
  }

  // --------- DOM helper ---------
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

  // Money helper (if you ever pass cents)
  function moneyFromCents(cents, currency, locale) {
    try {
      return new Intl.NumberFormat(locale || 'en-US', { style: 'currency', currency: currency || 'USD' }).format(cents / 100);
    } catch {
      return (cents / 100).toFixed(2);
    }
  }

  // --------- Main renderer ---------
  function renderQuiz(container, cfg) {
    const state = {
      step: 0,
      // answersMap stores final Q->value pairs **and** synthetic keys for combined layouts
      // e.g. from Step 1 we write: answersMap['tone'] and answersMap['face']
      answersMap: {}
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

    // ---------- STEP 1: Tone + Faces (combined) ----------
    function renderToneFaces(q, mount) {
      // Build header
      mount.appendChild(h('h3', {}, [q.title]));
      if (q.subtitle) mount.appendChild(h('p', { class: 'q-sub' }, [q.subtitle]));

      // Slider labels (stops)
      const stops = Array.isArray(q.stops) ? q.stops : [];
      const maxIndex = Math.max(0, (stops.length || 1) - 1);

      const labels = h(
        'div',
        { class: 'tone-stops' },
        stops.map((s) => h('span', { class: 'tone-stop' }, [s]))
      );

      // Gradient bar (pure CSS)
      const bar = h('div', { class: 'tone-bar' });

      // Range input
      let startIndex = 0;
      // if user came back, restore tone index from stored "tone_*" value
      const savedTone = state.answersMap['tone'];
      if (savedTone && stops.length) {
        const idx = stops.findIndex((_, i) => `tone_${stops[i].toLowerCase().replace(/\s+/g, '_')}` === savedTone);
        if (idx >= 0) startIndex = idx;
      }

      const input = h('input', {
        type: 'range',
        min: 0,
        max: String(maxIndex),
        step: 1,
        value: String(startIndex),
        class: 'tone-range',
        'aria-label': 'Skin tone group'
      });

      function toneKeyFromIndex(i) {
        const raw = stops[i] || `group_${i}`;
        return `tone_${raw.toLowerCase().replace(/\s+/g, '_')}`;
      }

      // Faces grid
      const grid = h('div', { class: 'faces-grid' });
      (q.options || []).forEach((opt) => {
        const tile = h('button', { class: 'face-tile', type: 'button', 'data-group': String(opt.group ?? 0) }, [
          h('img', { src: opt.image || '', alt: opt.label || 'face' })
        ]);

        // restore face selection
        if (state.answersMap['face'] && String(state.answersMap['face']) === String(opt.value)) {
          tile.classList.add('is-selected');
        }

        tile.addEventListener('click', () => {
          // select face
          grid.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected'));
          tile.classList.add('is-selected');
          state.answersMap['face'] = String(opt.value);
          validateNext();
        });

        grid.appendChild(tile);
      });

      // Helpers to update UI based on tone index
      function updateToneIndex(idx) {
        // active label
        [...labels.children].forEach((el, j) => el.classList.toggle('active', j === idx));
        // dim non-matching faces
        grid.querySelectorAll('.face-tile').forEach((el) => {
          const group = Number(el.getAttribute('data-group') || 0);
          el.classList.toggle('is-dim', group !== idx);
        });
        // set tone answer
        state.answersMap['tone'] = toneKeyFromIndex(idx);

        // if selected face no longer matches group, clear it
        const selected = grid.querySelector('.face-tile.is-selected');
        if (selected && Number(selected.getAttribute('data-group') || 0) !== idx) {
          selected.classList.remove('is-selected');
          delete state.answersMap['face'];
        }
      }

      // initialize
      mount.appendChild(labels);
      mount.appendChild(bar);
      mount.appendChild(input);
      mount.appendChild(grid);

      updateToneIndex(startIndex);

      input.addEventListener('input', () => {
        const idx = Number(input.value);
        updateToneIndex(idx);
        validateNext();
      });

      // Next is enabled only when BOTH tone & face are chosen
      function validateNext() {
        nextBtn.disabled = !(state.answersMap['tone'] && state.answersMap['face']);
      }
      validateNext();
    }

    // ---------- STEP 2: Undertone ----------
    function renderUndertone(q, mount) {
      mount.appendChild(h('h3', {}, [q.title]));
      if (q.subtitle) mount.appendChild(h('p', { class: 'q-sub' }, [q.subtitle]));

      const row = h('div', { class: 'undertone-row' });

      (q.options || []).forEach((opt) => {
        const id = `ut-${opt.value}`;
        const card = h('label', { class: 'undertone-card', for: id });

        const bar = h('div', { class: 'undertone-bar' });
        if (opt.color) bar.style.background = opt.color;

        const radio = h('input', { type: 'radio', id, name: 'undertone', value: String(opt.value), class: 'sr-only' });
        if (state.answersMap['undertone'] && String(state.answersMap['undertone']) === String(opt.value)) {
          radio.checked = true;
          card.classList.add('is-selected');
        }

        radio.addEventListener('change', () => {
          state.answersMap['undertone'] = radio.value;
          row.querySelectorAll('.undertone-card').forEach((c) => c.classList.remove('is-selected'));
          card.classList.add('is-selected');
        });

        const title = h('div', { class: 'undertone-title' }, [opt.label || '']);
        const desc = h('div', { class: 'undertone-desc' }, [opt.desc || '']);

        card.appendChild(bar);
        card.appendChild(h('div', { class: 'undertone-dot' }));
        card.appendChild(title);
        card.appendChild(desc);

        card.appendChild(radio);
        row.appendChild(card);
      });

      mount.appendChild(row);

      // Always allow continue (matches Rare Beauty); user can pick or skip
      nextBtn.disabled = false;
    }

    // ---------- Default radios/checkboxes (fallback) ----------
    function renderDefault(q, mount) {
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

        const lbl = h('label', { class: 'quiz-lite-opt', for: id }, [
          input,
          h('span', {}, [opt.label])
        ]);
        opts.appendChild(lbl);
      });

      mount.appendChild(opts);
      nextBtn.disabled = false;
    }

    // ---------- Step rendering ----------
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

      // Layout switch
      if (q.layout === 'tone-faces') {
        renderToneFaces(q, qArea);
      } else if (q.layout === 'undertone') {
        renderUndertone(q, qArea);
      } else {
        // fallback to radios/checkboxes
        qArea.appendChild(h('h3', {}, [q.title || '']));
        if (q.subtitle) qArea.appendChild(h('p', { class: 'q-sub' }, [q.subtitle]));
        renderDefault(q, qArea);
      }

      // Nav + dots
      renderDots();
      prevBtn.style.display = state.step === 0 ? 'none' : 'inline-block';
      nextBtn.textContent = state.step === cfg.questions.length - 1 ? 'See results' : 'Continue';
    }

    // ---------- Submit ----------
    function answersArray() {
      const arr = [];
      for (const [questionId, value] of Object.entries(state.answersMap)) {
        if (Array.isArray(value)) {
          value.forEach((v) => arr.push({ questionId, value: v }));
        } else if (value != null) {
          arr.push({ questionId, value });
        }
      }
      return arr;
    }

    async function submit() {
      const res = await fetch('/apps/quiz/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: answersArray() })
      });
      const data = await res.json().catch(() => ({ success: false }));
      showResults((data && data.products) || []);
    }

    function cardHtml(p) {
      const title = p.title || (p.handle ? p.handle.replace(/-/g, ' ') : 'Product');
      const url = p.handle ? `/products/${p.handle}` : '#';
      const img = p.image || `https://via.placeholder.com/600x600?text=${encodeURIComponent(title)}`;
      const price = p.price && p.currency ? `${p.price} ${p.currency}` : '';
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

    function showResults(products) {
      container.innerHTML = '';
      const box = h('div', { class: 'quiz-lite-results' });
      box.appendChild(h('h3', {}, [cfg.resultsTitle || 'Your best shade matches']));
      const grid = h('div', { class: 'quiz-lite-grid' });

      if (!products.length) {
        grid.innerHTML = `<p>No matches yet — try different answers.</p>`;
      } else {
        grid.innerHTML = products.map(cardHtml).join('');
      }

      box.appendChild(grid);
      container.appendChild(box);
    }

    // ---------- Events ----------
    nextBtn.addEventListener('click', () => {
      if (state.step < cfg.questions.length - 1) {
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

    // First render
    showStep();
  }

  // --------- Bootstrap ---------
  async function init() {
    const mount = document.querySelector('[data-quiz-lite]') || document.getElementById('shop-quiz');
    if (!mount) return;
    const resp = await fetchConfig();
    if (!resp?.success) return;
    renderQuiz(mount, resp.config);
  }

  // --------- Styles (minimal, Rare Beauty-inspired) ---------
  const css = `
    .quiz-lite-wrapper{border:1px solid #eee;padding:16px;border-radius:16px;max-width:1100px;margin:0 auto;font-family:ui-sans-serif,system-ui,-apple-system;background:#fffdfb}
    .quiz-lite-nav{display:flex;gap:8px;justify-content:space-between;margin-top:16px}
    .quiz-lite-btn{padding:10px 18px;border:1px solid #ddd;border-radius:999px;background:#fff;cursor:pointer;letter-spacing:.2em;font-weight:700}
    .quiz-dots{display:flex;gap:6px;justify-content:center;margin:14px 0}
    .quiz-dot{width:6px;height:6px;border-radius:50%;background:#ddd;display:inline-block}
    .quiz-dot.active{background:#7a1d3c}

    .q-sub{margin:6px 0 12px;color:#555}

    /* Step 1: Tone slider + faces */
    .tone-stops{display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;font-size:11px;letter-spacing:.1em}
    .tone-stop{opacity:.7}
    .tone-stop.active{opacity:1;color:#111;font-weight:700}
    .tone-bar{height:10px;border-radius:8px;margin-bottom:10px;
      background: linear-gradient(90deg, #fbe7da 0%, #f3c19f 20%, #d99d78 40%, #c27a52 60%, #8e5235 80%, #5b2c1d 100%);
    }
    input.tone-range{width:100%;appearance:none;height:0;margin:0 0 12px 0}
    input.tone-range::-webkit-slider-thumb{
      -webkit-appearance:none; appearance:none;width:18px;height:18px;border-radius:50%;background:#111;border:2px solid #fff;box-shadow:0 0 0 2px #111;cursor:pointer;margin-top:-9px
    }
    input.tone-range::-moz-range-thumb{
      width:18px;height:18px;border-radius:50%;background:#111;border:2px solid #fff;box-shadow:0 0 0 2px #111;cursor:pointer
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
    .quiz-lite-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
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
