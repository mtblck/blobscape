# Changelog

What changed on blobscape.dev, newest first. Releases follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Add entries under [Unreleased] as work lands; `npm run release -- x.y.z` moves them under a new version, and
merging that PR makes the tag and the GitHub release (see docs/releasing.md).

## [Unreleased]

- New experiment, One Scene, Four Ways: one pixel-art scene drawn at the same moment by a shader written with no engine, three.js meshes, Spark splats and Blobscape, all with the same pixel-art finish. Two scenes: a furred fox trotting through tall grass with a wisp of light circling it, and Pixel Diorama's campfire. One camera and one light slider drive all four, each picture shows how many frames a second it could draw, and cards below say what each is made of, what moves, what its light can do and where it stops.
- The sandbox's header spans the whole window like the page under it: the logo sits at the left edge and the menu at the right.
- Pixel Diorama has a new scene, Koi pond in the rain: a pond in a moss garden with two stone lanterns, a red maple, bamboo and irises. The water is a real one. Every raindrop leaves a ring where it lands, the koi push wakes as they circle, and the rings spread, cross, bounce off the stepping stones and the banks and die away; with WebGPU the water also mirrors the lanterns and the maple. Any scene written as data can have it: a description's new `water` floods a basin, takes the scene's own rain and is moved by the bones named in `bodies`. In the engine: `SceneWater` works one loop of a scene's water out, and `Stage` takes extra actors, `reshape` and `setMirror`.
- Pixel Diorama: every scene now starts with Dither at 50% (they started between 5% and 12%). The recorded loops in the gallery still show the old setting until they are recorded again.
- Brush and Ink: the marks on a turning thing stay where they are. The stripes on the windmill's sails used to jump as each sail came round, because the marks were laid far to near and every blob on a sail changed places at the same moment. Each pixel now shows the mark nearest to it, so the order they are drawn in no longer matters. The scanned mug keeps its softer, layered marks (`soft` on a mark look in the engine).
- Wading Pond and Forest Walk: the elf stands straight when she stops. She was squatting with her knees bent; her hips now ride as high as her legs allow on the ground under each foot.
- Sandbox keys: 1 to 5 open the modes, a letter picks each tool (A, S, P, E, F, T, V, L, M) and Escape puts the tool down to look around, while the sandbox has focus; the Keys button on the view lists them. Each mode's panel starts with a line saying what it is for, and the phone tray leaves the view half the screen.
- The sandbox's Select, Creatures, Effects and Scene modes are regrouped. Select puts picking first and the changes after it, with Delete on its own and "Use an effect on it"; on a phone, once something is picked, the short tray offers Recolor, Grow, Shrink, Fade and Delete. Creatures has a grid of creatures to add with how many fit, and a drag on one walks it even while blobs are selected. Effects are picture tiles, with Play and Make it permanent on the view. Scene folds into Start from, Open, Save, Tidy, Camera path and View (the last one used opens first), and the camera path is a filmstrip of its stops: tap one to go back to it, remove any of them, or add the view with the plus.
- Sand, Snow and Goo is rebuilt. Snow used to stand as a solid column and goo squashed flat without spreading; now snow breaks along cracks into clumps and packs down where it is pressed, and goo keeps its volume and flows. Pick one material (or All three, side by side) and a test: pour it from a spout onto the floor, a block, steps or into a bowl; drop a ball, cube or rock of any size and weight into a pile of it; or let a column go. Each material has its own two sliders (friction and dampness, stickiness and fluffiness, thickness and how well it holds a shape), there is a Light, Full and Fine detail choice, slow motion, and the page opens on what its first tab shows. In the engine: `Solid` (fixed shapes and rigid bodies the material pushes back on), `Mpm.set` for the materials' settings, and the simulation runs about twice as fast.
- Wading Pond: ripples show across the whole pond, not only by the candles. Crests gather light on the bed and troughs spread it, as real ripples do, and a Ripple strength slider sets how steep the water is drawn.
- The sandbox's Build mode shows only the settings the held tool uses (Erase, Fill and Stamp just the ring; Paint its brushes first), Stamp says whether it has something to copy, and on a phone the short tray shows one setting at a time, picked by name.
- The sandbox's footer is a button away: "More below" at the foot of the mode rail brings it up, and on a phone the Menu now lists Get in touch, the maker and Support Blobscape on every page.
- Wading Pond: heavier rain. A few drops is now 30 a second and a shower 300.
- Wading Pond: the elf's head no longer glows when she stands by the candles. The flames are now truly brighter than white and only light that bright glows, strong light rolls off toward white as on film instead of clipping, and the candles' light is a little lower. In the engine: `SplatWorld.glowGain`, and a `shoulder` on the lens (`rolledOff`).
- Wading Pond fixes: the stick and the keys now steer by the picture (push a way and the elf turns and wades that way, however the view is turned) instead of turning the elf on the spot; rain can be seen falling, and each drop leaves a ring where it lands; the ivy lies on the stone instead of hanging in the air over the candles; phones start lighter (fewer pixels, Light detail, no focus blur) and the mirror is drawn at a steady pace on slow devices.
- Day and Night's shadows hold steady. By day their edges used to flicker as the sun moved, and at night they popped in and out as fireflies blinked. Now the shadows of things that stand still stand still, an edge fades across the ground instead of jumping, and fireflies, flames and lit windows cast no shadow of their own. In the engine: the shadow grid keeps to a lattice fixed in the world, each blob starts its look toward the light from its own spot, and `Stage.setLightEase` eases the light on every blob over a few frames.
- Day and Night: picking a phase of the moon no longer seems to lose it. Each phase keeps its own hours (a half moon sets about midnight), so the view now turns to the moon when you pick one that is up, the Sky tab says when it rises and sets, and Look at the moon and Go to when it is up find it.
- Day and Night has a second scene: a few city blocks (View tab, Scene; `?scene=city`). Glass towers and brick buildings stand round two streets with a small park. As it gets dark the street lamps catch, a rooftop sign and a beacon come on, and the windows light up a group at a time; offices empty through the evening and a few rooms burn till morning.
- The sandbox is a workspace now. It fills the screen under the header, with five modes (Build, Select, Creatures, Effects, Scene) down the left, or along the bottom on a phone, and only the open mode's tools and settings beside the view; on a phone they sit in a tray under the view that drags up for more. Look is no longer a tool: Look around on the view (or right-drag with a mouse) turns it while any tool is held, and the mode stays in the address. The view has a full screen button, and the footer is a scroll below. Every view on the site also turns with two fingers now, as well as zooming.
- Wading Pond: the view is now finished through a lens. The candle flames and their reflections glow, and the camera stays focused on the elf while nearer and farther things blur, as wide as a real lens of that opening would draw them at their distance. Two switches and a Lens opening slider in the View tab; both start off where the browser has no WebGPU. In the engine: `SplatLens` (and `Stage.setLens`) draws any scene with glow and focus blur, from the picture's own light and a map of depth, with its arithmetic in `blurRadius`, `sharpRange` and `glowShare`.
- Wading Pond: the water now mirrors the scene. The ruin, the elf and each candle flame show in it upside down, more the lower you look across it, and the reflections wobble and break up as rings pass. It is a real mirror image, drawn again from where you look each time, so the elf walking in front of the candles hides their reflection. A switch in the Water & Light tab turns it off; it starts off where the browser has no WebGPU. In the engine: `SplatMirror` draws what a flat mirror shows of any scene, `seenIn` looks a point up in it, `Water` surfaces take it as `mirror`, and `SplatWorld.clip` hides blobs behind a plane.
- Day and Night, a new experiment: a cabin in a forest clearing with a slider for the hour. The sun and the moon cross the sky on their real paths for the season and latitude you pick, shadows turn and lengthen with them, the light warms toward sunset, the windows and a lantern come on as it gets dark, birds go to roost and fireflies and stars come out. Play the day to watch it run. Nothing is baked: the engine now has lights from a direction (a sun or moon, with shadows), a colored sky light, blobs that give their own light (`Actor.glow`), and `daylight`, which gives the sky and its lights for an hour of the day.
- **Wading Pond**, a new experiment: wade the elf through a shallow pond in a ruin at night. The water is a real one: each foot going in and each leg pushing through moves its own volume of water, and the rings spread, bounce off the banks, the steps and a broken column, and die away. Candles in a niche flicker, light the stone, cast shadows and mirror in the water, flame by flame. Rain, a tap on the water for one drop, three views, and it runs on WebGPU and WebGL 2. In the engine the water is `Water` (with `makeSurface`, `shapeSurface`, `shadeSurface`), and `SplatWorld.reshape` sends one actor's moved blobs up without packing the rest.
- Colliders in Scan Studio. A scan is only blobs, with nothing solid in it; the new Colliders tab lets you draw boxes, balls and cylinders over it (or take a first guess: the table and a box round what you kept), then slide and size each one by its handles in the view or by sliders, turn, copy and delete. Save them as a .glb any 3D tool opens, and Open in the sandbox takes them along, where a creature over a shape stands on it. In the engine they are `groundOf`, `pushOut`, `writeColliderGlb` and `readColliderGlb`.
- Refreshing a lesson, the sandbox or an experiment no longer shows a different page for a moment. They used to start as a plainer stand-in with a bigger heading and description, which jumped when the real page took over; now the first thing drawn is the page itself, with its view waiting to load.
- Brush and Ink draws outlines. Ink and wash and hatching now come with a pen line round the subject, where one thing stands in front of another, and between its parts, as a pen and wash drawing has: heavier against dark things, swelling and thinning along its length, with a hand's wobble (Look tab, Outlines and Pen width; any look can have them). Ink and wash itself is lighter, leaving paper in the light and keeping its pen strokes for the shade. Scan Studio's two pen looks get the outlines too, and the engine has them as `Stage.setOutline`.
- Cuts with a clean edge. Scan Studio's crops and its table cut now trim each kept blob where the cut passes through it, so the edge is a straight line and not a row of whole blobs (Level & Crop tab, Trim blobs at the cut; a saved file still keeps whole blobs). In the engine it is the `cleanCuts` option: every pixel of a blob is tested against the cut shapes, on WebGPU and WebGL. Cuts can also be upright cylinders now.

## [0.3.0] - 2026-11-18

- The sandbox's short notes ("Added…", "Opened…") now stay up for a moment after they are drawn. On a slow device a note set just before a big file was shown could be cleared before it ever appeared.

- Brush and Ink, a new experiment: the same blobs drawn as marks instead of soft dots. Gouache and oil lay each blob down as an opaque brush stroke with bristle streaks and a ragged end; ink and wash and hatching draw it as line on paper, more lines where the picture is darker. The marks belong to the blobs, so they turn with the view and nothing swims. Try it on the windmill, the garden crocodile, the fox or a scanned mug. Scan Studio's Lighting tab offers the same looks (Drawn as), and the engine has them as `Stage.setMarks`.

- A creature on any web page from one tag: `<blobscape-creature src="fox.glb" move="trot">` plays a rigged-splat .glb with one script and no build step. Drag turns it, its head can follow the pointer, a tap or a hover can play another move, it waits until it nears the screen, stops when it leaves and holds still for reduced motion. The engine page shows one live beside its code, and the package ships it (`@blobscape/engine/element`, and one file with three.js inside for a plain script tag).

- The elf's plait now hangs outside the cloak, beside the quiver, instead of cutting through them (Forest Walk, Splat Creatures, Dungeon Run and the engine page). The fox's brush in Forest Walk sways slowly as it trots instead of wagging on every step.

- Pixel Diorama draws cleaner pixels. Each pixel is now settled from four samples (Finish tab, Four samples a pixel): it takes whichever thing most of them show, so edges are one thing or the other and thin parts stop breaking up. Outlines take a darker tone of the thing they are round instead of one color for everything. And a scene can be painted in steps of its palette as it is cut, so shade falls in flat bands (the windmill is; Paint in steps of the palette).

- How it's made, under Pixel Diorama's view: five steps from plain clay shapes, to one blob in eight, the paint, the four samples behind each pixel under a magnifier, and the finished picture.

- Pixel Diorama opens a scene description (.json) from your computer as one more scene, and says where a broken one is broken.

- For people (and assistants) writing scenes: `npm run scene -- my-scene.json` checks a description, cuts it and says what to fix, and `--shots` draws it. Scenes are now also checked for parts that pass through each other as they play, like sails through a tower.
- The support button opens two ways to support: Buy me a coffee (Ko-fi) and Star on GitHub, in a plain card.

- A simpler header: Engine opens a list with its overview, the docs, the file spec and the package on npm and GitHub; the theme has its own button; and wide screens no longer have a Menu button. The support button is on every page, as a small circle where a page has controls. The engine page has a Read the docs button at the top.

- Tap to select in the sandbox: turn on "A click with Select takes the whole thing" in the Selection tab and a click on a mug, a leaf or a chair selects everything that belongs to it, the far side too. A small model (a slimmed Segment Anything, 14 MB, served by this site) looks at the view on your device.

- The sandbox works with an assistant in the browser: where the browser has WebMCP (Chrome is trying it out), the sandbox offers its actions as tools, so an assistant can look at the scene, build one from a scene description, add a creature, cut, recolor, paint with a brush, save and undo. Other browsers see no change.

- One photo to a scene in the sandbox: open a photo in the Scene tab (or drop one on the view) and it becomes a shallow scene, a blob for each pixel set as far back as a depth model guesses. The model runs in the page and is served by this site, so the photo stays on your device.

- The engine docs are in parts: Core (Stage, the world, the camera, bones) comes first, and the specialist pieces sit under Movement, Creatures, Shapes and scenes, Pixels and sprites, Simulation, Picking, detail and edits, and Files and models. The contents list opens a part when you ask or read into it.

- A camera path in the sandbox: save a few views as stops in the Scene tab, play a smooth glide through them, and save it as an MP4 made on your device.

- A view that fails to start WebGPU or WebGL the first time now tries again by itself, instead of saying the browser can't and working after a reload. The engine package's `Stage.start` does the same.

- Brushes in the sandbox: Paint lays grass, fur, moss, stones or leaves onto whatever is under the ring, each by its own rule. Grass bends, fur lies the way you drag, stones keep apart, leaves grow on sprigs.

- Two mending tools in the sandbox. Fill grows blobs into a hole from its edge, in the size, facing and colors of the blobs beside it. Stamp copies what is round one place to another: click what to copy, then drag where the copy should go.

- The engine's API reference is now its docs page (/engine/docs/; the old address goes there): a getting-started guide from the package's README, then a card for every export with its properties, methods and signatures, names in types linked to their entries, and a contents list that follows what you are reading. The reference is generated with TypeDoc from the package's own doc comments.

- The engine page, the API reference and the Build with the engine lessons now say how to install the package from npm.

- Open a rigged model in the sandbox or on Splat Creatures: a .glb of triangles on bones (from Blender, Mixamo or a game kit) becomes blobs laid over its surface on its own bones, and plays its own animations. The engine package has it as `readSkinnedGlb` and `splatModel`.

## [0.2.0] - 2026-11-17

- The engine is a package: `@blobscape/engine`, for three.js, goes to npm with this release (`npm install @blobscape/engine three`). Version 0.x: the API will change between minor versions.
- New page, the engine's API reference (/engine/api/): every name the @blobscape/engine package exports, with its declaration and what it does, and a box to find a name. The engine page's "Use the code" door now leads to it and the Build with the engine lessons.
- New lesson, Pixel art that holds still: the cottage drawn small in a few colors. Make it a small picture, cut it to four colors, and stop its pixels flickering with the lantern (steady pixels, and held poses for a swinging view); it ends with the code for your look.
- New lesson, A scene written as data: a cottage at dusk as a page of JSON you edit, with the engine's checker saying what is wrong and where. Make the tree sway, find the rule every move keeps so the scene loops, and light the lantern; it ends with the code that plays your description.
- New lesson part, Build with the engine, starting with Your first creature: a slug of two shapes on two bones, made with the engine. Make its tail bend, close the crease where it joins, and let it swing; the lesson ends with the code for the slug you made, to copy.
- New experiment, Sand, Snow and Goo: a box of blobs that flow, every one a particle in a small physics simulation. Sand runs into a heap, snow stands until it's hit, goo spreads; pour more in and tap to poke them.
- Forest Walk: the elf's cloak and plait swing after the body as cloth, trailing when it turns and settling when it stops.
- Loose parts swing on more creatures: on Splat Creatures the fox's and the dragon's tails, the elf's cloak and plait, and a monster's tail, ears or feelers swing after the body as a move plays (a switch on the Movement tab turns it off; files and sprite sheets keep the move as it is). Forest Walk's fox swings its tail, and Dungeon Run's hero its cloak.
- Rigged-splat files open in three.js: a loader hands the bones and clips to three's own animation player, and an adapter draws them with Spark.

## [0.1.0] - 2026-11-17

The first tagged release of blobscape.dev: lessons, a sandbox and experiments with Gaussian splats, and the Blobscape engine they run on. It marks the site as it stands. The `@blobscape/engine` npm package comes later (#102).

### Lessons (21)

Three parts, each lesson a question with goals to tick:

- **One object** (1 to 8): One blob, Footprint, Order matters, Many make a shape, Color by angle, Paint, Splat files, Break it.
- **Rigs and 3D models** (9 to 16): One bone, Weights, Twist without tearing, Walk cycle, Feet on the ground, Blobs to a model, Morphs, Fur and grass.
- **Real things from photos** (17 to 21): Photo shoot, Fuzzy things, Floaters and cleanup, Lighting is baked, Why small blobs shimmer (new: a wire fence that blinks in the distance, the blur that stops it, and the fade that keeps the blur honest).

New since the lessons first went up: Feet on the ground walks the elf over a dirt path, up stone steps, up a grassy slope and over a rocky path. The ground slides under it, each ground has its own walk (a heel-to-toe stride on the flat, a slower climb on the steps, high steps over the stones), and every foot is planned so it never goes through a step.

### Sandbox

Place blobs and shapes, and add creatures (fox, frog, elf, dragon, monsters, a slime, a watch) that move, then freeze them into the scene. A creature can walk about: switch it on and it wanders round its spot, turning, walking and resting. It can also look at you, or at the middle of the view, turning its head as you move round it. Effects on the whole scene (explode, melt, wind...) now move the creatures too. Save the whole scene, creatures and all, as a rigged .glb: it opens here again with every creature still moving, and on Splat Creatures as one model.

### Experiments (9)

- **Pixel Diorama**: pixel-art scenes cut from splats, 22 of them with a recorded loop each. The newest four are a ruined chapel, a crystal cave, a desert canyon and a snowed-in cabin, where snow lands and drifts. Record your own loop as an APNG or MP4, or open your own .obj or .glb model.
- **Splat Creatures**: rigged creatures, monsters from a seed, and sprite sheets. Download any of them as a rigged splat .glb.
- **Forest Walk**: walk an elf and a fox down an endless forest path that grows as you go. Now the grass can catch fire and grow back.
- **Dungeon Run**: a sword, fire and frost against slimes, with live light and shadows and props that break.
- **Shape Shifter**: one creature turns into another.
- **Clockwork**: a watch movement that keeps real time.
- **Scan Studio**: clean up and relight a phone splat scan.
- **Fit a Picture**: train 2D blobs to match a picture.
- **Splat to Sprite**: turn a splat into a pixel sprite sheet.

The Experiments page lists them like posts, newest or oldest first, and can show one kind at a time: games, creatures, pixel art, tools, or ones to watch.

### The engine

Our own renderer for animated splats, built on three.js with WebGPU and a WebGL fallback. It has bones that bend, grow and slide, morphs, live lights and shadows, level of detail, picking, foot IK and a pixel-art pass. The engine page shows three live demos. Rigged splats save as glTF using a draft extension, documented at /engine/rigged-splats/.

### Thanks

Some pixel-scene ideas come from Silicon Jungle's play kits (ideas, not code). The code is MIT licensed.

[Unreleased]: https://github.com/mtblck/blobscape/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/mtblck/blobscape/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/mtblck/blobscape/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/mtblck/blobscape/releases/tag/v0.1.0
