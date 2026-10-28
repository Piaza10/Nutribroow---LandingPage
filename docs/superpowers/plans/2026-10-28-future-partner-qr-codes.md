# Future Partner QR Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce two print-ready, neutral A4 NutriBroow posters containing unique QR codes reserved for future academy partners.

**Architecture:** Generate deterministic SVG QR assets from the two permanent booking URLs, then compose each QR into a standalone SVG poster using the existing transparent NutriBroow logo. Preserve the posters as print artifacts rather than adding website behavior; the URLs already support future partner-code association.

**Tech Stack:** SVG, Node.js QR-code generator, existing PNG logo asset, PowerShell validation.

**Spec:** `docs/superpowers/specs/2026-10-28-future-partner-qr-codes-design.md`

## Global Constraints

- Create exactly two unique URLs: `https://nutribroow.com/?unidade=parceiro-01` and `https://nutribroow.com/?unidade=parceiro-02`.
- Do not create active academy records, discounts, repasses, database changes, or changes to the booking flow.
- QR codes must be deterministic SVG/vector assets, with a quiet margin suitable for printing.
- Deliver two A4 SVG posters with the existing `frontend/src/assets/nutri-broow-logo-transparent.png`, a neutral NutriBroow message, and a writable academy-name field.

## Review Focus

- QR asset 01 decodes to the exact `parceiro-01` URL; validate this in Task 1.
- QR asset 02 decodes to the exact `parceiro-02` URL; validate this in Task 1.
- The two resulting URLs differ; validate their SVG payloads in Task 1.
- Poster composition does not clip the QR code or writable academy field at A4 boundaries; render and inspect in Task 2.
- Both poster files retain the expected title and selected QR asset reference; assert static SVG content in Task 2.

---

### Task 1: Generate reserved vector QR assets

**Files:**
- Create: `print/qr/parceiro-01.svg`
- Create: `print/qr/parceiro-02.svg`
- Test: generated asset content and decoder output

**Interfaces:**
- Consumes: the two exact URLs from the design spec.
- Produces: two standalone SVG QR files used by Task 2.

- [ ] **Step 1: Generate `print/qr/parceiro-01.svg` with the payload `https://nutribroow.com/?unidade=parceiro-01`**

Use the QR-code generator in SVG mode with a four-module quiet zone and high error correction.

- [ ] **Step 2: Generate `print/qr/parceiro-02.svg` with the payload `https://nutribroow.com/?unidade=parceiro-02`**

Use the same mode and settings as QR 01.

- [ ] **Step 3: Verify the QR sources are distinct and include their exact reserved URLs**

Run: `Select-String -Path print/qr/parceiro-01.svg,print/qr/parceiro-02.svg -Pattern 'parceiro-01|parceiro-02'`

Expected: each asset contains only its own reserved URL in embedded metadata or payload representation; decoding verification confirms the URL matches exactly.

- [ ] **Step 4: Commit the QR asset files**

```bash
git add print/qr/parceiro-01.svg print/qr/parceiro-02.svg
git commit -m "docs: add reserved partner QR codes"
```

### Task 2: Compose and validate two A4 printable posters

**Files:**
- Create: `print/posters/parceiro-01-cartaz.svg`
- Create: `print/posters/parceiro-02-cartaz.svg`
- Uses: `frontend/src/assets/nutri-broow-logo-transparent.png`, `print/qr/parceiro-01.svg`, `print/qr/parceiro-02.svg`
- Test: SVG static-content assertions and rendered visual review

**Interfaces:**
- Consumes: the named QR SVG assets from Task 1.
- Produces: two A4 SVG posters ready to print.

- [ ] **Step 1: Create `parceiro-01-cartaz.svg` as an A4 portrait poster**

Include the existing logo, the copy “Fale com nosso nutricionista NutriBroow”, QR 01, an instruction to scan and schedule, and a clearly outlined blank “Academia parceira:” field.

- [ ] **Step 2: Create `parceiro-02-cartaz.svg` using the same layout and QR 02**

Keep copy, dimensions, colors, QR scale, and writable field consistent with poster 01; only its reserved QR identity changes.

- [ ] **Step 3: Verify poster content and render both SVGs for visual QA**

Run static assertions against both files for A4 dimensions, the heading, academy field, and correct QR reference; render to PNG and inspect the result for clipping, contrast, and QR quiet space.

- [ ] **Step 4: Commit the poster assets and final design/plan documentation**

```bash
git add print/posters docs/superpowers/specs/2026-10-28-future-partner-qr-codes-design.md docs/superpowers/plans/2026-10-28-future-partner-qr-codes.md
git commit -m "docs: add printable future partner posters"
```
