# .env and .env.example

Keep `.env.example` at the project root. It is the template that tools and new contributors expect.

How to use it:
- Copy `.env.example` to `.env` in the project root.
- Fill in real values only in `.env`.
- Do not commit `.env` (it is gitignored).

Why it stays at the root:
- Most tooling and onboarding docs assume `.env.example` is next to `.env`.
- A root-level template makes setup faster and avoids broken paths.

If you add new environment variables:
- Add the key with a safe placeholder to `.env.example`.
- Document the variable in the relevant feature doc (if it exists).
