### Project Specification – Vie

---

#### 1. Application Objective

**Vie** is a visual modular interface designed to manipulate, chain, mix, and sequence audio or MIDI sources using components called “nodes.” It allows for fluid and elegant construction of real-time signal chains, entirely driven by a hybrid syntax (`.sqh`, Ruby-like), with JavaScript used as a fallback when necessary—**without raw HTML or CSS**.

> ⚠️ Important Note: Although `.sqh` supports hybrid syntax, for the development of the Vie application, **Ruby is strongly preferred** for interface construction, logic, and structure. JavaScript should only be used where Ruby cannot achieve the required performance or compatibility.

---

#### 2. Interface Structure

**2.1. Title Bar**

* Visible top buttons:

  * **Project title** (customizable)
  * **Load**, **Clear**, **Save**

**2.2. Main Display: Lines + Nodes**

* Each **line** represents a sequence of horizontally connected modules.
* Each **node** contains:

  * A label (e.g., `Auto trig`)
  * An **Add** button (adds a node to the right within the same line)
  * One or more sliders
  * Source selection: `Audio`, `MIDI`, or both
* Each **line** also has a **+** button on the far right to add a **new line**.
* The **+** button on each node must always remain visible, even during horizontal overflow (scroll).

**2.3. Contextual Inspector**

* Dynamic zone displaying the selected node’s properties.
* Includes editable sliders and options (mirroring node internals).
* Real-time editable.

**2.4. Footer (Global Action Bar)**

* Clearly displayed actions as icons or buttons:

  * **Perform** (toggle performance mode)
  * **Select**, **Ungroup**, **Group**, **Paste**, **Copy**, **Redo**, **Undo**, **Clear**, **Delete**, **Link**

**2.5. Perform Mode**

* Simplified view with interactions disabled.
* Optimized for real-time execution and display.

**2.6. View Mode Toolbar (below node area)**
Displayed horizontally between the node area and the inspector:

* **Diagram**: Free graph layout view
* **Matrix**: 8x8 grid-style node display
* **Liner**: Current linear layout (horizontal node sequences)
* **Mix**: Real-time source mixing mode
* **Sequence**: Audio sequencer mode with timeline

---

#### 3. Core Features

* Node-based interface using `.sqh` or highly optimized native JS
* Multi-format loading support (WAV, AIFF, MIDI, JSON)
* Dynamic addition of nodes and lines with smooth UI
* 5 interchangeable display modes
* Scroll management with persistent key elements
* Locked performance mode for live use
* Real-time contextual inspector

---

#### 4. Technical Constraints

* No HTML/CSS: rendered via Canvas/WebGL or programmatic DOM
* Ruby-like `.sqh` syntax has priority, with pure JavaScript as fallback
* Highly readable, modular, and factorized code
* Optimized rendering performance (no heavy DOM)
* Minimalist, elegant UI – clear even with many nodes
* **Optional use of specialized JS frameworks** (e.g., `wavesurfer.js`) for waveform, timeline, or complex visualizations. This is **allowed and likely recommended** depending on use case, but may be challenged in favor of a more native alternative if more performant.

---

#### 5. Technical To-Do (Extended)

* Split code across multiple files for better modularity
