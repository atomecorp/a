<script>
  // Props depuis Squirrel
  export let squirrel;
  
  // État local
  let settings = {
    debugMode: false,
    autoLoad: true,
    theme: 'auto',
    logLevel: 'info'
  };
  
  let isReady = false;
  
  // Réactivité Squirrel
  $: if (squirrel) {
    isReady = squirrel.isReady();
  }
  
  // Gestion des paramètres
  function updateSetting(key, value) {
    settings[key] = value;
    console.log(`Setting updated: ${key} = ${value}`);
    
    // Synchroniser avec Squirrel si possible
    if (squirrel && squirrel.getModule('core')) {
      // Exemple d'intégration avec votre système
      console.log('Sync with Squirrel core:', { [key]: value });
    }
  }
  
  function resetSettings() {
    settings = {
      debugMode: false,
      autoLoad: true,
      theme: 'auto',
      logLevel: 'info'
    };
    console.log('Settings reset to defaults');
  }
  
  function exportSettings() {
    const data = JSON.stringify(settings, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'squirrel-settings.json';
    a.click();
    
    URL.revokeObjectURL(url);
  }
</script>

<div class="settings-panel">
  <header>
    <h2>⚙️ Paramètres Squirrel</h2>
    <div class="status">
      <span class:ready={isReady} class:loading={!isReady}>
        {isReady ? '🟢' : '🟡'}
      </span>
    </div>
  </header>
  
  <div class="settings-content">
    <!-- Section Debug -->
    <section class="setting-section">
      <h3>🔧 Développement</h3>
      
      <div class="setting-item">
        <label for="debug-mode">Mode Debug</label>
        <input 
          type="checkbox" 
          id="debug-mode"
          bind:checked={settings.debugMode}
          on:change={() => updateSetting('debugMode', settings.debugMode)}
        />
      </div>
      
      <div class="setting-item">
        <label for="log-level">Niveau de log</label>
        <select 
          id="log-level"
          bind:value={settings.logLevel}
          on:change={() => updateSetting('logLevel', settings.logLevel)}
        >
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warning</option>
          <option value="error">Error</option>
        </select>
      </div>
    </section>
    
    <!-- Section Interface -->
    <section class="setting-section">
      <h3>🎨 Interface</h3>
      
      <div class="setting-item">
        <label for="theme">Thème</label>
        <select 
          id="theme"
          bind:value={settings.theme}
          on:change={() => updateSetting('theme', settings.theme)}
        >
          <option value="auto">Automatique</option>
          <option value="light">Clair</option>
          <option value="dark">Sombre</option>
        </select>
      </div>
      
      <div class="setting-item">
        <label for="auto-load">Chargement automatique</label>
        <input 
          type="checkbox" 
          id="auto-load"
          bind:checked={settings.autoLoad}
          on:change={() => updateSetting('autoLoad', settings.autoLoad)}
        />
      </div>
    </section>
    
    <!-- Section Actions -->
    <section class="setting-section">
      <h3>🎯 Actions</h3>
      
      <div class="actions-grid">
        <button class="action-btn primary" on:click={exportSettings}>
          💾 Exporter
        </button>
        
        <button class="action-btn secondary" on:click={resetSettings}>
          🔄 Réinitialiser
        </button>
        
        <button class="action-btn" on:click={() => console.log('Current settings:', settings)}>
          🔍 Afficher dans console
        </button>
      </div>
    </section>
    
    <!-- Section Info -->
    <section class="setting-section">
      <h3>ℹ️ Informations</h3>
      
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">Framework:</span>
          <span class="info-value">Squirrel + Svelte</span>
        </div>
        
        <div class="info-item">
          <span class="info-label">Version:</span>
          <span class="info-value">{squirrel?.getVersion() || 'N/A'}</span>
        </div>
        
        <div class="info-item">
          <span class="info-label">Modules:</span>
          <span class="info-value">{squirrel?.listModules().length || 0}</span>
        </div>
        
        <div class="info-item">
          <span class="info-label">État:</span>
          <span class="info-value" class:ready={isReady} class:loading={!isReady}>
            {isReady ? 'Prêt' : 'Chargement'}
          </span>
        </div>
      </div>
    </section>
  </div>
</div>

<style>
  .settings-panel {
    font-family: 'Arial', sans-serif;
    max-width: 600px;
    margin: 0 auto;
    padding: 25px;
    background: linear-gradient(135deg, #74b9ff 0%, #0984e3 100%);
    color: white;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }
  
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 25px;
    padding-bottom: 15px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  }
  
  h2 {
    margin: 0;
    font-size: 1.5rem;
  }
  
  .status span {
    font-size: 1.2rem;
  }
  
  .setting-section {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 20px;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  
  .setting-section h3 {
    margin: 0 0 15px 0;
    font-size: 1.1rem;
    color: rgba(255, 255, 255, 0.9);
  }
  
  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    padding: 10px 0;
  }
  
  .setting-item:last-child {
    margin-bottom: 0;
  }
  
  label {
    font-weight: 500;
    flex: 1;
  }
  
  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: #00b894;
  }
  
  select {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    min-width: 120px;
  }
  
  select option {
    background: #0984e3;
    color: white;
  }
  
  .actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
  }
  
  .action-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: white;
    padding: 10px 15px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 500;
    font-size: 0.9rem;
  }
  
  .action-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }
  
  .action-btn.primary {
    background: rgba(0, 184, 148, 0.3);
    border-color: rgba(0, 184, 148, 0.6);
  }
  
  .action-btn.primary:hover {
    background: rgba(0, 184, 148, 0.4);
  }
  
  .action-btn.secondary {
    background: rgba(253, 121, 168, 0.3);
    border-color: rgba(253, 121, 168, 0.6);
  }
  
  .action-btn.secondary:hover {
    background: rgba(253, 121, 168, 0.4);
  }
  
  .info-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
  }
  
  .info-item {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .info-item:last-child {
    border-bottom: none;
  }
  
  .info-label {
    opacity: 0.8;
  }
  
  .info-value {
    font-weight: 500;
  }
  
  .info-value.ready {
    color: #00b894;
  }
  
  .info-value.loading {
    color: #fdcb6e;
  }
</style>