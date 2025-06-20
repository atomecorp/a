/**
 * 🚀 SQUIRREL APPLICATION - SIMPLIFIED ENTRY POINT
 */

    await import('./apis.js');
    const { $, define, observeMutations } = await import('./squirrel.js');

    window.$ = $;
    window.define = define;
    window.observeMutations = observeMutations;
    window.body = document.body;
    window.toKebabCase = (str) => str.replace(/([A-Z])/g, '-$1').toLowerCase();

    console.log('✅ Squirrel Core chargé');
    
    await import('./kickstart.js');
    
    window.dispatchEvent(new CustomEvent('squirrel:ready'));
    console.log('🎉 Événement squirrel:ready déclenché');
    
