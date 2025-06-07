<script>
  // Props depuis Squirrel
  export let squirrel;
  
  // État local réactif
  let modules = [];
  let version = '';
  let isReady = false;
  
  // Mise à jour réactive des données Squirrel
  $: if (squirrel) {
    version = squirrel.getVersion();
    isReady = squirrel.isReady();
    modules = squirrel.listModules();
  }
  
  // Fonction pour recharger les modules
  function refreshModules() {
    if (squirrel) {
      modules = squirrel.listModules();
    }
  }
  
  // Fonction pour obtenir les détails d'un module
  function getModuleDetails(moduleName) {
    if (squirrel) {
      const module = squirrel.getModule(moduleName);
      return module ? 'Chargé' : 'Non disponible';
    }
    return 'N/A';
  }
</script>

<div class="squirrel-dashboard">
  <header>
    <h1>🐿️ Squirrel Dashboard</h1>
    <div class="status">
      <span class="version">v{version}</span>
      <span class="status-indicator" class:ready={isReady} class:loading={!isReady}>
        {isReady ? '✅ Prêt' : '⏳ Chargement...'}
      </span>
    </div>
  </header>
  
  <main>
    <section class="modules-section">
      <div class="section-header">
        <h2>📦 Modules chargés ({modules.length})</h2>
        <button on:click={refreshModules} class="refresh-btn">
          🔄 Actualiser
        </button>
      </div>
      
      {#if modules.length > 0}
        <div class="modules-grid">
          {#each modules as module}
            <div class="module-card">
              <div class="module-name">{module}</div>
              <div class="module-status">{getModuleDetails(module)}</div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-state">
          <p>Aucun module chargé</p>
        </div>
      {/if}
    </section>
    
    <section class="actions-section">
      <h3>🎯 Actions rapides</h3>
      <div class="actions-grid">
        <button class="action-btn" on:click={() => console.log('Squirrel state:', squirrel)}>
          🔍 Inspecter Squirrel
        </button>
        <button class="action-btn" on:click={() => window.location.search = '?debug=core'}>
          🔧 Mode Debug
        </button>
        <button class="action-btn" on:click={() => window.location.reload()}>
          🔄 Recharger
        </button>
      </div>
    </section>
  </main>
</div>

<style>
  .squirrel-dashboard {
    font-family: 'Arial', sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }
  
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  }
  
  h1 {
    margin: 0;
    font-size: 2rem;
    font-weight: bold;
  }
  
  .status {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 5px;
  }
  
  .version {
    font-size: 0.9rem;
    opacity: 0.8;
  }
  
  .status-indicator {
    padding: 5px 12px;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: bold;
  }
  
  .status-indicator.ready {
    background: rgba(34, 197, 94, 0.2);
    border: 1px solid rgba(34, 197, 94, 0.5);
  }
  
  .status-indicator.loading {
    background: rgba(251, 191, 36, 0.2);
    border: 1px solid rgba(251, 191, 36, 0.5);
  }
  
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
  }
  
  .refresh-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    padding: 8px 15px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .refresh-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }
  
  .modules-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 15px;
    margin-bottom: 30px;
  }
  
  .module-card {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    padding: 15px;
    transition: transform 0.2s;
  }
  
  .module-card:hover {
    transform: translateY(-2px);
  }
  
  .module-name {
    font-weight: bold;
    margin-bottom: 5px;
  }
  
  .module-status {
    font-size: 0.9rem;
    opacity: 0.8;
  }
  
  .empty-state {
    text-align: center;
    padding: 40px;
    opacity: 0.7;
  }
  
  .actions-section h3 {
    margin-bottom: 15px;
  }
  
  .actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
  }
  
  .action-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 500;
  }
  
  .action-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }
</style>