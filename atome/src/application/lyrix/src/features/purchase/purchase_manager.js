// Simple Purchase Manager stub for MIDI Console unlock
export class PurchaseManager {
  constructor(){
    this.productId = 'midi_console_unlock';
    this.statusKey = 'lyrix_purchase_midi_console';
    this.owned = localStorage.getItem(this.statusKey) === 'owned';
    this._wireBridge();
  }
  isOwned(){ return this.owned; }
  requestPurchase(){
    if (this.owned) return Promise.resolve(true);
    return new Promise((resolve)=>{
      const finalize = (ok)=>{ if(ok){ this.owned=true; localStorage.setItem(this.statusKey,'owned'); } resolve(ok); this._notifyStatusChange(); };
      // If native bridge purchase exists, send message, else simulate success.
      try {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge) {
          const payload = { action:'purchaseProduct', productId:this.productId, requestId: Date.now() };        
          window.__pendingPurchaseResolve = finalize;
          window.webkit.messageHandlers.swiftBridge.postMessage(payload);
        } else {
          // Simulate success immediately (placeholder)
          setTimeout(()=>finalize(true), 400);
        }
      } catch(e){ finalize(false); }
    });
  }
  restorePurchases(){
    return new Promise((resolve)=>{
      const finalize = (ok)=>{ resolve(ok); this._notifyStatusChange(); };
      try {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge){
            window.__pendingRestoreResolve = finalize;
            window.webkit.messageHandlers.swiftBridge.postMessage({ action:'restorePurchases', requestId: Date.now() });
        } else {
            // Simulate immediate success if already owned
            finalize(this.owned);
        }
      } catch(e){ finalize(false); }
    });
  }
  _notifyStatusChange(){
    const evt = new CustomEvent('lyrix-purchase-updated', { detail: { productId: this.productId, owned: this.owned }});
    window.dispatchEvent(evt);
  }
  _wireBridge(){
    // Hook into AUv3API receive path if present
    const self=this;
    const original = (window.AUv3API && window.AUv3API._receiveFromSwift) ? window.AUv3API._receiveFromSwift : null;
    if (original && !original._lyrixPurchaseWrapped){
      window.AUv3API._receiveFromSwift = function(msg){
        try {
          if (msg){
            if (msg.action === 'purchaseResult' && msg.productId === self.productId){
              const ok = !!msg.success; if (ok){ self.owned=true; localStorage.setItem(self.statusKey,'owned'); }
              if (window.__pendingPurchaseResolve){ window.__pendingPurchaseResolve(ok); window.__pendingPurchaseResolve=null; }
              self._notifyStatusChange();
            } else if (msg.action === 'restorePurchasesResult') {
              // Expect msg.products = [productId,...]
              const products = msg.products || [];
              if (products.includes(self.productId)) {
                self.owned = true; localStorage.setItem(self.statusKey,'owned');
              }
              if (window.__pendingRestoreResolve){ window.__pendingRestoreResolve(true); window.__pendingRestoreResolve=null; }
              self._notifyStatusChange();
            }
          }
        } catch(e){}
        return original.apply(this, arguments);
      };
      window.AUv3API._receiveFromSwift._lyrixPurchaseWrapped = true;
    }
  }
}

// Helper singleton accessor
export function getPurchaseManager(){
  if (!window._lyrixPurchaseManager){ window._lyrixPurchaseManager = new PurchaseManager(); }
  return window._lyrixPurchaseManager;
}
