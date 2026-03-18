---
description: Detect relevant skills from codebase analysis
---

# Skills Detection

Based on the codebase analysis, suggest relevant skills to add to the project.

## Detection Rules

Look for evidence of these output types in the codebase:

| Evidence found | Suggested skill |
|---|---|
| PDF generation (pdfkit, puppeteer, jsPDF, etc.) | pdf |
| Excel/spreadsheet output (xlsx, exceljs, etc.) | xlsx |
| Word document generation (docx, officegen, etc.) | docx |
| Presentation generation (pptx, etc.) | pptx |
| Email templating (mjml, handlebars emails, etc.) | email-template |
| Chart/graph generation (chart.js, d3, recharts, etc.) | data-viz |

## Output

If relevant skills are detected, update `.planning/skills/README.md`:

1. Add detected skills to the Registered Skills table
2. Note they are "suggested — add skill file to activate"
3. Print to developer:

```
🔍 Skills detected in your codebase:

  [skill name] — found [evidence] in [file/location]
  To activate: add a SKILL.md to .planning/skills/[skill-name]/
               or copy from ~/.flow/skills/ if available globally

```

If no skills detected: print "No specialised output patterns detected."
