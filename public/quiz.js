(function(){
  async function fetchConfig(){
    const res = await fetch('/apps/quiz/config');
    return res.json();
  }

  function h(tag, attrs={}, children=[]) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=>{
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.substring(2), v);
      else el.setAttribute(k, v);
    });
    children.forEach(c => el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return el;
  }

  function renderQuiz(container, cfg){
    const state = { step: 0, answers: [] };
    const wrapper = h('div', { class: 'quiz-lite-wrapper' });
    const qArea = h('div', { class: 'quiz-lite-question' });
    const nav = h('div', { class: 'quiz-lite-nav' });
    const nextBtn = h('button', { class: 'quiz-lite-btn' }, ['Next']);
    const prevBtn = h('button', { class: 'quiz-lite-btn' }, ['Back']);
    nav.appendChild(prevBtn); nav.appendChild(nextBtn);
    wrapper.appendChild(qArea); wrapper.appendChild(nav);
    container.innerHTML = '';
    container.appendChild(wrapper);

    function showStep(){
      const q = cfg.questions[state.step];
      qArea.innerHTML = '';
      if (!q) return;
      const title = h('h3', {}, [q.title]);
      const opts = h('div', { class: 'quiz-lite-options' });
      (q.options||[]).forEach(opt => {
        const id = `opt-${q.id}-${opt.value}`;
        const lbl = h('label', { class: 'quiz-lite-opt' }, [
          h('input', { type: q.type === 'multi' ? 'checkbox' : 'radio', name: q.id, value: String(opt.value), id }),
          h('span', {}, [opt.label])
        ]);
        opts.appendChild(lbl);
      });
      qArea.appendChild(title);
      if (q.subtitle) qArea.appendChild(h('p', {}, [q.subtitle]));
      qArea.appendChild(opts);

      prevBtn.style.display = state.step === 0 ? 'none' : 'inline-block';
      nextBtn.textContent = state.step === (cfg.questions.length - 1) ? 'See results' : 'Next';
    }

    async function submit(){
      // Collect answers (single-choice only in this lite MVP)
      state.answers = [];
      cfg.questions.forEach(q => {
        const chosen = document.querySelector(`input[name="${q.id}"]:checked`);
        if (chosen) state.answers.push({ questionId: q.id, value: chosen.value });
      });
      const res = await fetch('/apps/quiz/recommend', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ answers: state.answers })
      });
      const data = await res.json();
      showResults(data.products || []);
    }

    function showResults(products){
      container.innerHTML = '';
      const box = h('div', { class: 'quiz-lite-results' });
      box.appendChild(h('h3', {}, [cfg.resultsTitle || 'Your Recommendations']));
      const grid = h('div', { class: 'quiz-lite-grid' });
      products.forEach(p => {
        const card = h('div', { class: 'quiz-lite-card' });
        if (p.image) card.appendChild(h('img', { src: p.image, alt: p.title || p.handle }));
        card.appendChild(h('div', { class: 'quiz-lite-card-body' }, [
          h('h4', {}, [p.title || p.handle]),
          p.price ? h('div', { class: 'quiz-lite-price' }, [`${p.price} ${p.currency||''}`]) : h('div'),
          h('a', { href: `/products/${p.handle}`, class: 'quiz-lite-btn' }, ['View product'])
        ]));
        grid.appendChild(card);
      });
      box.appendChild(grid);
      container.appendChild(box);
    }

    nextBtn.addEventListener('click', () => {
      if (state.step < cfg.questions.length - 1) { state.step++; showStep(); }
      else submit();
    });
    prevBtn.addEventListener('click', () => { if (state.step > 0) { state.step--; showStep(); } });

    showStep();
  }

  async function init(){
    const mount = document.querySelector('[data-quiz-lite]') || document.getElementById('shop-quiz');
    if (!mount) return;
    const resp = await fetchConfig();
    if (!resp?.success) return;
    renderQuiz(mount, resp.config);
  }

  // Basic styles
  const css = `
    .quiz-lite-wrapper{border:1px solid #eee;padding:16px;border-radius:16px;max-width:720px;margin:0 auto;font-family:ui-sans-serif,system-ui,-apple-system}
    .quiz-lite-btn{padding:10px 14px;border:1px solid #ddd;border-radius:999px;background:#fff;cursor:pointer}
    .quiz-lite-nav{display:flex;gap:8px;justify-content:space-between;margin-top:16px}
    .quiz-lite-options{display:grid;gap:10px;margin-top:8px}
    .quiz-lite-opt{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid #eee;border-radius:10px;cursor:pointer}
    .quiz-lite-results{max-width:980px;margin:0 auto}
    .quiz-lite-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
    .quiz-lite-card{border:1px solid #eee;border-radius:16px;overflow:hidden}
    .quiz-lite-card img{display:block;width:100%;height:200px;object-fit:cover}
    .quiz-lite-card-body{padding:12px}
    .quiz-lite-price{font-weight:600;margin-top:4px;margin-bottom:8px}
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded', init);
})();