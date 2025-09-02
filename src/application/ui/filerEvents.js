// FilerEvents (disabled): no-op stub to guarantee the custom module does not attach any events.
(function(global){
  'use strict';
  function createSelectionModel(){
    return { set: new Set(), anchor: null, focus: null, shiftLock: false };
  }
  function attachFilerEvents(container, options){
    return {
      destroy(){},
      selection: (options && options.selection) || createSelectionModel(),
      selectAllVisible(){},
      startRename(){},
      openMenuAt(){},
      setShiftLock(){},
      setListingPath(){},
    };
  }
  global.FilerEvents = { attach: attachFilerEvents, createSelectionModel };
})(window);
