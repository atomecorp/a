/**
 * 🎵 TONE.JS WRAPPER
 * Web Audio framework integration for Squirrel Framework
 */

class ToneWrapper {
    constructor() {
        this.synths = new Map();
        this.players = new Map();
        this.effects = new Map();
        this.sequences = new Map();
        this.initialized = false;
        
        this.init();
    }

    async init() {
        if (typeof Tone === 'undefined') {
            console.warn('Tone.js not loaded. Please load Tone.js first.');
            return;
        }

        this.initialized = true;
        this.setupSquirrelIntegration();
        
        console.log('🎵 Tone.js Wrapper initialized');
    }

    /**
     * Setup Squirrel framework integration
     */
    setupSquirrelIntegration() {
        // Add Tone methods to Squirrel's $ function
        if (typeof $ !== 'undefined') {
            $.createSynth = this.createSynth.bind(this);
            $.createPlayer = this.createPlayer.bind(this);
            $.startAudio = this.startAudio.bind(this);
            $.stopAudio = this.stopAudio.bind(this);
        }

        // Add methods to A class instances
        if (typeof A !== 'undefined') {
            A.prototype.playNote = function(note, duration = '8n') {
                return toneWrapper.playNote(note, duration);
            };

            A.prototype.playSound = function(url) {
                return toneWrapper.playSound(url);
            };
        }
    }

    /**
     * Start audio context (required for modern browsers)
     */
    async startAudio() {
        if (Tone.context.state !== 'running') {
            await Tone.start();
            console.log('🎵 Audio context started');
        }
    }

    /**
     * Stop audio context
     */
    stopAudio() {
        Tone.Transport.stop();
        Tone.Transport.cancel();
    }

    /**
     * Create synthesizer
     */
    createSynth(type = 'sine', options = {}) {
        const synthId = `synth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        let synth;
        switch (type) {
            case 'am':
                synth = new Tone.AMSynth(options);
                break;
            case 'fm':
                synth = new Tone.FMSynth(options);
                break;
            case 'mono':
                synth = new Tone.MonoSynth(options);
                break;
            case 'poly':
                synth = new Tone.PolySynth(options);
                break;
            case 'membrane':
                synth = new Tone.MembraneSynth(options);
                break;
            case 'metal':
                synth = new Tone.MetalSynth(options);
                break;
            case 'noise':
                synth = new Tone.NoiseSynth(options);
                break;
            default:
                synth = new Tone.Synth({
                    oscillator: { type: type },
                    ...options
                });
        }

        synth.toDestination();

        this.synths.set(synthId, {
            instance: synth,
            type: type,
            options: options
        });

        return {
            id: synthId,
            synth: synth,
            play: (note, duration = '8n') => this.playNote(note, duration, synthId),
            triggerAttack: (note) => synth.triggerAttack(note),
            triggerRelease: () => synth.triggerRelease(),
            triggerAttackRelease: (note, duration) => synth.triggerAttackRelease(note, duration),
            setVolume: (volume) => synth.volume.value = volume,
            destroy: () => this.destroySynth(synthId)
        };
    }

    /**
     * Create audio player
     */
    createPlayer(url, options = {}) {
        const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const player = new Tone.Player({
            url: url,
            autostart: false,
            loop: options.loop || false,
            ...options
        }).toDestination();

        this.players.set(playerId, {
            instance: player,
            url: url,
            options: options
        });

        return {
            id: playerId,
            player: player,
            play: () => player.start(),
            stop: () => player.stop(),
            pause: () => player.stop(),
            setVolume: (volume) => player.volume.value = volume,
            setLoop: (loop) => player.loop = loop,
            destroy: () => this.destroyPlayer(playerId)
        };
    }

    /**
     * Play a note
     */
    playNote(note, duration = '8n', synthId = null) {
        let synth;
        
        if (synthId && this.synths.has(synthId)) {
            synth = this.synths.get(synthId).instance;
        } else {
            // Create temporary synth
            synth = new Tone.Synth().toDestination();
        }

        synth.triggerAttackRelease(note, duration);
        return synth;
    }

    /**
     * Play a sound file
     */
    async playSound(url, options = {}) {
        const player = this.createPlayer(url, options);
        
        return new Promise((resolve, reject) => {
            player.player.onstop = resolve;
            player.player.onerror = reject;
            player.play();
        });
    }

    /**
     * Create drum machine
     */
    createDrumMachine() {
        const drums = {
            kick: new Tone.MembraneSynth().toDestination(),
            snare: new Tone.NoiseSynth().toDestination(),
            hihat: new Tone.MetalSynth({
                frequency: 200,
                envelope: { attack: 0.001, decay: 0.1, release: 0.01 }
            }).toDestination()
        };

        return {
            kick: () => drums.kick.triggerAttackRelease('C1', '8n'),
            snare: () => drums.snare.triggerAttackRelease('8n'),
            hihat: () => drums.hihat.triggerAttackRelease('32n'),
            playPattern: (pattern, interval = '8n') => {
                const sequence = new Tone.Sequence((time, note) => {
                    if (note === 'k') drums.kick.triggerAttackRelease('C1', '8n', time);
                    if (note === 's') drums.snare.triggerAttackRelease('8n', time);
                    if (note === 'h') drums.hihat.triggerAttackRelease('32n', time);
                }, pattern, interval);
                
                sequence.start(0);
                Tone.Transport.start();
                return sequence;
            }
        };
    }

    /**
     * Create effect
     */
    createEffect(type, options = {}) {
        const effectId = `effect_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        let effect;
        switch (type) {
            case 'reverb':
                effect = new Tone.Reverb(options);
                break;
            case 'delay':
                effect = new Tone.Delay(options);
                break;
            case 'distortion':
                effect = new Tone.Distortion(options);
                break;
            case 'chorus':
                effect = new Tone.Chorus(options);
                break;
            case 'filter':
                effect = new Tone.Filter(options);
                break;
            case 'compressor':
                effect = new Tone.Compressor(options);
                break;
            default:
                throw new Error(`Unknown effect type: ${type}`);
        }

        this.effects.set(effectId, {
            instance: effect,
            type: type,
            options: options
        });

        return {
            id: effectId,
            effect: effect,
            connect: (destination) => effect.connect(destination),
            disconnect: () => effect.disconnect(),
            destroy: () => this.destroyEffect(effectId)
        };
    }

    /**
     * Create sequence/pattern
     */
    createSequence(callback, events, subdivision = '8n') {
        const sequenceId = `sequence_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const sequence = new Tone.Sequence(callback, events, subdivision);

        this.sequences.set(sequenceId, {
            instance: sequence,
            callback: callback,
            events: events,
            subdivision: subdivision
        });

        return {
            id: sequenceId,
            sequence: sequence,
            start: (time = 0) => sequence.start(time),
            stop: (time) => sequence.stop(time),
            destroy: () => this.destroySequence(sequenceId)
        };
    }

    /**
     * Set tempo
     */
    setTempo(bpm) {
        Tone.Transport.bpm.value = bpm;
    }

    /**
     * Get tempo
     */
    getTempo() {
        return Tone.Transport.bpm.value;
    }

    /**
     * Start transport
     */
    startTransport() {
        Tone.Transport.start();
    }

    /**
     * Stop transport
     */
    stopTransport() {
        Tone.Transport.stop();
    }

    /**
     * Pause transport
     */
    pauseTransport() {
        Tone.Transport.pause();
    }

    /**
     * Destroy synth
     */
    destroySynth(synthId) {
        const synth = this.synths.get(synthId);
        if (synth) {
            synth.instance.dispose();
            this.synths.delete(synthId);
        }
    }

    /**
     * Destroy player
     */
    destroyPlayer(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            player.instance.dispose();
            this.players.delete(playerId);
        }
    }

    /**
     * Destroy effect
     */
    destroyEffect(effectId) {
        const effect = this.effects.get(effectId);
        if (effect) {
            effect.instance.dispose();
            this.effects.delete(effectId);
        }
    }

    /**
     * Destroy sequence
     */
    destroySequence(sequenceId) {
        const sequence = this.sequences.get(sequenceId);
        if (sequence) {
            sequence.instance.dispose();
            this.sequences.delete(sequenceId);
        }
    }

    /**
     * Get audio info
     */
    getAudioInfo() {
        return {
            activeSynths: this.synths.size,
            activePlayers: this.players.size,
            activeEffects: this.effects.size,
            activeSequences: this.sequences.size,
            contextState: Tone.context.state,
            sampleRate: Tone.context.sampleRate,
            tempo: this.getTempo(),
            toneVersion: Tone.version || 'Unknown'
        };
    }
}

// Create wrapper instance
const toneWrapper = new ToneWrapper();

// Export for ES6 modules
export default toneWrapper;

// Global access
window.toneWrapper = toneWrapper;
