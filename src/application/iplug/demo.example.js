// Demo usage for Squirrel AV Audio API
// Validates: create 2 clips, markers, sprites, play/stop/jump, follow-actions, envelopes, MIDI map, backend swap

(function(){
  const A = window.Squirrel.av.audio;
  A.on('backend_changed', ({backend})=>console.log('backend ->', backend));

  // Ensure backend
  A.detect_and_set_backend(['iplug','html']);

  // Define two clips
  A.create_clip({ id:'c1', path_or_bookmark:'Recordings/clip1.m4a', mode:'preload',
    markers:[{name:'mA', frame: 48000},{name:'mB', frame: 96000}],
    sprites:[{name:'s1', start:0, end:24000}],
    envelope_default:{a:0.001,d:0.05,s:0.8,r:0.1} });
  A.create_clip({ id:'c2', path_or_bookmark:'Recordings/clip2.m4a', mode:'stream',
    markers:[{name:'start', frame: 0}],
    sprites:[{name:'intro', start:0, end:12000}] });

  // Play and control
  A.play({ clip_id:'c1', when:{type:'now'}, start:{marker:'mA'}, end:'clip_end', loop:{mode:'off'}, xfade_samples:64 });
  setTimeout(()=> A.jump({ voice_id:'v1', to:{marker:'mB'}, xfade_samples:64 }), 1500);
  setTimeout(()=> A.stop_clip({ clip_id:'c1', release_ms:50 }), 4000);

  // Follow actions on marker
  A.set_marker_follow_actions({ clip_id:'c1', marker:'mA', actions:[{ action:'jump', target_marker:'mB', probability:0.7 }] });

  // Parameters and MIDI map
  A.set_param({ target:'global', name:'gain', value:0.9 });
  A.map_midi({ cc: [{ cc:1, target:'env_attack', range:[0.001, 0.5] }, { cc:2, target:'env_release', range:[0.01, 1.0] }] });

  // Swap backend to test routing
  // setTimeout(()=> A.set_backend('html'), 5000);

  // Listen to events
  A.on('voice_started', (e)=>console.log('voice_started', e));
  A.on('voice_ended', (e)=>console.log('voice_ended', e));
  A.on('marker_hit', (e)=>console.log('marker_hit', e));
})();
