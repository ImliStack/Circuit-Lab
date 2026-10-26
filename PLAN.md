# Circuit Lab — R&D + Plan

Goal: a static web app that teaches beginner electronics (Indian Class 8–10
"Electricity" and "Magnetic Effects of Current") on an interactive 3D workbench.
Stack: Vite + vanilla JS + three.js, no backend, everything procedural.

## 1. Research

### PhET Circuit Construction Kit (CU Boulder)
| Finding | What we take |
|---|---|
| Design principles: usable without instructions, instant animated feedback, accurate dynamic representations, "interface that implicitly scaffolds inquiry" | Every control changes the bench at once; no modal "submit" before something visible happens |
| "Productive constraints: provide limited choice of controls" | Each lesson exposes 2–3 controls only (cells, resistor, mode), not a free parts bin |
| Students using only virtual circuits did as well building real ones (Finkelstein et al.) | Real-world looking parts and real values matter: colour bands, cells, meters with scales |
| CCK study: 47 % larger relative gain than demos; current-flow display helped but was not essential | Moving charge dots, but they are a toggle and the meters carry the numbers |

### Student misconceptions (physics-ed research)
| Misconception | Design answer |
|---|---|
| "Current is used up" by a bulb / resistor | Lesson 2 shows **two ammeter readings** (before and after the bulbs) that stay equal; dots move at the same speed all round a series loop |
| Battery is a constant-*current* source | Lesson 1/2 keep the cells fixed and show current changing when the load changes |
| Simulation simplifications mislead | A one-line "Model note" on the dots: they show conventional current (+ → −); real electrons drift the other way, slowly |

### Tinkercad Circuits / Wokwi
| Finding | What we take |
|---|---|
| Tinkercad: split view, code next to the circuit; auto-generated schematic view | Lesson panel has a **Circuit / Code** tab: an SVG schematic generated from the same netlist the solver uses, and the Arduino sketch for board lessons |
| Tinkercad praised for beginners; Wokwi powerful but "not for beginners" | Guided lessons first; the free sandbox is a later milestone |
| Tinkercad can hide misaligned breadboard connections | Parts snap to real breadboard holes on a 2.54 mm pitch; every wire end is visible |

### Brilliant (learn by doing)
| Finding | What we take |
|---|---|
| Learners try before being told; instant, tailored feedback | Each lesson has a **Predict** step ("what will the ammeter read?") before Run, then compares the guess with the reading |
| Step-by-step, visual | Steps list with one idea per step; each step highlights the parts it talks about on the bench |

### NCERT Class 10, Ch. 11, Activity 11.1 (Ohm's law)
Wire XY + ammeter + voltmeter + 1, 2, 3, 4 cells of 1.5 V; tabulate V, I, V/I; plot V vs I,
a straight line through the origin. Lesson 1 follows this exactly (with a colour-banded
resistor in place of the nichrome wire), including the readings table and the live V–I graph.

### Mobile 3D layout
A full-height canvas traps scrolling (a drag meant to scroll rotates the model). So on
phones: bench pinned on top (~46 vh), lesson below as its own scroll area, never under
the canvas. Canvas gets `touch-action: none`; the panel scrolls normally.

### House style (from Body Atlas 3D + Science Tower)
- Cream paper palette, Newsreader serif headings + Inter UI, olive accent, soft shadows
- One timing file (`motion.js`) with `damp()` and reduced-motion support
- Segmented controls, filled range sliders, chips, eyebrow labels
- Panel text arrives in a short stagger after the camera move starts

## 2. Product

### Layout (desktop)
```
┌────────────┬──────────────────────────────────┬──────────────────┐
│ Lessons    │                                  │ Lesson 1 · Ohm   │
│ 1 ● Ohm    │        3D workbench (canvas)     │ serif title      │
│ 2 ○ Series │  hover labels · click = card     │ steps 1/5  ‹ ›   │
│ 3 ○ LED    │                                  │ [Circuit | Code] │
│ 4 🔒 ...   │  ┌ readings HUD ┐  ┌ part card ┐ │ controls         │
│ progress   │  └──────────────┘  └───────────┘ │ ▶ Run   readings │
└────────────┴──────────────────────────────────┴──────────────────┘
```
Mobile: lesson list becomes a horizontal chip row; bench on top; lesson panel below.

### Interaction rules
- Click a part → camera eases toward it, card opens (what it does, symbol, live value,
  colour-band decode for resistors). Esc / ✕ closes.
- Hover → part name label; cursor pointer.
- Steps highlight parts with a pulsing ring on the bench.
- Run → circuit closes (switch lever flips), solver runs, meters' needles ease to value,
  dots flow, glow fades in. Run again = Stop.
- Lesson complete → tick in sidebar, saved in `localStorage` (try/catch).

### Simulation
Modified nodal analysis (MNA) over a netlist: resistors, ideal cells, ammeters
(0 V sources that report their current), switches, bulbs (resistive filament),
LEDs (piecewise: off below Vf, Vf + 10 Ω dynamic resistance above, iterated to a
consistent state). Voltmeters read node differences. Same netlist drives the
schematic SVG. LED: ≥ 40 mA burns out (smoke, dark die, warning); 20 mA = full
brightness. Bulb glow ∝ P / P_rated.

## 3. Lessons
1. Ohm's law — cells 1–4, resistor 10/22/47/100 Ω, readings table + V–I graph ✅ M1
2. Series vs parallel — two 6 V 3 W bulbs, two ammeters, unscrew a bulb ✅ M1
3. LED + resistor — board 5 V pin, resistor picker, burn-out, sketch tab ✅ M1
4. A switch (push button) · 5. Measuring current · 6. Brightness vs resistance (pot)
7. Light sensor (LDR) · 8. Buzzer tones (Web Audio) · 9. Electromagnet · 10. Traffic light

## 4. Milestones
1. Scaffold, bench, parts library, solver, UI shell, lessons 1–3 ← **now, then stop for review**
2. Lessons 4–7
3. Lessons 8–10 (Web Audio buzzer, electromagnet with compass + field lines, traffic light sketch runner)
4. Sandbox mode, dark theme, shareable URLs

## Sources
- PhET design principles — https://aapt.org/Conferences/newfaculty/upload/Dubson_PhET_NewFaculty_June13.pdf
- PhET research — https://phet.colorado.edu/ja/research
- Misconceptions & simulation study — https://aca1.issuelab.org/resource/assessing-the-effectiveness-of-a-computer-simulation-in-conjunction-with-tutorials-in-introductory-physics-in-undergraduate-physics-recitations.html
- Simulation simplifications — https://scientiaplena.org.br/sp/article/download/3350/1624/14230
- Tinkercad vs Wokwi — https://zbotic.in/best-arduino-simulator-tools-tinkercad-vs-wokwi-vs-proteus/ , https://forum.arduino.cc/t/virtual-online-arduino-and-esp32-simulator-wokwi-arduino-simulator-features/698481/3
- Brilliant — https://brilliant.org/
- NCERT Ch. 11 — https://sathee.iitk.ac.in/ncert-books/ncert-books-theory/class-10/nbt-science-10/sci-10-chapter-11-electricity
- Canvas scroll trap on mobile — https://docs.dopple.io/development/best-practices/

## 5. Visual direction v2 — after studying learn-arduino-red.vercel.app (2026-10-22)

| Layer | Finding (from screenshots + its built bundle) | What we do |
|---|---|---|
| Stack | Vite, vanilla three.js r186, no .glb files — every part procedural, split into `stage` / `kit` / `thumbs` chunks | Same: procedural parts, a `thumbs` module renders carousel images offscreen |
| Camera | `OrthographicCamera` at an isometric angle; pan (drag/WASD), rotate (Q/E), zoom | Orthographic iso camera; toolbar: rotate ±45°, zoom −/+, reset |
| Ink lines | Screen-space edge pass: normals + depth rendered to a target, a shader finds silhouettes, depth steps and normal creases, draws dark lines | Our own edge pass, drawn as a blended overlay on top of the normal render |
| Shading | Flat, soft cel look (toon/Lambert + hemisphere + one shadow light), soft cast shadows on the cream floor (`ShadowMaterial`) | `MeshToonMaterial` with a 3-step gradient, shadow-catcher floor, cream drafting board as the bench |
| Palette | bg `#f6eddd`, ink `#4f535b`, navy `#18213d`, teal `#1aa3a1`, orange `#c0652d`, line `#cec0ad`, PCB navy `#4a5d99` | Adopted (teal = live/selected, orange = code functions) |
| Type | Barlow Semi Condensed (uppercase, tracked headings), Barlow (body), JetBrains Mono (code, numbers) | Same families |
| Callouts | Cards around the model, each tied to a part by a dashed leader and a teal anchor dot; clicking a part collapses them into pill tags and opens an inspector card with "Zoom to it"; dashed teal ring around the picked part | Same pattern, per-lesson callouts, leaders re-projected every frame |
| Chrome | Left icon rail, wordmark top-left, progress card top-right, right panel with tabs (Overview / Pinout / Example / Specs) and a "Try it yourself" code box with ▶ run, serial monitor, lesson carousel with 3D thumbnails along the bottom | Rail + wordmark + progress; tabs Overview / Circuit / Code; controls + ▶ run; lesson carousel with thumbnails |
| Motion | Keyframes `halo`, `pulse`, `nudge`, `celebrate`, `insp-in`, `line-flash`, `row-pulse`, `param-flash`; parts animate while running (motor fan spins) | Callouts stagger in, inspector slides in, code line flashes on run, value flash on change, celebrate on completion, live parts animate (needles, glow, charge flow, plug) |
| Background | Cream with faint circuit traces, pads and pixel squares drawn behind the canvas | Own trace pattern drawn in SVG behind a transparent canvas |
