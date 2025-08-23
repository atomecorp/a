// Lyrix AUv3 Launcher — STRICT UI (1 button + 1 input + 1 list)
// IDs: btn_document_picker, input_app_address, list_collected_addresses
// Bridge contracts:
//  JS->Swift: open_link {address}, present_picker_file {}, log_address {address}, append_address {address}
//  Swift->JS: picker_result {address?}, open_result {ok}
(function(){
  const HAS_BRIDGE = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge);
  function post(action, data){
    if(!HAS_BRIDGE) return false;
    try{ window.webkit.messageHandlers.swiftBridge.postMessage({ action, data: data||{} }); return true; }catch(e){ return false; }
  }
  function onReturn(e){ if(e.key==='Enter'){ e.preventDefault(); addFromInput(); } }

  // UI build (Squirrel) — exactly 3 controls
  const parentView = (typeof grab==='function' ? grab('view') : document.body);
  const btn = Button({ id:'btn_document_picker', onText:'Pick Document', offText:'Pick Document', parent:parentView, onAction:presentPicker, offAction:presentPicker, css:{ display:'block', width:'calc(100% - 20px)', height:'36px', margin:'10px' } });
  const input = $('input', { id:'input_app_address', parent:parentView, css:{ display:'block', width:'calc(100% - 20px)', height:'32px', margin:'0 10px 6px 10px', padding:'6px 8px', background:'#1a1f25', color:'#e6e6e6', border:'1px solid #2c343d', borderRadius:'4px' } });
  input.value = 'lyrix://open?song=MySong123';
  try{ input.addEventListener('keydown', onReturn); }catch(_){ }
  const list = $('ul', { id:'list_collected_addresses', parent:parentView, css:{ display:'block', width:'calc(100% - 20px)', margin:'0 10px 10px 10px', padding:'0', listStyle:'none' } });

  // Accessibility identifiers must match IDs
  function setAcc(id){ try{ const el=document.getElementById(id); if(el){ el.setAttribute('accessibilityIdentifier', id); } }catch(_){ } }
  setAcc('btn_document_picker');
  setAcc('input_app_address');
  setAcc('list_collected_addresses');

  // State (in-memory list for display; persistence via native append_address)
  const items = [];
  function render(){
    list.innerHTML = '';
    items.forEach((addr)=>{
      const li = $('li', { parent:list, text: addr, css:{ padding:'8px', border:'1px solid #2c343d', borderRadius:'6px', marginBottom:'6px', cursor:'pointer', background:'#151a20' } });
      li.setAttribute('accessibilityIdentifier', 'cell_link');
      try{ li.addEventListener('click', ()=> openAddress(addr)); }catch(_){ }
    });
  }

  function validateURL(s){ try{ new URL(s); return true; }catch(_){ return /^\w[\w.+-]*:\/\/.+/.test(s); } }

  function addAddress(addr){ if(!addr || !validateURL(addr)) return; if(!items.includes(addr)){ items.unshift(addr); render(); } post('log_address', { address: addr }); post('append_address', { address: addr }); }
  function addFromInput(){
    const val = (input.value||'').trim();
    if(!val) return;
    // Open the main app by default on Enter
    openAddress(val);
    // Also add to UI list and request native persistence
    addAddress(val);
  }

  function presentPicker(){ post('present_picker_file', {}); }
  function openAddress(address){ if(!validateURL(address)) return; post('open_link', { address }); }

  // Swift callbacks
  window.AUv3API = window.AUv3API || {};
  const prev = window.AUv3API._receiveFromSwift;
  window.AUv3API._receiveFromSwift = function(msg){
    try{
      if(prev) try{ prev(msg); }catch(_){ }
      if(!msg || typeof msg !== 'object') return;
      if(msg.action === 'picker_result'){
        if(msg.address) addAddress(String(msg.address));
      } else if(msg.action === 'open_result'){
        // optional: ignore failures silently per minimal spec
      }
    }catch(_){ }
  };
})();
