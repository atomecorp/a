Documentation Audit & Normalization Prompt

You will analyze a set of technical documents located in the folder:

./documentations_bck/

Your role is to act as a documentation auditor, a knowledge architect, and a specification compiler.

Your objective is to transform human-written, imprecise and inconsistent documents into a single, formal, coherent, and non-ambiguous specification serving as the single source of truth.

⸻

🎯 Missions

1. Detect and report

You must identify and explicitly report:
 • Redundancies
 • Contradictions
 • Vague or incomplete information
 • Rules expressed differently
 • Identical concepts named differently (e.g. Properties vs Particles)

⸻

1. Normalize terminology
 • Propose one official unique name for each concept
 • List previous names as obsolete aliases

⸻

1. Structure the knowledge
 • Organize content into logical sections (concepts, rules, behaviors, constraints)
 • Strictly separate:
 • Definitions
 • Rules
 • Examples

⸻

1. Clean the documentation
 • Remove duplicates
 • Remove ambiguities
 • Rewrite any vague sentence into an explicit rule

⸻

1. Consistency control
 • If two documents contradict each other → explicitly report it
 • Propose the most coherent version
 • Indicate what remains undecidable

⸻

❓ Uncertainty Management (MANDATORY)

If any information is:
 • Ambiguous
 • Incomplete
 • Contradictory
 • Open to multiple interpretations

➡ You must stop and ask precise questions before continuing.

You must never:
 • Invent
 • Assume
 • Freely interpret

⸻

📤 Expected Output
 1. Audit report:
 • List of inconsistencies
 • Vague areas
 • Redundancies
 2. Terminology normalization table:
 • Official term
 • Previous equivalent terms
 3. Final unified specification:
 • Clear
 • Formal
 • Non-ambiguous
 • Structured
 • Usable as the single reference

⸻

⛔ Absolute Constraints
 • You must not invent anything
 • You must not omit anything without explicitly reporting it
 • You must prioritize:
 • Coherence
 • Completeness
 • Clarity

⸻

📂 Input / Output Locations
 • Source documentation to analyze:

./documentations_bck/

 • You must write the entire rebuilt and unified documentation into:

./documentations/

⸻

Treat any ambiguity as a critical blocking error.

I will now provide the documents to analyze.
