/**
 * 📤 PWA SHARE API - Native Sharing Integration
 * Provides Web Share API functionality for PWA
 */

class PWAShare {
  constructor() {
    this.isSupported = 'share' in navigator;
  }
  
  async shareContent(shareData) {
    if (!this.isSupported) {
      console.warn('Web Share API not supported');
      return this.fallbackShare(shareData);
    }
    
    try {
      await navigator.share({
        title: shareData.title || document.title,
        text: shareData.text || 'Check out this awesome app!',
        url: shareData.url || window.location.href,
        ...shareData
      });
      
      console.log('✅ Content shared successfully');
      return true;
      
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('ℹ️ Share cancelled by user');
      } else {
        console.error('❌ Share failed:', error);
      }
      return false;
    }
  }
  
  async shareComponent(componentName, demoUrl) {
    return this.shareContent({
      title: `${componentName} - Squirrel Framework`,
      text: `Check out this ${componentName} component demo!`,
      url: demoUrl
    });
  }
  
  fallbackShare(shareData) {
    // Fallback for browsers without Web Share API
    const shareUrl = `mailto:?subject=${encodeURIComponent(shareData.title)}&body=${encodeURIComponent(shareData.text + ' ' + shareData.url)}`;
    window.open(shareUrl);
    return true;
  }
  
  createShareButton(shareData, options = {}) {
    const button = document.createElement('button');
    button.innerHTML = options.icon || '📤 Share';
    button.className = options.className || 'pwa-share-btn';
    button.style.cssText = options.style || `
      padding: 8px 16px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    `;
    
    button.addEventListener('click', () => {
      this.shareContent(shareData);
    });
    
    return button;
  }
}

export { PWAShare };
