# Delegating a task to DeepSeek

The `scripts/deepseek_delegation_from_GPT.sh` script lets ChatGPT/Codex
delegate an analysis or implementation task to an isolated DeepSeek worker,
while ChatGPT/Codex remains the main orchestrator.

The worker operates in the current project and follows the repository rules.
It may modify files when the task requests implementation, but it must not
commit, push, reset, change branches, rebase, or modify Git history. After the
worker returns, ChatGPT/Codex takes control again to inspect the changes and
run the relevant validations.

## Preparing delegation

From the project root:

```bash
chmod +x scripts/deepseek_delegation_from_GPT.sh
./scripts/deepseek_delegation_from_GPT.sh setup
```

The script expects the DeepSeek key in `private/DeepSeek_key`, on one line. It
can also be supplied temporarily through `DEEPSEEK_API_KEY`. The key is never
printed by the script.

Check the installation afterwards:

```bash
./scripts/deepseek_delegation_from_GPT.sh doctor
```

`setup` also prepares the isolated worker and installs the delegation rules in
`.codex/AGENTS.md`. This step can therefore modify the project's rule file;
it does not modify Git history.

## Selecting the model and intelligence level

The recommended preset for a difficult task is:

```bash
./scripts/deepseek_delegation_from_GPT.sh run \
  --preset maximum \
  "Complete task, approved plan, constraints, and file scope."
```

`--preset maximum` is equivalent to `--model pro --level max`. The other
presets are `fast`, `normal`, and `strong`. Explicit options are also
available:

```bash
./scripts/deepseek_delegation_from_GPT.sh run \
  --model pro \
  --level max \
  "Complete task..."
```

The `medium` level is accepted but normalized to `high`. `maximum`, `max`, and
`ultra` are normalized to `max`.

Before a real execution, parameters can be checked without calling DeepSeek:

```bash
./scripts/deepseek_delegation_from_GPT.sh run \
  --preset maximum \
  --dry-run \
  "Inspect the problem without modifying files."
```

## Example request to ChatGPT/Codex

To request a complete delegation, use wording such as:

> Débogue le visuel de …
>
> Puis **délègue l’exécution à DeepSeek Pro en maximum**.
> DeepSeek doit appliquer le plan sans toucher à Git.
> Ensuite reprends la main, vérifie les modifications et lance les tests utiles.
> Résume-moi ce que DeepSeek a changé.

ChatGPT/Codex must turn this request into a self-contained worker instruction
containing the problem, the approved plan, constraints, file scope, and
expected validations. The equivalent command is:

```bash
printf '%s\n' 'Débogue le visuel de …

Applique le plan validé dans le périmètre indiqué. Ne commite pas, ne pousse
pas et ne modifie pas Git. À la fin, résume les fichiers modifiés, les tests
exécutés et les problèmes restants.' \
  | ./scripts/deepseek_delegation_from_GPT.sh run --preset maximum
```

## Taking control back and validating

Delegation is not final validation. After DeepSeek returns, ChatGPT/Codex
must:

1. inspect the modified files and diff;
2. verify that no forbidden Git operation was performed;
3. check that the change follows the canonical architecture;
4. run the directly relevant tests or checks;
5. report executed validations separately from validations that remain to be
   run.

To display the active settings:

```bash
./scripts/deepseek_delegation_from_GPT.sh status
./scripts/deepseek_delegation_from_GPT.sh config --show
```
