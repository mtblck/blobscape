# Blobscape lessons 5–8: briefs

Written with the interactive-lesson-design skill before any code. Each lesson uses the exhibit
layout (`src/blobscape/Shell.tsx`); goals tick on the model's state, never on a click alone.

### Lesson 5: Color by angle
Target sentence: A blob can store a different color for each direction it's seen from, and a few more numbers per blob buy sharper shine.
Replaces the belief that: a splat's color is painted on, so shine and reflections can't move.
Needs first: lesson 1 (the 14 numbers of a blob).
Model: two views of the same shiny ball of blobs, side by side: "The real shine" (worked out exactly for every view) and "Stored" (each blob's color kept as spherical harmonics of the chosen degree). Main control: Degree 0–3. Supporting: Shine (how sharp the highlight is). Readout: numbers per blob for that degree, and how bright the stored highlight is next to the real one.
Start state: degree 2, a medium highlight, seen at an angle.
Goals:
1. Walk round the ball and watch the shine follow you: ticks when the camera has turned 60° from the start; hint: drag either view; why: the bright spot isn't painted on, each blob changes color with where you look from.
2. Find the degree where the shine disappears: ticks at degree 0; hint: fewer numbers per blob; why: degree 0 is one color for every direction, so the shine averages away.
3. Sharpen the shine until degree 3 can't keep up: ticks at degree 3 when the stored highlight is under 70% as bright as the real one; hint: compare the two views' highlights; why: sharp glints need more than 48 numbers, so captures blur mirror-like shine.
Explanation: spherical harmonics as a color that varies smoothly over directions, like a tune built from a few pure notes; degree = how many notes. Formula: color(v) = Σ cₗₘ Yₗₘ(v).
Bridge: real captures store degree 3; the Fit a Picture blobs store degree 0.

### Lesson 6: Paint
Target sentence: You can make a splat by hand, and covering a surface is a trade between how many blobs you use and how big each one is.
Replaces the belief that: splats only come out of a scanner.
Needs first: lesson 4 (many blobs make a shape).
Model: an empty floor with a target square; drag to spray blobs onto the floor. Main control: Blob size. Supporting: Blobs per dab, Flat/round, Clear. Readout: blob count and how much of the square is covered.
Start state: a few dabs already sprayed, partly covering the square.
Goals:
1. Cover the square: ticks at 90% coverage; hint: drag across the square; why: overlap enough soft patches and a surface appears.
2. Cover it again with fewer than 150 blobs: ticks at 90% with under 150 blobs; hint: clear it, then change the blob size; why: big blobs cover more ground with fewer of them but blur any detail inside.
3. Paint with round balls, then look edge-on: ticks with round blobs painted and the camera under 10° high; hint: lower the camera; why: round blobs bulge up out of the floor; flat discs make a thin surface.
Bridge: the sandbox has the same spray, on any surface.

### Lesson 7: Splat files
Target sentence: Real splats are trained from photos and shipped in files that differ mostly in how hard they squeeze each blob's numbers.
Replaces the belief that: a splat file is like a 3D model, and every format is the same size.
Needs first: lesson 1.
Model: the toadstool, re-read from the file it would be saved as. Main control: Format (.ply, .splat, .spz). Supporting: Keep (share of blobs saved), Open your own file. Readout: file size, bytes per blob.
Start state: .ply, all blobs.
Goals:
1. Compare the three formats and find the smallest: ticks when .spz is chosen; why: .spz packs each number into a byte or two and then compresses the lot.
2. Get the file under 150 KB: ticks when the chosen file is under 150 KB; hint: keep fewer blobs; why: file size is blobs × bytes per blob.
3. Keep so few blobs that the cap goes patchy: ticks under 20% kept; why: drop blobs and the gaps show; training adds blobs exactly where detail needs them.
Bridge: Fit a Picture trains blobs from an image in your browser.

### Lesson 8: Break it
Target sentence: A splat has no surfaces, only overlapping blobs, so you can shrink, scatter and rebuild it without losing anything.
Replaces the belief that: there's a solid object in there.
Needs first: lessons 1 and 4.
Model: the toadstool. Main controls: Blob size (×0.02 to ×2) and Explode (0 to 1). Readout: blob count and how many pixels the blobs cover.
Start state: whole, size ×1.
Goals:
1. Shrink every blob to a dot: ticks under ×0.15; why: the surface turns to a cloud of points, because it was never a surface.
2. Blow it apart: ticks at Explode over 0.6; why: each blob flies on its own; nothing holds them together.
3. Put it back together exactly: ticks after 1 and 2 with Explode under 0.05 and size within 10% of ×1; why: nothing was lost; a splat is a list, not a surface.
Bridge: the sandbox, where every tool is on.
