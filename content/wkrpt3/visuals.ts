/* Nayuki's FFT, Tsunami ver. */

type Buffer = Float32Array

const zeros = (n: number): Buffer => new Float32Array(n);

function reverse_bits(x: number, bits: number): number {
  let y = 0;
  for (let i = 0; i < bits; i += 1) {
    y = (y << 1) | (x & 1);
    x >>>= 1;
  }
  return y;
}

const trig_tables_memo: {[key: number]: [Buffer, Buffer]} = {};
const trig_tables = (n: number) => {
  if (!(n in trig_tables_memo)) {
    const cos_table = zeros(n / 2);
    const sin_table = zeros(n / 2);
    for (let i = 0; i < n / 2; i += 1) {
      cos_table[i] = Math.cos(2 * Math.PI * i / n);
      sin_table[i] = Math.sin(2 * Math.PI * i / n);
    }
    trig_tables_memo[n] = [cos_table, sin_table];
  }
  return trig_tables_memo[n];
};

/* decimation in time */
function cooley_tukey(real: Buffer, imag: Buffer): void {
  const n = real.length;
  if (n !== imag.length) throw Error('Mismatched lengths');
  if (n === 1) return;

  let levels = -1;
  for (let i = 0; i < 32; i += 1) {
    if (1 << i === n) levels = i;  // Equal to log2(n)
  }

  const [cos_table, sin_table] = trig_tables(n);

  // Bit-reversed addressing permutation
  for (let i = 0; i < n; i += 1) {
    const j = reverse_bits(i, levels);
    if (j > i) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  // Cooley-Tukey decimation-in-time radix-2 FFT
  // TODO: Actually understand this
  for (let size = 2; size <= n; size *= 2) {
    const halfsize = size / 2;
    const tablestep = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = i, k = 0; j < i + halfsize; j += 1, k += tablestep) {
        const l = j + halfsize;
        const tpre =  real[l] * cos_table[k] + imag[l] * sin_table[k];
        const tpim = -real[l] * sin_table[k] + imag[l] * cos_table[k];
        real[l] = real[j] - tpre;
        imag[l] = imag[j] - tpim;
        real[j] += tpre;
        imag[j] += tpim;
      }
    }
  }
}

/* Mutates real and imag. */
function forward(real: Buffer, imag: Buffer): void {
  const n = real.length;
  if (n !== imag.length) throw Error('Mismatched lengths');
  if ((n & (n - 1)) !== 0) throw Error('Length not power of 2');
  if (n === 0) return;
  cooley_tukey(real, imag);
}

function backward(real: Buffer, imag: Buffer): void {
  forward(imag, real);

  // scale down
  const n = real.length;
  for (let i = 0; i < n; i += 1) {
    real[i] /= n;
    imag[i] /= n;
  }
}

/* circular convolution (complex) */
function convolve_complex(
  xreal: Buffer, ximag: Buffer,
  yreal: Buffer, yimag: Buffer,
  outreal: Buffer, outimag: Buffer,
): void {
  const n = xreal.length;
  if (n !== ximag.length || n !== yreal.length || n !== yimag.length
      || n !== outreal.length || n !== outimag.length) {
    throw Error('Mismatched lengths');
  }

  xreal = xreal.slice();
  ximag = ximag.slice();
  yreal = yreal.slice();
  yimag = yimag.slice();
  forward(xreal, ximag);
  forward(yreal, yimag);

  for (let i = 0; i < n; i += 1) {
    const temp = (xreal[i] * yreal[i]) - (ximag[i] * yimag[i]);
    ximag[i] = (ximag[i] * yreal[i]) + (xreal[i] * yimag[i]);
    xreal[i] = temp;
  }
  backward(xreal, ximag);

  for (let i = 0; i < n; i += 1) { // TODO: Scaling (because this FFT implementation omits it)
    outreal[i] = xreal[i] / n;
    outimag[i] = ximag[i] / n;
  }
}

/* circular convolution (real) */
function convolve_real(x: Buffer, y: Buffer, out: Buffer): void {
  const n = x.length;
  if (n !== y.length || n !== out.length) throw Error('Mismatched lengths');
  convolve_complex(x, zeros(n), y, zeros(n), out, zeros(n));
}

function plot_signal(
  elt: HTMLElement,
  data: [number, number][],
  stroke: string,
  y_min: number,
  y_max: number,
): void {
  const margin = { top: 10, right: 10, bottom: 20, left: 40 };
  const width  = elt.clientWidth - margin.left - margin.right;
  const height = elt.clientHeight - margin.top - margin.bottom;
  const svg = d3.select(elt);
  svg.selectAll('*').remove();
  svg.attr('preserveAspectRatio', 'xMinYMin meet');

  const x = d3.scaleLinear().rangeRound([0, width]);
  const y = d3.scaleLinear().rangeRound([height, 0]);

  const line =
    d3.line()
    .x(d => x(d[0]))
    .y(d => y(d[1]));

  const g = svg.append('g');
  g.attr('transform', `translate(${margin.left}, ${margin.top})`);

  x.domain(d3.extent(data, d => d[0]));
  y.domain([y_min, y_max]);

  g.append('g')
  .attr('transform', `translate(0,${height})`)
  .call(d3.axisBottom(x));
  //.select('.domain')
  //.remove();
  
  g.append('g')
  .call(d3.axisLeft(y).ticks(2))
  //.append('text')
  //.attr('fill', '#000')
  //.attr('transform', 'rotate(-90)')
  //.attr('x', '-10px')
  //.attr('dy', '-1.5em')
  //.attr('text-anchor', 'end')
  //.text(y_title);

  g.append('path')
  .datum(data)
  .attr('fill', 'none')
  .attr('stroke', stroke)
  .attr('stroke-linejoin', 'round')
  .attr('stroke-linecap', 'round')
  .attr('stroke-width', 2)
  .attr('d', line);
}

function mk_sine(freq) {
  return t => Math.sin(2 * Math.PI * t * freq);
}

function mk_square(freq) {
  return t => ((t * freq) % 1 < 0.5) ? -1 : 1;
}

function mk_saw(freq) {
  return t => ((t * freq) % 1) * 2 - 1;
}

function mk_vibrato(freq, amp) {
  return t => 1 + amp * Math.sin(2 * Math.PI * t * freq);
}

function mk_fun(name) {
  switch (name) {
    case 'sin': return mk_sine;
    case 'saw': return mk_saw;
    case 'square': return mk_square;
  }
}

function simple_fft(data: [number, number][]): [number, number][] {
  const real: Buffer = new Float32Array(data.map(d => d[1]));
  const imag: Buffer = zeros(real.length);
  forward(real, imag);
  const freq_data = [];
  for (let i = 0; i < real.length / 2; i += 1) {
    freq_data.push([i, Math.sqrt(real[i]*real[i] + imag[i]*imag[i])]);
  }
  return freq_data;
}

// adsr: attack, decay, sustain, release
// tl: time, level
function adsr({ at, dt, sl, st, rt }): (number) => number {
  return (t) => {
    /*    */ if (t < at) return t / at;
    t -= at; if (t < dt) return ((dt - t) + (t * sl)) / dt;
    t -= dt; if (t < st) return sl;
    t -= st; if (t < rt) return sl * (1 - (t / rt));
    return 0;
  }
}

window.addEventListener('load', (event) => {
  const signal1_time = document.getElementById('signal1-time');
  const signal1_freq = document.getElementById('signal1-freq');
  const signal1_freq_input = document.getElementById('signal1-freq-input') as HTMLInputElement;
  const signal1_shape_input = document.getElementById('signal1-shape-input') as HTMLInputElement;

  function draw_signal_1() {
    const data: [number, number][] = [];
    const num_samples = 2048;

    const freq = parseFloat(signal1_freq_input.value);
    const f = mk_fun(signal1_shape_input.value)(freq);

    for (let x = 0; x < num_samples; x += 1) {
      const t = 0.1 * x / num_samples;
      data.push([t, f(t)]);
    }

    const freq_data = simple_fft(data);

    plot_signal(signal1_time, data, '#4682B4', -1, 1);
    plot_signal(signal1_freq, freq_data, '#B446A4', 0, 1000);
  }

  const signal2_time = document.getElementById('signal2-time');
  const signal2_freq = document.getElementById('signal2-freq');
  const signal3_time = document.getElementById('signal3-time');
  const signal3_freq = document.getElementById('signal3-freq');
  const signal4_time = document.getElementById('signal4-time');
  const signal4_freq = document.getElementById('signal4-freq');
  const signal2_freq_input = document.getElementById('signal2-freq-input') as HTMLInputElement;
  const signal2_shape_input = document.getElementById('signal2-shape-input') as HTMLInputElement;
  const signal3_freq_input = document.getElementById('signal3-freq-input') as HTMLInputElement;
  const signal3_amp_input = document.getElementById('signal3-amp-input') as HTMLInputElement;

  function draw_conv_thm() {
    const num_samples = 2048;
    const orig_data: [number, number][] = [];
    const freq = parseFloat(signal2_freq_input.value);
    const f = mk_fun(signal2_shape_input.value)(freq);
    const t = n => 0.1 * n / num_samples;
    for (let x = 0; x < num_samples; x += 1) {
      const t_ = t(x);
      orig_data.push([t_, f(t_)]);
    }
    const orig_data_freq = simple_fft(orig_data);

    const env_data: [number, number][] = [];
    const env_f = mk_vibrato(parseFloat(signal3_freq_input.value), parseFloat(signal3_amp_input.value) / 20);
    for (let x = 0; x < num_samples; x += 1) {
      const t_ = t(x);
      env_data.push([t_, env_f(t_)]);
    }
    const env_data_freq = simple_fft(env_data);

    const after_data: [number, number][] = [];
    for (let x = 0; x < num_samples; x += 1) {
      const t_ = t(x);
      after_data.push([t_, orig_data[x][1] * env_data[x][1]]);
    }
    const after_data_freq = simple_fft(after_data);

    plot_signal(signal2_time, orig_data, '#4682B4', -2, 2);
    plot_signal(signal2_freq, orig_data_freq, '#4682B4', 0, 1000);
    plot_signal(signal3_time, env_data, '#4682B4', -2, 2);
    plot_signal(signal3_freq, env_data_freq, '#4682B4', 0, 1000);
    plot_signal(signal4_time, after_data, '#4682B4', -2, 2);
    plot_signal(signal4_freq, after_data_freq, '#4682B4', 0, 1000);
  }

  const adsr_time = document.getElementById('adsr-time');
  function draw_adsr() {
    const num_samples = 2048;
    const f = adsr({ at: 0.1, dt: 0.3, sl: 0.2, st: 0.5, rt: 0.2 });
    const total_time = 1.1;
    const data: [number, number][] = [];
    for (let x = 0; x < num_samples; x += 1) {
      const t = total_time * x / num_samples;
      data.push([t, f(t)]);
    }
    plot_signal(adsr_time, data, '#4682B4', 0, 1);
  }

  draw_signal_1();
  draw_conv_thm();
  draw_adsr();

  signal1_freq_input.addEventListener('input', (evt) => { draw_signal_1(); });
  signal1_shape_input.addEventListener('change', (evt) => { draw_signal_1(); });
  signal2_freq_input.addEventListener('input', (evt) => { draw_conv_thm(); });
  signal2_shape_input.addEventListener('change', (evt) => { draw_conv_thm(); });
  signal3_freq_input.addEventListener('input', (evt) => { draw_conv_thm(); });
  signal3_amp_input.addEventListener('input', (evt) => { draw_conv_thm(); });
});
