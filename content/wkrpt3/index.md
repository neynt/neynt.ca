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

## Introduction

For one of my personal projects, I tried create a new way to design sounds: by
representing them in a programming language, and manipulating them directly in
an in-browser programming environment called
[Tsunami](https://tsunami.neynt.ca/). In this report, I will discuss some of
the engineering decisions that I had to make while developing Tsunami; most
notably, the representation of the signals themselves. I will also demonstrate
the effectiveness of Tsunami by showing how some common signal processing
algorithms might be implemented in this framework.

## Background

### Signals

A signal is a function over time. This is the signal that microphones try to
capture and speakers try to recreate; the signal that encodings like MP3, AAC,
and Vorbis try to represent in a compressed format. Physically, this signal
might represent the displacement of a microphone diaphragm, a speaker cone, or
an eardrum. *Continuous-time* signals are like mathematical functions in that
they are defined for every value of time and can be infinitely detailed, while
*discrete-time* signals are series of values measured at a particular sampling
rate. While signals are continuous in reality (ignoring quantum mechanics), one
must usually convert them to discrete signals in order to manipulate them on a
computer.

### Closures

Closures, or lexically scoped first-class functions, first appeared in Scheme
in the 1970s and, as with all good language features, have been ignored in
mainstream programming until a few years ago.[^scheme] *First-class* means that
the function can be passed around, stored in a variable, and returned like any
other value; *lexically scoped* means that the function can capture values from
the environment in which it was defined even if it is passed outside that
environment. These two properties together are very powerful; for example, they
make it possible to define a function like `quadratic(a, b, c)` that itself
returns a function `f(x)` that calculates the quadratic $( ax^2 + bx + c )$.

The vast majority of languages that support closures are garbage collected.[^rust]
This is understandable, since lexically scoped closures make it difficult to
tell when memory can be freed. One can no longer simply pop off a stack frame
when a function returns, since that stack frame might contain variables that
are referenced by a closure that the function returns.

### TypeScript

Most of the code examples in this article are written in TypeScript,
Microsoft's layer of gradual typing on top of JavaScript. TypeScript's type
definitions and annotations allow us to precisely specify the data structures
we are using. While JavaScript has its warts, it also has good parts: it
supports closures, its syntax has been getting better with each new version,
and many smart people have worked very hard to make it run really fast right in
your browser.

![](javascript-the-good-parts.jpg)

*Figure: JavaScript's good parts.*

## Design goals

Our goal is to find a way to express these signals, as well as transformations
on these signals, naturally in a programming environment.

An ideal means of representing signals, for the purposes of Tsuanami, should
satisfy the following properties.

- It should be flexible. One should be able to apply a wide variety of signal
  processing techniques using a single interface.
- It should be performant. It should be possible to play sounds in real time
  without waiting for them to render.
- It should be easy to manipulate in a language that runs in your web browser.
  This goal is more vain than technical; applications that run directly in the
  browser have a low barrier to entry, so making Tsunami a web app increases
  the chance that it becomes popular some day.

MP3 is an example of something that doesn't satisfy these properties. It is
opaque, and must be decoded to get access to any meaningful information in the
signal. It is inflexible; there are no obvious transformations you can do to an
MP3 file other than decoding it.

## Representing signals

### Continuous signals

As you may have figured out, one way to represent a signal is to directly use a
first-class function.

```typescript
type Signal = (t: number) => number;
```

That is, a `Signal` is a function that takes a number and returns a number.

This is a very elegant way to treat signals. But this representation doesn't
capture all the information that we might want. Most notably, it's impossible
to tell how long a signal lasts — we must treat all signals as if they have
infinite duration! This is inefficient, so let's put the function and its
duration together in an `interface` (TypeScript's name for "the shape of an
object").

```typescript
interface Signal {
  f: (t: number) => number;
  dur: number;
}
```

This, I claim, is enough to do an impressive amount. A signal can be created
simply by describing it as a calculation of time, and annotating it with its
actual duration. For example, here is a pure tone at A440:

```typescript
const sine_440: Signal = {
  f: t => Math.sin(2 * Math.PI * 440 * t),
  dur: Infinity,
}
```

### Discrete signals

However, it isn't enough to be able to work with continuous signals. While they
are a useful and flexible way to think about signals, we are ultimately working
on a computer, which has to eventually output digital samples to an output
device — these digital samples are only later converted to the analog signal
that is played back. Also, many efficient digital signal processing algorithms
are efficient only on discrete signals, which are sampled at a constant rate
over time. Therefore, we need a way to represent these discrete signals. One
natural way is with a flat array of samples:

```typescript
type DiscreteSignal = Float32Array
```

Since arrays already carry their length, we don't need to store the size of the
array separately, so we don't need to annotate this array with a duration like
we did the continuous signal. However, the array itself doesn't have enough
information to play back the signal — we also need to know how much time each
sample represents, the *sample rate*. So, we will similarly wrap this array in
an object as follows:

```typescript
interface DiscreteSignal {
  samples: Float32Array;
  sample_rate: number;
}
```

This is now fully enough information to reproduce the signal.

### Conversion

At this point, we have two flexible and simple representations of signals. But
they aren't interchangeable. For example, suppose we wanted to mix together two
signals to produce a third signal that is their "sum" — there is no natural way
to add together a function and an array. How do we bridge this gap? As it turns
out, there are very natural ways to convert between the two.

If we have continuous signal, converting it to a discrete signal is only
a matter of sampling it:

```typescript
function discretize(s: Signal, sample_rate: number) {
  const n = Math.floor(s.dur * sample_rate);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] = s.f(i / sample_rate);
  }
  return { samples, sample_rate } as DiscreteSignal;
}
```

One might worry that this discards information, and indeed it does, but as the
Sampling Theorem states, only information above the Nyquist frequency of
`sample_rate / 2` is lost. So if we pick a standard sample rate like 44100 Hz,
all information in frequencies below 22050 Hz will be preserved, encompassing
the entire human hearing range.

What if we have a discrete signal and want to make it continuous? This is a bit
trickier, and there are several approaches we can try here. The most "proper"
way is to sample the Discrete-time Fourier Transform (DTFT). This interpolates
the discrete samples "perfectly" in that if the original continuous signal had
no information above the Nyquist frequency, then the DTFT lets us recover the
original signal perfectly. However, it is computationally expensive. Since
we'll be converting between discrete and continuous signals all the time, we
can use the zero-order hold: simply holding the signal at the sampled level for
each sampling period.

```typescript
function zero_order_hold(s: DiscreteSignal): Signal {
  return {
    f: t => s.samples[Math.round(t * s.sample_rate)] || 0,
    dur: s.samples.length / s.sample_rate,
  }
}
```

We now have a representation for signals that mostly satisfies the three
properties we previously mentioned. It is performant: it is possible to get the
value of the signal at any time using only a function call, and we used
techniques such as the `dur` field in `Signal` and the zero order hold to keep
things efficient. And it is easy to manipulate in JavaScript, so it can run
directly in your browser. The criterion that this solution doesn't fully
satisfy is flexibility: rather than having a single interface that can be used
to apply any signal processing technique, the user is forced to separate
continuous and discrete signals.

There are a couple ways to achieve the more uniform interface that we
originally desired. One way is to model every discrete signal as a continuous
signal by immediately converting discrete signals to continuous whenever they
are created. Unfortunately, this makes it easy to accidentally do inefficient
things, since algorithms that are efficient only on discrete signals can now
take continuous signals as input. Another way is to use *typeclasses*, a
language feature that allows us to treat both types of signals generically by
specifying their common functionality. However, typeclasses haven't really
become mainstream yet, and aren't available in most mainstream programming
languages including TypeScript. In the end, I felt that sacrificing flexibility
was the best trade off to make.

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

### Aside: The convolution theorem

A key result from Fourier analysis is the **convolution theorem**:

$$
\mathcal{F}\\{f * g\\} = \mathcal{F}\\{f\\} \cdot \mathcal{F}\\{g\\} \\\\
\mathcal{F}\\{f \cdot g\\} = \mathcal{F}\\{f\\} * \mathcal{F}\\{g\\}
$$

where $(f)$ and $(g)$ are signals, $(\*)$ is convolution, and $(\mathcal{F})$
is the Fourier transform.

This theorem is key to understanding many audio processing and synthesis
techniques.

The formula can be a bit opaque, so here is a visual explaining what exactly it
means.

#### Original signal

<svg id='signal2-time' style='width: 50%; height: 120px' />
<svg id='signal2-freq' style='width: 50%; height: 120px' />

#### Envelope

<svg id='signal3-time' style='width: 50%; height: 120px' />
<svg id='signal3-freq' style='width: 50%; height: 120px' />

#### After pointwise-multiplying in time

<svg id='signal4-time' style='width: 50%; height: 120px' />
<svg id='signal4-freq' style='width: 50%; height: 120px' />

<div class='controls'>
<div>Original signal</div>
<div class='control'>
<label>Frequency</label>
<input id='signal2-freq-input' type='range' min='20' max='600' style='width:200px' />
</div>
<div class='control'>
<label>Shape</label>
<select id='signal2-shape-input'>
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
<input id='signal3-freq-input' type='range' min='10' max='200' style='width:200px' />
</div>
<div class='control'>
<label>Amplitude</label>
<input id='signal3-amp-input' type='range' min='0' max='10' style='width:200px' />
</div>
</div>

The most important thing to notice here is that pointwise multiplication in the
time domain becomes convolution in the frequency domain. Note that this also
works in the other way — if you pointwise multiply in the frequency domain (for
example, to filter out unwanted frequencies), that implies you need to convolve
in the time domain.

## Audio processing techniques

In this section, we demonstrate the effectiveness of our design by implementing
several audio processing techniques.

### Amplitude modulation

Amplitude modulation describes a general class of techniques that involve
multiplying the original signal with an envelope. Depending on the frequency
content of the envelope, this can produce a variety of effects. Fascinatingly,
the core of all amplitude modulation can be expressed in a very small amount of
code. Amplitude modulation for two continuous signals can be implemented in our
framework as follows:

```typescript
function mul(a: Signal, b: Signal): Signal {
  return {
    f: t => a.f(t) * b.f(t),
    dur: Math.min(a.dur, b.dur),
  };
}
```

Note that signals `a` and `b` are treated symmetrically, so we can actually
consider either one of them to be the "original" signal or the "envelope". That
is, pointwise multiplication is commutative.

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
function adsr({ at, dt, sl, st, rt }): Signal {
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

For example, `adsr({ at: 0.1, dt: 0.3, sl: 0.2, st: 0.5, rt: 0.2 })` looks like this:

<svg id='adsr-time' style='width: 100%; height: 120px' />

And, when applied to a signal (we'll use a sawtooth wave), sounds like this:

<iframe src='https://tsunami.neynt.ca/embed#Rm4ub3BlbihSdWRpbWVudHMpOwpjb25zdCBteV9hZHNyID0gYWRzcih7CiAgYXQ6IDAuMSwgZHQ6IDAuMywgc2w6IDAuMiwgc3Q6IDAuNSwgcnQ6IDAuMgp9KTsKbXVsKHNhdyg0NDApLCBteV9hZHNyKQ==' class='tsunami-widget'>
</iframe>

#### Tremolo

If our envelope is instead a low-frequency oscillator with a DC offset near 1,
then we get a musical effect called tremolo. It's a subtle way to add richness
to a sound.

<iframe src='https://tsunami.neynt.ca/embed#Rm4ub3BlbihSdWRpbWVudHMpOwpjb25zdCB0cmVtb2xvID0gc3VtKFsKICBkYygxKSwKICBnYWluKDAuNSwgc2luZSg4KSksCl0pOwptdWwoZ2FpbigwLjUsIHNhdyg0NDApKSwgdHJlbW9sbyk=' class='tsunami-widget' style='min-height: 200px'>
</iframe>

#### AM synthesis

If we take amplitude modulation to the limit and use another audible signal as
our envelope, a new sound is produced that can sound radically different from
the original. This is called AM synthesis, and it works because while low
frequencies in the envelope merely change the loudness of a sound over time,
high frequencies in the envelope can actually change the shape of the
individual waves.

Understanding the result of this procedure only requires understanding the
convolution theorem — since applying an envelope is pointwise multiplication in
the time domain, the signals are convolved in the frequency domain, which
introduces plenty of new frequencies to the signal.

<iframe src='https://tsunami.neynt.ca/embed#Rm4ub3BlbihSdWRpbWVudHMpOwptdWwoc2F3KDQ3MCksIHNpbmUoNDAwKSk=' class='tsunami-widget'>
</iframe>

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

This results in an exciting new technique: phase modulation. Signal `a`
modulates the phase of signal `b`, essentially allowing us to play `b` faster
or slower over time, or even to play `b` back in time. In fact, if we calculate
`a` as the integral of a desired instantaneous frequency modifier, then phase
modulation can be used to implement frequency modulation.

#### Vibrato

If you modulate the phase of a signal using the sum of a unit ramp and a sine
wave, then you get the same signal out but with a smoothly oscillating pitch, a
musical effect known as vibrato.

<iframe src='https://tsunami.neynt.ca/embed#Rm4ub3BlbihSdWRpbWVudHMpOwpjb25zdCBtb2QgPSBzdW0oWwogIHJhbXBfKDEpLAogIGdhaW4oMC4wMDA3LCBzaW5lKDcpKSwKXSk7CnBoYXNlX21vZChtb2QsIHNpbmUoNDQwKSk=' class='tsunami-widget' style='min-height: 200px'>
</iframe>

#### FM synthesis

Similarly to AM synthesis, we can modulate the phase of a signal using another
audible signal to produce interesting effects. In particular, this can create a
sound whose timbre varies over time, a common property of musical instruments.

<iframe src='https://tsunami.neynt.ca/embed#Rm4ub3BlbihSdWRpbWVudHMpOwpjb25zdCBlbnYgPQogIGFkc3Ioe2F0OiAwLjQsIGR0OiAwLjQsIHNsOiAwLjU1LCBzdDogMSwgcnQ6IDAuNH0pOwpjb25zdCBtb2QgPQogIHN1bShbbXVsKGdhaW4oMC4wMDEsIHNpbmUoNDQwKSksIGVudiksIHJhbXBfKDEuMCldKTsKcGhhc2VfbW9kKG1vZCwgbXVsKHNhdyg0NDApLCBlbnYpKQ==' class='tsunami-widget' style='min-height: 200px'>
</iframe>

### Filters

Finally, suppose we start with white noise. By discretizing the noise applying
a convolutional filter, we can filter the frequencies present in the noise to
our desired range.

<iframe src='https://tsunami.neynt.ca/embed#Rm4ub3BlbihSdWRpbWVudHMpOwpjb25zdCBvcmlnX25vaXNlID0gY3JvcCgxLCBub2lzZSk7CmxldCByZXN1bHQgPSBkaXNjcmV0aXplKDQ0MTAwLCBvcmlnX25vaXNlKTsKcmVzdWx0ID0gRmlsdGVycy5scGYoMTc2MCkocmVzdWx0KTsKcmVzdWx0ID0gemVyb19vcmRlcl9ob2xkKHJlc3VsdCk7CmNvbmNhdChvcmlnX25vaXNlLCByZXN1bHQpOw==' class='tsunami-widget' style='min-height: 200px'>
</iframe>

## Conclusion

In this article, we discussed some of the design decisions that I made while
working on Tsunami. We saw that while it would be ideal to have a single
representation of signals, the existence of both continuous and discrete
signals requires that we separate them for efficiency. We also demonstrated the
viability of our final design by using it to implement several common signal
processing techniques.

I hope, also, that this has been a convincing dive into the possibility for
manipulating sound by programming. If you wish to explore further, I encourage
you to play with [Tsunami](https://tsunami.neynt.ca/) (though I have yet
to write good documentation for it).

## Footnotes

[^scheme]: C++ got closures in C++11. Java got proper closures in version 8,
  released 2014. As usual, there is a 40-year gap between the invention of an
  incredibly useful language feature in academia and its appearance in the
  mainstream.

[^rust]: While it was once believed that garbage collection is necessary to
  have closures, the programming language Rust implements closures without a
  garbage collector by keeping track of references using its ownership system.

[^typed_arrays]: Although there are now typed arrays that can store integers
  and floats.
