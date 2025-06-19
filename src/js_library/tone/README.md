# 🎵 Tone.js Integration Documentation

## Overview

The Tone.js integration provides a comprehensive audio framework for the Squirrel project, enabling rich musical and audio capabilities directly in the browser using the Web Audio API.

## Features

### 🎹 Synthesizers
- **Basic Oscillators**: Sine, Square, Sawtooth, Triangle waves
- **Advanced Synths**: AM, FM, Mono, Poly synthesizers
- **Specialized**: Membrane, Metal, Noise synthesizers
- **Real-time Control**: Volume, frequency, envelope parameters

### 🥁 Drum Machine
- **8 Drum Pads**: Kick, Snare, Hi-hat, Crash, Open Hat, Clap, Tom, Percussion
- **16-Step Sequencer**: Visual pattern programming
- **Pattern Presets**: Basic, Rock, Techno, Funk, Trap, D&B
- **Tempo Control**: 60-200 BPM with swing
- **Keyboard Shortcuts**: Z,X,C,V,A,S,D,F keys

### 🎧 Audio Effects
- **Reverb**: Space and ambience
- **Delay**: Echo and repetition effects
- **Distortion**: Overdrive and saturation
- **Chorus**: Modulation and thickness
- **Filter**: Low-pass, high-pass, band-pass
- **Compressor**: Dynamic range control

### 🎼 Sequencer & Transport
- **Pattern Creation**: Step sequencing
- **Transport Controls**: Play, Stop, Pause
- **Tempo Management**: BPM control
- **Synchronization**: Multiple sequence coordination

### 📁 Audio File Playback
- **Sample Loading**: MP3, WAV, OGG support
- **Loop Control**: Seamless looping
- **Volume Management**: Per-player volume control
- **Multiple Players**: Simultaneous audio streams

## Quick Start

### 1. Basic Setup

```html
<!-- Load Tone.js -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.min.js"></script>
<script src="tone-wrapper.js"></script>
```

### 2. Initialize Audio Context

```javascript
// Start audio context (required by browsers)
await toneWrapper.startAudio();
```

### 3. Create a Synthesizer

```javascript
// Create a basic synth
const synth = toneWrapper.createSynth('sine');

// Play a note
synth.play('C4', '8n');

// Or use direct methods
synth.triggerAttackRelease('A4', '4n');
```

### 4. Use the Drum Machine

```javascript
// Create drum machine
const drums = toneWrapper.createDrumMachine();

// Play individual drums
drums.kick();
drums.snare();
drums.hihat();

// Play a pattern
drums.playPattern(['k', 's', 'h', 's'], '8n');
```

### 5. Add Effects

```javascript
// Create effects
const reverb = toneWrapper.createEffect('reverb', { roomSize: 0.8 });
const delay = toneWrapper.createEffect('delay', { delayTime: '8n' });

// Connect synth through effects
synth.synth.connect(reverb.effect);
reverb.connect(delay.effect);
delay.connect(Tone.Destination);
```

## API Reference

### ToneWrapper Class

#### Core Methods

- `startAudio()` - Initialize audio context
- `stopAudio()` - Stop all audio and transport
- `getAudioInfo()` - Get system information

#### Synthesizer Methods

- `createSynth(type, options)` - Create synthesizer
- `playNote(note, duration, synthId)` - Play a single note
- `destroySynth(synthId)` - Clean up synthesizer

#### Drum Machine Methods

- `createDrumMachine()` - Create drum machine instance

#### Audio Player Methods

- `createPlayer(url, options)` - Create audio player
- `playSound(url, options)` - One-shot audio playback
- `destroyPlayer(playerId)` - Clean up player

#### Effects Methods

- `createEffect(type, options)` - Create audio effect
- `destroyEffect(effectId)` - Clean up effect

#### Transport Methods

- `setTempo(bpm)` - Set transport tempo
- `getTempo()` - Get current tempo
- `startTransport()` - Start transport
- `stopTransport()` - Stop transport
- `pauseTransport()` - Pause transport

#### Sequence Methods

- `createSequence(callback, events, subdivision)` - Create sequence
- `destroySequence(sequenceId)` - Clean up sequence

## Squirrel Framework Integration

The wrapper automatically integrates with the Squirrel framework:

```javascript
// Available on $ object
$.createSynth('sine');
$.createPlayer('audio.mp3');
$.startAudio();

// Available on A elements
atome('#myElement').playNote('C4');
atome('#myElement').playSound('sound.wav');
```

## Test Pages

### 🎹 Basic Synth Test (`basic-synth-test.html`)
- Test all synthesizer types
- Virtual piano keyboard
- Volume and parameter controls
- Real-time audio feedback

### 🥁 Drum Machine (`drum-machine-test.html`)
- 8 drum pads with visual feedback
- 16-step pattern sequencer
- Multiple preset patterns
- Tempo and swing controls
- Keyboard shortcuts

### 🎧 Effects Test (`effects-test.html`)
- All available audio effects
- Real-time parameter control
- Effect chaining
- A/B comparison

### 🎼 Sequencer Test (`sequencer-test.html`)
- Multi-track sequencing
- Pattern programming
- Transport controls
- Export/import patterns

### 🎵 Audio Player (`audio-player-test.html`)
- File loading and playback
- Loop controls
- Multiple simultaneous players
- Playlist management

### 🎹 Virtual Piano (`virtual-piano-test.html`)
- Full 88-key piano interface
- Multiple instrument sounds
- Recording capabilities
- MIDI input support

### 📊 Audio Visualizer (`audio-visualizer-test.html`)
- Real-time waveform display
- Frequency spectrum analysis
- Visual feedback for all audio
- Customizable visualizations

### 🎛️ Complete Demo (`tone-complete-test.html`)
- All features integrated
- Mini digital audio workstation
- Save/load projects
- Professional interface

## Browser Compatibility

- **Chrome/Chromium**: Full support
- **Firefox**: Full support
- **Safari**: Full support (iOS 13+)
- **Edge**: Full support

## Performance Notes

- Audio context must be started by user interaction
- Dispose of unused synthesizers and effects
- Use `destroyX()` methods for cleanup
- Monitor active instances with `getAudioInfo()`

## Troubleshooting

### Audio Not Playing
1. Ensure `startAudio()` was called
2. Check browser audio permissions
3. Verify audio context state

### Performance Issues
1. Dispose unused instances
2. Limit simultaneous voices
3. Check effect chain complexity

### Mobile Considerations
1. iOS requires user interaction for audio
2. Limit polyphony on mobile devices
3. Test on actual devices

## Examples

### Simple Melody
```javascript
const synth = toneWrapper.createSynth('sine');
const melody = ['C4', 'D4', 'E4', 'F4', 'G4'];
let index = 0;

setInterval(() => {
    synth.play(melody[index % melody.length], '8n');
    index++;
}, 250);
```

### Drum Pattern
```javascript
const drums = toneWrapper.createDrumMachine();
const pattern = ['k', null, 's', null, 'k', null, 's', 'h'];

let step = 0;
setInterval(() => {
    const beat = pattern[step % pattern.length];
    if (beat === 'k') drums.kick();
    if (beat === 's') drums.snare();
    if (beat === 'h') drums.hihat();
    step++;
}, 125); // 120 BPM
```

### Effect Chain
```javascript
const synth = toneWrapper.createSynth('sawtooth');
const filter = toneWrapper.createEffect('filter', { frequency: 1000 });
const delay = toneWrapper.createEffect('delay', { delayTime: '8n' });
const reverb = toneWrapper.createEffect('reverb', { roomSize: 0.5 });

// Chain: Synth → Filter → Delay → Reverb → Output
synth.synth.connect(filter.effect);
filter.connect(delay.effect);
delay.connect(reverb.effect);
reverb.connect(Tone.Destination);
```

## Resources

- [Tone.js Official Documentation](https://tonejs.github.io/)
- [Web Audio API Reference](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Music Theory for Programmers](https://github.com/vakila/music-theory-for-programmers)

---

🎵 **Happy Music Making!** 🎵
