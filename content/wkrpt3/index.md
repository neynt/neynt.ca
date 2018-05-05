+++
title = "Making waves"
description = "Representing signals in a programming environment"
+++

<script src='/d3.min.js'></script>
<script type="text/x-mathjax-config">
MathJax.Hub.Config({
  tex2jax: {
    inlineMath: [['$(',')$']],
  }
});
</script>
<script src='https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.4/latest.js?config=TeX-MML-AM_CHTML' async></script>
<script src='visuals.js'></script>

# Making waves

- Jim Zhang
- Relevant courses: MATH 213, SE 380, ECE 413
- Opt-in: Yes

---

## Introduction


Suppose that you want to design a new sound — say, a laser gun sound effect, or
an alien-sounding musical instrument. One thing you might do this is to take a
sound similar to the sound you have in mind, and to transform it, using
well-established techniques such as filters and envelopes, until it is
approximately the sound that you desire.

But this approach is imperfect. By limiting yourself to modifying sounds that
already exist, you become biased toward those sounds and artificially constrain
the set of possible sounds you might end up with. Also, it seems that all but
the most trivial techniques for transforming sound are inflexible and pricy.
Take, for example, the market for VST plugins. The [Waves SSL
E-Channel](https://www.waves.com/plugins/ssl-e-channel) plugin provides about
20 knobs and dials that serve as parameters for an equalizer and a compressor —
conceptually simple signal transformations — and its regular selling price is
$249.

I have recently tried create a new way to design new sounds: by representing
signals in a programming language, and manipulating them directly in a
programming environment that I call Tsunami. In this report, I will discuss
some of the engineering decisions that I had to make while developing this
programming environment; most notably, the representation of the signals
themselves. I will also demonstrate the effectiveness of this technique by
showing how some common signal processing algorithms might be implemented in
this framework.

## Background

### Signals

Every sound you will ever hear can be modelled as a signal: a function over
time. This is the signal that microphones try to capture and speakers try to
recreate; the signal that encodings like MP3, AAC, and Vorbis try to represent
in a compressed format. Physically, this signal might represent the
displacement of a microphone diaphragm, a speaker cone, or an eardrum. Our goal
is to find a way to express these signals, as well as transformations on these
signals, naturally in a programming environment.

### Closures

Closures, or lexically scoped first-class functions, first appeared in Scheme
in the 1970s and, as with all good language features, have been ignored in
mainstream programming until a few years ago.[^scheme] *First-class* means that
the function can be passed around, stored in a variable, and returned like any
other value; *lexically scoped* means that the function can capture variables
from the environment in which it was defined even if it is passed outside that
environment. Both of these properties will come in handy for us.

### TypeScript

Most of the code examples in this article will be written in TypeScript,
Microsoft's layer of gradual typing on top of JavaScript. TypeScript's type
definitions and annotations will allow us to precisely specify the data
structures we are using. While JavaScript has its warts, it also has good
parts: it supports closures, its syntax has been getting better with each new
version, and many smart people have worked very hard to make it run really fast
right in your browser.

![](javascript-the-good-parts.jpg)

*Figure: JavaScript's good parts.*

## Design goals

An ideal means of representing signals, for the purposes of Tsuanami, should
satisfy the following properties.

- It should be flexible. One should be able to apply a wide variety of signal
  processing techniques using a single interface.
- It should be conceptually simple. There should be a clear mapping between the
  objects you are manipulating and the resulting sound.
- It should be performant. It should be possible to play sounds in real time
  without waiting for them to render.
- It should be easy to manipulate in a language that runs in your web browser.
  This goal is more for vanity than

MP3 is an example of something that doesn't satisfy these properties. It is
opaque, and must be decoded to get access to any meaningful information in the
signal. It is inflexible; there are no obvious transformations you can do to an
MP3 file other than decoding it.

## Representing signals

### Continuous signals

How might you represent a signal using a first-class function? One way that
immediately comes to mind is by representing it as a function over time:

```typescript
type Signal = (t: number) => number;
```

That is, a `Signal` is a function that takes a number and returns a number.

This is a very elegant way to treat signals. But this representation doesn't
capture all the information that we might want. Most notably, it's impossible
to tell how long a signal lasts — we must treat all signals as if they have
infinite duration! This is inefficient, so let's put the function and its
duration together in an `interface`.

```typescript
interface Signal {
  f: (t: number) => number;
  dur: number;
}
```

This, I claim, is enough to do an impressive amount. A signal can be created
simply by describing it as a calculation of time, and annotating it with its
actual duration.

### Discrete signals

However, it isn't enough to be able to work with continuous signals. While they
are a useful and flexible way to think about signals, we are ultimately working
on a computer, which has to eventually output digital samples to an output
device (which will only later be converted back into continuous mechanical
movements and sound waves that we hear). Also, many efficient digital signal
processing algorithms exploit the structure present in signals that are sampled
at a constant rate over time. Therefore, we need a way to represent these
discrete signals. One natural way is with a flat array of samples:

```typescript
type DiscreteSignal = Float32Array
```

Since arrays already carry their length, we don't need to store the size of the
array separately. However, just this isn't enough information to play back the
signal — we also need to know how much time each sample represents, the
*sample rate*. So, we will similarly wrap this array in an object as follows:

```typescript
interface DiscreteSignal {
  samples: Float32Array;
  sample_rate: number;
}
```

This is now fully enough information to reproduce the signal.

At this point, we have two flexible and simple representations of signals. But
they are fundamentally different, and aren't interchangeable. For example,
suppose we wanted to mix together two signals to produce a third signal that is
their "sum" — there is no natural way to add together a function over time, and
an array with discrete indices. How do we bridge this gap? As we will see,
there are natural ways to convert between continuous and discrete signals that
preserve all the information that one might care about, so we can take these
two representations of a signal to be mostly interchangeable.

## Two domains

In signal processing, we often jump back and forth between two domains in which
to represent a signal: the time domain, and the frequency domain. So far, we
have represented signals in the time domain, where signals are expressed as a
function over time. 

But every signal has an equivalent representation in the frequency domain,
where it is instead expressed as a function of frequency. To do this, the
signal is decomposed into the sum of a large number of sine waves at varying
amplitudes and phase shifts. In fact, we can figure out a unique representation
in the frequency domain for any signal using a procedure called the Fourier
transform.

The following diagram demonstrates these two domains. (Note that in reality,
the frequency domain is complex-valued so that it can encode both magnitude and
phase information. For simplicity, we only plot the magnitude.)

#### Time domain

<svg id='signal1-time' style='width: 100%; height: 120px' />

#### Frequency domain

<svg id='signal1-freq' style='width: 100%; height: 120px' />

<div class='controls'>
<div class='control'>
<label>Frequency</label>
<input id='signal1-freq-input' type='range' min='20' max='600' style='width:200px' />
</div>
<div class='control'>
<label>Shape</label>
<select id='signal1-shape-input'>
<option value='sin'>Sine</option>
<option value='square'>Square</option>
<option value='saw'>Saw</option>
</select>
</div>
</div>

The most important part is that if we have a signal in one domain, we can get
the signal in the other domain. This means we can manipulate signals directly
in the frequency domain, which opens up a wide range of audio effects.

Note that this is one reason we needed `DiscreteSignal`. On computers, the
Fourier transform is usually implemented using an efficient algorithm called
the FFT (Fast Fourier Transform). This allows conversion between the two
domains in $(O(n \log n))$ time, but it doesn't work directly on continuous
signals — it takes a discrete sampled signal as input, and produces one as
output. Allowing `Signal`s to be converted freely to and from `DiscreteSignal`s
gives us efficient access to the frequency domain.

## The convolution theorem

A key result from Fourier analysis is the **convolution theorem**:

$$
\mathcal{F}\\{f * g\\} = \mathcal{F}\\{f\\} \cdot \mathcal{F}\\{g\\} \\\\
\mathcal{F}\\{f \cdot g\\} = \mathcal{F}\\{f\\} * \mathcal{F}\\{g\\}
$$

where $(f)$ and $(g)$ are signals, $(\*)$ is convolution, and $(\mathcal{F})$
is the Fourier transform. This can be summarized as "pointwise multiplication
in one domain is convolution in the other domain".

The formula can be a bit opaque, so here is a visual explaining what exactly it
means.

#### Original signal

<svg id='signal2-time' style='width: 50%; height: 120px' />
<svg id='signal2-freq' style='width: 50%; height: 120px' />

#### Envelope

<svg id='signal3-time' style='width: 50%; height: 120px' />
<svg id='signal3-freq' style='width: 50%; height: 120px' />

#### After multiplying time

<svg id='signal4-time' style='width: 50%; height: 120px' />
<svg id='signal4-freq' style='width: 50%; height: 120px' />

<div class='controls'>
<div>Original signal</div>
<div class='control'>
<label>Frequency</label>
<input id='signal1-freq-input' type='range' min='20' max='600' style='width:200px' />
</div>
<div class='control'>
<label>Shape</label>
<select id='signal1-shape-input'>
<option value='sin'>Sine</option>
<option value='square'>Square</option>
<option value='saw'>Saw</option>
</select>
</div>
</div>
<div class='controls'>
<div>Envelope</div>
<div class='control'>
<label>Frequency</label>
<input id='signal1-freq-input' type='range' min='20' max='600' style='width:200px' />
</div>
<div class='control'>
<label>Shape</label>
<select id='signal1-shape-input'>
<option value='sin'>Sine</option>
<option value='square'>Square</option>
<option value='saw'>Saw</option>
</select>
</div>
</div>

The convolution theorem is key to understanding many audio processing and
synthesis techniques.

## Audio processing techniques

Let's demonstrate the efficacy of closures by implementing several audio
processing techniques — some of which may be being sold right now as $29
VST plugins.

### Amplitude modulation

Amplitude modulation describes a general class of techniques that involve
multiplying the original signal with an envelope. Depending on the frequency
content of the envelope, this can produce a variety of effects. Fascinatingly,
the core of all amplitude modulation can be expressed in a very small amount of
code. Amplitude modulation for two continuous signals can be implemented in our
framework as follows:

```typescript
function multiply(a: Signal, b: Signal): Signal {
  return {
    f: t => a.f(t) * b.f(t),
    dur: Math.min(a.dur, b.dur),
  };
}
```

Note that signals `a` and `b` are treated symmetrically, so we can actually
consider either one of them to be the "original" signal or the "envelope".

#### Envelopes

At the macroscopic end of the scale, amplitude modulation can be used to apply
envelopes to sounds to make them fade in, fade out, or enter with a sharp
"attack". One common envelope shape is the ADSR, or the
Attack-Decay-Sustain-Release, a piecewise linear function that provides an
initial burst of energy before fading to a sustain level, that is held until
the key is released.

```typescript
// adsr: attack, decay, sustain, release
// tl: time, level
function adsr(at, dt, sl, st, rt): Signal {
  f: (t) => {
    /*    */ if (t < at) return t / at;
    t -= at; if (t < dt) return ((dt - t) + (t * sl)) / dt;
    t -= dt; if (t < st) return sl;
    t -= st; if (t < rt) return sl * (1 - (t / rt));
    return 0;
  },
  dur: at + dt + st + rt,
}
```

It looks like this:

TODO

And, when applied to a signal (we'll use a sawtooth wave), sounds like this:

<iframe src='http://localhost:8080/embed#UnVkaW1lbnRzLnNhdyg0NDAp' class='tsunami-widget'>
</iframe>

#### Tremolo

If our envelope is instead a low-frequency oscillator with a DC offset near 1,
then we get a musical effect called tremolo. It's a subtle way to add richness
to a sound.

#### AM synthesis

If we take amplitude modulation to the limit and use another audible signal as
our envelope, a new sound is produced that can sound radically different from
the original. This is called AM synthesis, and it works because while low
frequencies in the envelope merely change the loudness of a sound over time,
high frequencies in the envelope can actually change the shape of the
individual waves.

Understanding the result of this procedure only requires
understanding the convolution theorem — since applying an envelope is pointwise
multiplication in the time domain, the signals are convolved in the frequency
domain, which introduces plenty of new frequencies to the signal.

### Phase modulation

Taking a step back, let's take another look at our design for continuous signals:

```typescript
interface Signal {
  f: (t: number) => number;
  dur: number;
}
```

A signal has a closure `f` that takes a number and returns a number. With
amplitude modulation, we took two of the returned numbers and multiplied them
together. What if, instead, we took one signal and used it as the input to
another signal?

```typescript
function phase_mod(a: Signal, b: Signal): Signal {
  return {
    f: t => b.f(a.f(t)),
    dur: Math.min(a.dur, b.dur),
  };
};
```

This results in an exciting new technique: phase modulation.

#### Vibrato

If you modulate the phase of a signal using the sum of a unit ramp and a sine
wave, then you get the same signal out but with a smoothly oscillating pitch.

#### PM synthesis

### Filters

I hope that this has been an enlightening discussion on some of the design
decisions I made while working on Tsunami. I hope, also, that this has been a
convincing exploration into signal processing and the possibility for
manipulating sound by direct programming. If you wish to explore further, I
encourage you to try playing with sound on
[Tsunami](https://tsunami.neynt.ca/).

## Footnotes

[^scheme]: C++ got closures in C++11. Java got proper closures in version 8,
  released 2014. As usual, there is a 40-year gap between the invention of an
  incredibly useful language feature in academia and its appearance in the
  mainstream.

[^typed_arrays]: Although there are now typed arrays that can store integers
  and floats.
