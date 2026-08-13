# .clinerules — Interpretable Context Methodology (ICM) Master System Rules

You are operating as an AI agent within an **Interpretable Context Methodology (ICM)** workspace[cite: 1]. ICM replaces complex multi-agent frameworks with filesystem hierarchy, plain-text interfaces, strict context scoping, and human review gates[cite: 1].

---

## 1. Core Principles

* **One Stage, One Job**: Every workflow stage is isolated in its own folder, completing a single task and writing outputs to its own `output/` directory[cite: 1].
* **Plain Text Interface**: Communication between pipeline stages occurs exclusively via Markdown and JSON files[cite: 1].
* **Strict Context Scoping**: Load ONLY the context explicitly required for the active stage[cite: 1]. Never read unnecessary files across the workspace to keep context windows small (2,000–8,000 tokens) and prevent reasoning degradation[cite: 1].
* **Outputs as Edit Surfaces**: Intermediate files in `output/` folders serve as review gates where humans can inspect or edit artifacts before downstream stages run[cite: 1].
* **Configure Factory, Not Product**: Persistent rules, templates, and style guides reside in Layer 3 reference folders ("the factory")[cite: 1]. Per-run input data resides in Layer 4 ("the product")[cite: 1].

---

## 2. The 5-Layer Context Hierarchy

Always navigate context according to this 5-layer hierarchy[cite: 1]:

```text
workspace/
├── .clinerules                     # Layer 0: Global agent instructions & persona
├── CONTEXT.md                     # Layer 1: Workspace task routing map
├── stages/
│   ├── 01_research/               # Numbered prefix dictates execution sequence
│   │   ├── CONTEXT.md             # Layer 2: Stage contract (Inputs, Process, Outputs)
│   │   ├── references/            # Layer 3: Stage-scoped reference files (Factory)
│   │   └── output/                # Layer 4: Working artifacts (Product)
│   ├── 02_script/
│   │   ├── CONTEXT.md
│   │   ├── references/
│   │   └── output/
│   └── 03_production/
│       ├── CONTEXT.md
│       ├── references/
│       └── output/
└── _config/                       # Layer 3: Workspace-wide static guidelines
    └── voice.md
```[cite: 1]

### Layer Summary

| Layer | Scope | File / Location | Purpose | Token Target |
|---|---|---|---|---|
| **Layer 0** | Workspace Identity | `.clinerules` / `CLAUDE.md` | Core persona, root layout, and operational rules[cite: 1]. | ~800 tokens[cite: 1] |
| **Layer 1** | Task Routing | `CONTEXT.md` | Maps user requests to relevant stage folders[cite: 1]. | ~300 tokens[cite: 1] |
| **Layer 2** | Stage Contract | `stages/<stage>/CONTEXT.md` | Explicit declaration of stage Inputs, Process, and Outputs[cite: 1]. | 200–500 tokens[cite: 1] |
| **Layer 3** | Reference Material | `_config/`, `references/` | Immutable style guides, voice rules, and templates[cite: 1]. | 500–2,000 tokens[cite: 1] |
| **Layer 4** | Working Artifacts | `output/`, input drafts | Variable content produced during pipeline execution[cite: 1]. | Varies per run[cite: 1] |

---

## 3. Cline Execution Protocol

When asked to run or execute any task inside an ICM workspace, follow these exact steps:

### Step 1: Read Workspace Routing
1. Read `.clinerules` (**Layer 0**) for baseline operational constraints[cite: 1].
2. Read `CONTEXT.md` (**Layer 1**) to map user goals to stage paths[cite: 1].

### Step 2: Parse Stage Contract
1. Open `stages/<stage_folder>/CONTEXT.md` (**Layer 2**) for the active stage[cite: 1].
2. Locate the `## Inputs` table in the stage contract[cite: 1].

### Step 3: Scope Context (Crucial)
1. Read **ONLY** the explicit Layer 3 (reference) and Layer 4 (working) file paths listed in the `Inputs` section[cite: 1].
2. **DO NOT** read contents from other stage folders or unreferenced workspace files[cite: 1].

### Step 4: Execute Process & Save Artifacts
1. Execute the instructions defined under the `## Process` section of Layer 2[cite: 1].
2. Write generated files directly into `stages/<stage_folder>/output/` (**Layer 4**)[cite: 1].

### Step 5: Stop for Human Review Gate
1. Inform the user that the stage execution is complete and list the output files created in `output/`[cite: 1].
2. **PAUSE execution**. Wait for human feedback or confirmation before proceeding to the next stage[cite: 1].

---

## 4. Stage Contract Standard Template

When creating or editing stage contracts (`stages/<stage>/CONTEXT.md`), strictly enforce this structure[cite: 1]:

```markdown
# Stage Name: [Stage Identifier]

## Inputs
- Layer 4 (working): ../<previous_stage_folder>/output/<filename>.md
- Layer 3 (reference): ../../_config/<style_guide>.md
- Layer 3 (reference): references/<local_rules>.md

## Process
1. Read input artifacts from the paths defined above.
2. Transform input data following constraints in Layer 3 references.
3. Formulate the final response according to structural requirements.

## Outputs
- <output_artifact_name>.md -> output/
```[cite: 1]

---

## 5. Workspace Builder Protocol

If asked to build a new ICM workspace from scratch, execute this 5-stage creation sequence[cite: 1]:

1. **Discovery**: Identify the user's domain, source materials, and final deliverable goals[cite: 1].
2. **Stage Mapping**: Break the workflow into sequential, single-responsibility stages with numbered prefixes (`01_...`, `02_...`)[cite: 1].
3. **Scaffolding**: Create the workspace directory structure, including nested `references/` and `output/` subdirectories for each stage[cite: 1].
4. **Contract Writing**: Create `CONTEXT.md` files for every stage containing strict `Inputs`, `Process`, and `Outputs` sections[cite: 1].
5. **Configuration**: Populate Layer 3 reference files (e.g., style guides, voice rules) inside `_config/` or local `references/` directories[cite: 1].