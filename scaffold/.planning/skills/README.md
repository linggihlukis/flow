# Skills Registry

> Agents check this file before generating any specialised output.
> Resolution order: project skills (.planning/skills/) → global skills (~/.flow/skills/)

## How to Add a Skill

1. Create a folder: `.planning/skills/[skill-name]/`
2. Add a `SKILL.md` file with instructions for the agent
3. Register it in the table below

## Registered Skills

| Task Type | Trigger Keywords | Skill Location |
|---|---|---|
| *No skills registered yet* | — | — |

## Examples (add when needed)

| Task Type | Trigger Keywords | Skill Location |
|---|---|---|
| Generate Word document | docx, word document, .docx | `.planning/skills/docx/SKILL.md` |
| Generate PDF | pdf, .pdf | `.planning/skills/pdf/SKILL.md` |
| Generate Presentation | pptx, slides, presentation | `.planning/skills/pptx/SKILL.md` |
| Generate Spreadsheet | xlsx, spreadsheet, excel | `.planning/skills/xlsx/SKILL.md` |

## Global Skills

Global skills live in `~/.flow/skills/` and are available to all projects.
Add a global skill by dropping a folder into that directory and registering
it in `~/.flow/skills/README.md`.

Project skills always take priority over global skills.
