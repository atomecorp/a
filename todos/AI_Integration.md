# AI Integration: Unified Shell & System Access for Squirrel (Tauri & Node.js)

**Objective:**  
Design a unified JavaScript/TypeScript codebase for Squirrel that enables seamless integration of AI APIs (OpenAI, Ollama, etc.) and system/shell access, working both in Tauri (desktop) and Node.js/Fastify (server) environments, without duplicating business logic.

**Requirements:**
- All business logic, AI API calls, and orchestration must be written in JavaScript/TypeScript modules, shared between desktop and server.
- System access (shell commands, file system, etc.) must be abstracted via a JS interface (e.g. `runShellCommand(cmd, args)`), with environment-specific implementations:
  - **Tauri:** Use `@tauri-apps/api` for shell and file access.
  - **Node.js:** Use Node built-in modules (`child_process`, `fs`, etc.).
- The same JS codebase must work in both environments, automatically selecting the correct backend at runtime.
- AI API calls (OpenAI, Ollama, etc.) should use `fetch` or `axios` for universal compatibility.
- No business logic should be duplicated in Rust or Node—only the system bridge is environment-specific.

**Example Structure:**
```
src/shared/ai.js         # All AI logic and API calls
src/shared/system.js     # Abstracted system/shell access
src-tauri/bridge.js      # Tauri-specific implementation
server/bridge.js         # Node.js-specific implementation
```

**Example Abstraction (system.js):**
```js
export async function runShellCommand(cmd, args = []) {
  if (window.__TAURI__) {
    // Tauri
    const { Command } = await import('@tauri-apps/api/shell');
    const command = new Command(cmd, args);
    const output = await command.execute();
    return output.stdout;
  } else if (typeof process !== 'undefined' && process.versions?.node) {
    // Node.js
    const { execFile } = await import('child_process');
    return new Promise((resolve, reject) => {
      execFile(cmd, args, (err, stdout, stderr) => {
        if (err) reject(stderr);
        else resolve(stdout);
      });
    });
  } else {
    throw new Error('Shell access not supported in this environment');
  }
}
```

**Usage:**
- Import and use `runShellCommand` and AI logic in your JS code, regardless of environment.
- The correct system bridge will be used automatically (Tauri or Node.js).
- All AI and orchestration logic remains in a single, maintainable JS/TS codebase.

---

**This approach ensures maintainability, code reuse, and unified AI/system access for both desktop and server deployments.**
