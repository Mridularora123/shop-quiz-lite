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

  // --------- Main renderer ---------
  function renderQuiz(container, cfg) {
    const state = {
      step: 0,
      // { [questionId]: string | string[] }
      answersMap: {}
    };

    // Shell
    const wrapper = h('div', { class: 'quiz-lite-wrapper' });
    const qArea = h('div', { class: 'quiz-lite-question' });
    const dots = h('div', { class: 'quiz-dots', role: 'tablist', 'aria-label': 'Progress' });

    const nav = h('div', { class: 'quiz-lite-nav' });
    const prevBtn = h('button', { class: 'quiz-lite-btn', type: 'button' }, ['Back']);
    const nextBtn = h('button', { class: 'quiz-lite-btn', type: 'button' }, ['Next']);
    nav.appendChild(prevBtn);
    nav.appendChild(nextBtn);

    wrapper.appendChild(qArea);
    wrapper.appendChild(dots);
    wrapper.appendChild(nav);
    container.innerHTML = '';
    container.appendChild(wrapper);

    // ---------- Helpers for new layouts ----------
    function selectSingleValue(q, value) {
      state.answersMap[q.id] = String(value);
    }

    function renderImageGrid(q, mount) {
      const grid = h('div', { class: 'quiz-grid', role: 'group', 'aria-label': q.title });
      (q.options || []).forEach((opt) => {
        const btn = h('button', { class: 'quiz-tile', type: 'button' }, [
          h('img', { src: opt.image || '', alt: opt.label || 'option' }),
          h('span', { class: 'quiz-tile-label' }, [opt.label || ''])
        ]);

        // restore selection
        const saved = state.answersMap[q.id];
        if (saved != null && String(saved) === String(opt.value)) {
          btn.classList.add('quiz-tile--selected');
        }

        btn.addEventListener('click', () => {
          // visual
          const prev = grid.querySelector('.quiz-tile--selected');
          if (prev) prev.classList.remove('quiz-tile--selected');
          btn.classList.add('quiz-tile--selected');

          // state
          selectSingleValue(q, opt.value);
          // enable Next
          nextBtn.disabled = false;
        });

        grid.appendChild(btn);
      });

      mount.appendChild(grid);

      // disable Next until a choice is made
      const hasSaved = state.answersMap[q.id] != null;
      nextBtn.disabled = !hasSaved;
    }

    function renderSlider(q, mount) {
      const stops = Array.isArray(q.stops) ? q.stops : [];
      const maxIndex = Math.max(0, (q.options?.length || 1) - 1);

      const labels = h(
        'div',
        { class: 'quiz-stops' },
        stops.map((s) => h('span', { class: 'quiz-stop' }, [s]))
      );

      // Start position: previously saved index if available
      let startIndex = 0;
      const saved = state.answersMap[q.id];
      if (saved != null && Array.isArray(q.options)) {
        const idx = q.options.findIndex((o) => String(o.value) === String(saved));
        if (idx >= 0) startIndex = idx;
      }

      const input = h('input', {
        type: 'range',
        min: 0,
        max: maxIndex,
        step: 1,
        value: String(startIndex),
        class: 'quiz-range',
        'aria-label': q.title
      });

      function updateActive(idx) {
        [...labels.children].forEach((el, j) => el.classList.toggle('active', j === idx));
      }

      // Initialize selection based on startIndex
      if (Array.isArray(q.options) && q.options[startIndex]) {
        selectSingleValue(q, q.options[startIndex].value);
      }
      updateActive(startIndex);
      nextBtn.disabled = false; // slider always has a selection

      input.addEventListener('input', () => {
        const idx = Number(input.value);
        const opt = Array.isArray(q.options) ? q.options[idx] : null;
        if (!opt) return;
        selectSingleValue(q, opt.value);
        updateActive(idx);
        nextBtn.disabled = false;
      });

      mount.appendChild(labels);
      mount.appendChild(input);
    }

    // ---------- Default radios/checkboxes ----------
    function renderDefault(q, mount) {
      const opts = h('div', { class: 'quiz-lite-options' });

      (q.options || []).forEach((opt) => {
        const id = `opt-${q.id}-${opt.value}`;
        const inputAttrs = {
          type: q.type === 'multi' ? 'checkbox' : 'radio',
          name: q.id,
          value: String(opt.value),
          id
        };

        const saved = state.answersMap[q.id];
        if (q.type === 'multi') {
          if (Array.isArray(saved) && saved.includes(String(opt.value))) inputAttrs.checked = true;
        } else {
          if (saved != null && String(saved) === String(opt.value)) inputAttrs.checked = true;
        }

        const input = h('input', inputAttrs);
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

      const title = h('h3', {}, [q.title]);
      qArea.appendChild(title);
      if (q.subtitle) qArea.appendChild(h('p', {}, [q.subtitle]));

      // Layout switch
      if (q.layout === 'image-grid') {
        renderImageGrid(q, qArea);
      } else if (q.layout === 'slider') {
        renderSlider(q, qArea);
      } else {
        renderDefault(q, qArea); // radios/checkboxes (original behavior)
      }

      // Nav + dots
      renderDots();
      prevBtn.style.display = state.step === 0 ? 'none' : 'inline-block';
      nextBtn.textContent = state.step === cfg.questions.length - 1 ? 'See results' : 'Next';
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
      box.appendChild(h('h3', {}, [cfg.resultsTitle || 'Your personalized picks']));
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
        // for layouts that may need an answer before continuing,
        // the render function itself controls nextBtn.disabled.
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

  // --------- Styles ---------
  const css = `
    .quiz-lite-wrapper{border:1px solid #eee;padding:16px;border-radius:16px;max-width:720px;margin:0 auto;font-family:ui-sans-serif,system-ui,-apple-system}
    .quiz-lite-nav{display:flex;gap:8px;justify-content:space-between;margin-top:16px}
    .quiz-lite-btn{padding:10px 14px;border:1px solid #ddd;border-radius:999px;background:#fff;cursor:pointer}
    .quiz-lite-question h3{margin:0 0 6px 0}
    .quiz-lite-question p{margin:0 0 10px 0;color:#666}
    .quiz-lite-options{display:grid;gap:10px;margin-top:8px}
    .quiz-lite-opt{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid #eee;border-radius:10px;cursor:pointer}
    .quiz-lite-results{max-width:980px;margin:0 auto}
    .quiz-lite-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
    .ql-card{border:1px solid #eee;border-radius:16px;overflow:hidden;text-decoration:none;color:inherit;display:block}
    .ql-img img{display:block;width:100%;height:200px;object-fit:cover}
    .ql-info{padding:12px}
    .ql-title{font-weight:600}
    .ql-price{margin-top:4px}

    /* Image grid (shade tiles) */
    .quiz-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-top:12px}
    .quiz-tile{border:0;background:#fff;border-radius:16px;overflow:hidden;cursor:pointer;text-align:left;padding:0;box-shadow:0 0 0 1px #eee;transition:box-shadow .15s ease}
    .quiz-tile:hover{box-shadow:0 0 0 2px #ccc}
    .quiz-tile img{display:block;width:100%;height:220px;object-fit:cover}
    .quiz-tile-label{display:block;padding:10px 12px;font-weight:600}
    .quiz-tile--selected{box-shadow:0 0 0 2px #111}

    /* Slider (tone) */
    .quiz-range{width:100%;margin:10px 0 8px 0}
    .quiz-stops{display:flex;justify-content:space-between;font-size:11px;letter-spacing:.06em;color:#666;margin-bottom:8px;gap:6px;flex-wrap:wrap}
    .quiz-stop.active{color:#111;font-weight:700}

    /* Progress dots */
    .quiz-dots{display:flex;gap:6px;justify-content:center;margin:14px 0}
    .quiz-dot{width:6px;height:6px;border-radius:50%;background:#ddd;display:inline-block}
    .quiz-dot.active{background:#111}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded', init);
})();
