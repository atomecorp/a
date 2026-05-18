# Prompt — Code Editor Integration, API Testing, and MCP Validation

## Objective

Implement the next integration phase inside Atome/eVe:

* connect the existing code editor to the global tools/API layer;
* generate a professional API testing suite, especially for video APIs;
* validate the entire stack through MCP.

## Mandatory prerequisite:
Before any implementation, fully read and strictly apply:

./.codex/AGENTS.md

This document only defines the implementation objectives for this task.

## Tasks

### 1. Identify the existing code editor

* Search the project for an existing integrated or partially integrated code editor.
* Identify its location, architecture, dependencies, and entry points.
* Verify whether it uses CodeMirror, Monaco, an in-house component, or another solution.
* Do not recreate a new editor if a functional base already exists.

### 2. Integrate the editor into the Atome tools layer

* Add the code editor as an official Atome/eVe tool.
* Connect this tool to the existing API layer.
* Clearly define:

  * tool name;
  * inputs;
  * outputs;
  * permissions;
  * capabilities;
  * limitations;
  * possible errors.
* The editor must be callable from:

  * the UI layer;
  * the runtime;
  * MCP when required.

### 3. Formalize the editor API

Create or complete a clean API supporting at minimum:

* open file;
* create file;
* edit file;
* save file;
* close file;
* read current content;
* replace selection;
* apply structured modifications;
* format content;
* report syntax errors;
* expose editor runtime state.

The API must be:

* typed;
* documented;
* MCP-compatible.

### 4. Generate an API test suite

Create a testing suite covering critical APIs, especially:

* video APIs;
* audio APIs when linked to video workflows;
* audio/video sampler APIs;
* playback APIs;
* recording APIs;
* rendering APIs;
* timeline APIs;
* file APIs;
* code editor APIs;
* tools APIs;
* MCP APIs.

Tests must validate:

* normal use cases;
* edge cases;
* expected failures;
* permissions;
* invalid calls;
* stability across repeated calls;
* consistency between APIs, tools, and MCP.

### 5. Test video APIs

Create dedicated tests validating at minimum:

* video file loading;
* playback;
* pause;
* stop;
* seek;
* looping;
* playback speed changes;
* frame extraction;
* rendering into target surfaces;
* invalid format handling;
* missing file handling;
* audio/video synchronization when applicable;
* interaction with sampler APIs if video is treated as temporal media.

### 6. Validate through MCP

For every MCP-exposed tool:

* verify the MCP schema exists;
* verify parameters are correctly typed;
* verify errors are structured;
* verify MCP calls reach the real Atome/eVe APIs;
* verify there are no fragile DOM hacks or temporary bypasses;
* verify MCP responses remain consistent with direct API responses.

### 7. Add integration tracking documentation

Create or update a documentation file, for example:

```text
./todos/API_TOOLS_MCP_TESTS.md
```

This file must contain:

* detected APIs list;
* existing tools list;
* missing tools list;
* current test coverage;
* newly added tests;
* missing tests;
* MCP-exposed endpoints/functions;
* detected architecture issues;
* recommended corrections.

## Execution Constraints

* Do not reinvent existing functionality.
* Do not add unnecessary abstraction layers.
* Do not use DOM hacks when a proper API exists or should exist.
* Do not create fake tests that validate nothing.
* Do not hide errors.
* Do not create silent fallbacks.
* Every API must be properly connected to a tool, then optionally exposed through MCP.
* Tools must remain separated from the UI layer.
* The UI must consume tools/APIs but must not contain business logic.
* Tests must be reproducible.
* Tests must support automated execution.
* Temporary logs are allowed only for diagnosing precise issues.
* Once an issue is resolved, all temporary logs, traces, probes, verbose outputs, and debugging remnants must be completely removed.
* After every feature addition or bug fix:

  * clean the codebase;
  * remove redundancies;
  * factorize when needed;
  * optimize without changing expected behavior.
* During implementation, strictly apply the rules defined in:


```

## Expected Result

At the end of the task, the project must provide:

1. a properly integrated code editor connected to the Atome/eVe tools system;
2. a clean, typed, and documented editor API;
3. a structured first API testing suite;
4. dedicated video API tests;
5. MCP validation for exposed tools/APIs;
6. a `./todos/API_TOOLS_MCP_TESTS.md` file documenting the real integration state;
7. a cleaned codebase without temporary logs or debugging leftovers.
