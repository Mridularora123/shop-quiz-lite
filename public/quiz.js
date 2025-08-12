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
    const state = {
      step: 0,
      answersMap: {} // { [questionId]: value | value[] }
    };

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
        const inputAttrs = {
          type: q.type === 'multi' ? 'checkbox' : 'radio',
          name: q.id, value: String(opt.value), id
        };

        // restore checked state if previously answered
        const saved = state.answersMap[q.id];
        if (q.type === 'multi') {
          if (Array.isArray(saved) && saved.includes(String(opt.value))) inputAttrs.checked = true;
        } else {
          if (saved != null && String(saved) === String(opt.value)) inputAttrs.checked = true;
        }

        const input = h('input', inputAttrs);
        input.addEventListener('change', () => {
          if (q.type === 'multi') {
            const arr = Array.isArray(state.answersMap[q.id]) ? state.answersMap[q.id] : [];
            if (input.checked) {
              if (!arr.includes(input.value)) arr.push(input.value);
            } else {
              const i = arr.indexOf(input.value);
              if (i >= 0) arr.splice(i,1);
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

      qArea.appendChild(title);
      if (q.subtitle) qArea.appendChild(h('p', {}, [q.subtitle]));
      qArea.appendChild(opts);

      prevBtn.style.display = state.step === 0 ? 'none' : 'inline-block';
      nextBtn.textContent = state.step === (cfg.questions.length - 1) ? 'See results' : 'Next';
    }

    function answersArray(){
      const arr = [];
      for (const [questionId, value] of Object.entries(state.answersMap)) {
        if (Array.isArray(value)) {
          value.forEach(v => arr.push({ questionId, value: v }));
        } else if (value != null) {
          arr.push({ questionId, value });
        }
      }
      return arr;
    }

    async function submit(){
      const res = await fetch('/apps/quiz/recommend', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ answers: answersArray() })
      });
      const data = await res.json().catch(()=>({success:false}));
      showResults((data && data.products) || []);
    }

    function cardHtml(p){
      const title = p.title || (p.handle ? p.handle.replace(/-/g,' ') : 'Product');
      const url = p.handle ? `/products/${p.handle}` : '#';
      const img = p.image || `https://via.placeholder.com/600x600?text=${encodeURIComponent(title)}`;
      const price = (p.price && p.currency) ? `${p.price} ${p.currency}` : '';
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

    function showResults(products){
      container.innerHTML = '';
      const box = h('div', { class: 'quiz-lite-results' });
      box.appendChild(h('h3', {}, [cfg.resultsTitle || 'Your Recommendations']));
      const grid = h('div', { class: 'quiz-lite-grid' });

      if (!products.length) {
        grid.innerHTML = `<p>No matches yet — try different answers.</p>`;
      } else {
        grid.innerHTML = products.map(cardHtml).join('');
      }

      box.appendChild(grid);
      container.appendChild(box);
    }

    nextBtn.addEventListener('click', () => {
      if (state.step < cfg.questions.length - 1) {
        state.step++; showStep();
      } else {
        submit();
      }
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
    .ql-card{border:1px solid #eee;border-radius:16px;overflow:hidden;text-decoration:none;color:inherit;display:block}
    .ql-img img{display:block;width:100%;height:200px;object-fit:cover}
    .ql-info{padding:12px}
    .ql-title{font-weight:600}
    .ql-price{margin-top:4px}
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded', init);
})();
