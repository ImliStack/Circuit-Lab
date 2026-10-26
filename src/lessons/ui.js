// Small DOM builders shared by lesson control panels.

/** Segmented control. options: [{ value, html }] */
export function seg(label, options, value, onChange, output = '') {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="control-label"><span>${label}</span><output>${output}</output></div><div class="seg" role="group" aria-label="${label}"></div>`;
  const row = wrap.querySelector('.seg');
  const out = wrap.querySelector('output');
  const buttons = options.map((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = o.html ?? String(o.value);
    b.setAttribute('aria-pressed', String(o.value === value));
    b.onclick = () => {
      buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      onChange(o.value);
    };
    row.appendChild(b);
    return b;
  });
  wrap.setOutput = (s) => { out.textContent = s; };
  wrap.select = (v) => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === v)));
  return wrap;
}

export function bandsHtml(bands) {
  return `<span class="bands" aria-hidden="true">${bands.map((b) => `<i style="background:${b.hex}"></i>`).join('')}</span>`;
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
