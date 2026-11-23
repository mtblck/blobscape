# Changelog

What changed on blobscape.dev, newest first. Releases follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Each change waiting for a release is a small file of its own in [changes/](changes/), not a line here, so two pull
requests never edit the same lines; `npm run release -- x.y.z` joins them under a new version, and merging that PR
makes the tag and the GitHub release (see docs/releasing.md).

## [Unreleased]

## [0.6.0] - 2026-11-23

- Engine: the style catalog (`CATALOG`, `STYLES`, each look's settings, defaults and `celLook`, `blockLook`, `neonLook`, `glassLook`, `washLook`, `glitchLook`), `SceneWeather` (rain, snow, clouds and lying snow for any scene) and the times of day (`TIMES`, `paletteAt`) are now in `@blobscape/engine`, with a Styles part in the docs and a "Styles as data" guide. The site reads them from the engine.

## [0.5.0] - 2026-11-23

- Engine: the weather, cloud and wind recipes, the shared sky (moon, sun, stars), snow that lies, lava, tags, and scenes made of a land and props (`composeScene`, `splitScene`, `compileProject`) are now part of the package, where before they could only be used on this site.
- Engine docs: new guide sections on the other looks, on water, lava and fire in a scene, on lamps, weather and the shared sky, and on scenes from a land and props, and the reference lists the new parts. The engine page says what the engine now does.
- Diorama and Scene Creator: the campfire's flame is now a simulated fire. Hot gas rises off the logs, draws air in at its foot, flickers and throws sparks, and the firelight follows how hard it burns. Wind blows the flame over and a gale blows it out; it burns on in light rain, burns low and smokes in rain, and heavy rain or a thunderstorm put it out, down to glowing embers, until the weather eases and it catches again. Fire is a shared recipe any scene or prop can use.
- Engine: `fires` in a scene description, played by `SceneFire`, with the simulation itself as `Fire` and `runFire`; `SceneFire.under(sky, seconds)` sets the fires under a wind and rain.
- Scan Studio and Seasonal Bouquets now have each look's own settings under Drawn as (mark size, outlines, pen width, paper, cel shading's light and tones), the same ones as Brush and Ink. Diorama and Scene Creator share one set of weather, wind and cloud controls, and pixel art's Style and Finish controls are drawn from the styles catalog.
- Every style's settings now come from one catalog, so the controls for cel shading, blocks, neon, stained glass, watercolor, ASCII, the brush looks and tech glitch are the same on Diorama, Scene Creator and Brush and Ink, and a scene kept in Scene Creator remembers them.
- Diorama's sky islands no longer freeze a moment after loading, and Scene Creator now draws every style exactly as Diorama does: the same starting detail, pixels that grow as you zoom in, and scenes opening under their own weather.
- Diorama: the lantern grove, heron hut, ruined chapel, pumpkin watch, sky islands, snowed-in cabin, desert canyon and crystal cave are rebuilt as a land and props from the Scene Creator library (lantern birches, the sleeping fox, the stilt hut, heron and mangroves, the chapel and its lantern, the scarecrow and pumpkin patch, the floating isles, the log cabin and snowy firs, hoodoos, saguaros and the stone arch, basalt columns, the geode and glowing crystals, and more); the grove, the islands and the cabin now snow under the shared snow.
- Diorama: the weather's clouds are cut to about the same number of blobs on every scene (a far view's clouds took over 200,000, enough to crash a phone), and turning Clouds over the scene off no longer fails on scenes seen from further away.
- Watercolor: a scene or subject with no sky of its own gets a pale wash behind it instead of bare paper.
- Diorama: when a device runs out of graphics memory and the browser stops drawing, the view says so and offers to start again a detail lower, instead of staying blank.
- Diorama: Turkey Run and the henge are rebuilt from props too: the country road with everything going by is a land, the turkey and the cook run on it, and the magic circle and the witch come and go on the henge's turf as props of their own (also in the library).
- Diorama: the space whales are rebuilt from props in deep space (the great whale, two calves, the ringed planet and tumbling rocks are in the library), and a scene out in space offers no time of day or weather.
- Diorama and Scene Creator: every outdoor tree, pine, fern, reed, corn stalk, flower and hanging paper lamp now leans and flutters in the wind (seaweed under the sea, sprouts in their jars, cacti and mushrooms stay still).
- Diorama: the coral reef, garden crocodile, storm octopus, lantern spider, sunrise window and sprout lab are rebuilt as a land and props from the Scene Creator library (the jellyfish, seaweed, crocodile, reeds, butterflies, the octopus on its buoy, the brass spider, firefly jars, moths, the rose window, desk, bookshelves, sprout jars, the lab cat and more); the storm octopus now rides out the shared thunderstorm instead of its own painted rain.
- Diorama: the campfire, forest bee, stone hand, owl and cauldron, and snail house are rebuilt as a land and props from the Scene Creator library (the fire, tent, lantern, pines, bees, butterflies, the stone hand, columns, cacti, cauldron, owl, candles, the snail house, glowing mushrooms and more), so a fix to a prop reaches every scene that sets it down.
- Diorama: the lighthouse and the windmill are rebuilt as a land and props from the Scene Creator library (the lighthouse, keeper's cottage, jetty, pines, boat and buoy; the windmill, apple trees, haystacks, sheep and duck), so a fix to a prop reaches every scene that sets it down. The boat, buoy and duck still ride the water.
- Diorama: the dragon's lava is real now. It wells up white-hot, spreads and crusts over into dark plates with glowing cracks, piles up along the rim and bubbles, where it used to be painted. The cave is rebuilt as a land and props (the dragon, stalagmites and rocks), which Scene Creator offers on their own.
- Engine: a shared lava recipe for scene descriptions (`lava`), worked out on the water's height field with a field of heat over it.
- Scene Creator's props and lands are tagged (tree, rock, lamp, leafy, floats and more), so searching "tree" finds every tree, and falling leaves and shadows go by what a prop is rather than its name.
- Blocks at 1× no longer leave holes in the windmill's ground, grass, earth and clouds.
- Scene Creator: the shared weather, cloud cover and wind from Diorama, with the clouds over the scene or left out, and Morning, Afternoon and Night chips that set the live sun's hour in Light mode.
- Scene Creator: every Diorama finish setting (paint in steps of the palette, light in bands, shade each pixel, outlines in each thing's own color, heat haze, color cycling), from one set of style settings both pages now share.
- Scene Creator: falling leaves come down from under each leafy tree's crown and move with the tree, instead of falling from the sky.
- The windmill's pond is real water now, with the duck leaving a wake, and the wind turns its sails faster, sways its trees quicker and shakes leaves loose: half fall straight down when windy, and a gale carries them all away. Its clouds and sun are the shared sky's now, so a storm covers them, and Scene Creator draws a scene's water and own clouds too.
- Diorama: the koi pond is now made from Scene Creator props (two stone lanterns, a cherry tree, bamboo, irises, lily pads, stones and stepping posts set down on the pond), opens in Scene Creator as those pieces, and starts under the shared Light rain in place of its own drizzle.
- Diorama: a Light rain weather, a drizzle with no wind, for every scene.
- Scene Creator: the koi pond's thirteen pieces and the pond itself are in the library.
- Diorama: the koi pond has a moon and stars when its time of day is Night.
- Diorama: a Clouds over the scene switch on the Scene tab; off, the weather's clouds are left out and rain and snow fall in from above the picture (the koi pond starts with it off).
- Diorama: bamboo, irises and trees lean and toss harder as the wind rises.
- Diorama: light snow piles up far more slowly and only dusts the ground; heavy snow still covers everything.
- Pixel Diorama is now called Diorama, since it draws its scenes in many styles besides pixel art. It moves to /experiments/diorama/, and the old address takes you there.
- The lighthouse's sea is real water now: long, low swells roll in from the open sea in straight lines, bend round the rock, and the boat and the buoy gently rise, fall and rock as they pass under them. White foam gathers where the waves strike the jetty's posts and the rock, and spray leaps up off them on the biggest waves.
- Diorama: weather and cloud cover for every scene. The Scene tab has one Weather choice (no weather, partly cloudy, cloudy, heavy clouds, rain, heavy rain, a thunderstorm with lightning, snow, heavy snow, fog) and a Wind choice from no wind to a gale: the same recipes on every scene and in every style, with drops and flakes that land on the scene, a sky that turns gray, dimmer light and haze. Changing the weather eases the sky from one to the next without the scene being made again. The lighthouse and the campfire now take their moon, stars and clouds from the same shared sky, so clouds put the stars and then the moon out. Rain on a scene's water rings it, and the lighthouse's sea is now real water. In the Blocks style there is fog, and weather can be drawn as soft blobs or as blocks. Wind, from a breeze to a gale, comes with the weather or on its own: it blows rain and snow at a slant in gusts, each drop leaning with it and the whole view still covered, and raises waves on a scene's water, snow builds up over the scene while it falls and melts after, and a thunderstorm no longer stutters in the Blocks style. Partly cloudy is two or three clouds, and heavy clouds close over the sky and turn gray.
- Gouache and oil no longer look alike: gouache is short, flat, chalky dabs that break up at their ends like a dry brush, and oil is long ridged strokes of richer color that catch the light.
- Lamps, lit windows, candles and campfires in a scene now know when to be lit. A scene has a Time of day (Diorama's Scene tab, Brush and Ink's Subject tab) that every style follows: pick Morning or Afternoon and they go out (a window turns to pale glass, flames, stars and the moon are gone, the sun is up); pick Night and they come on under a night sky and moonlight. Magic, lava and crystals always glow, and a cave keeps its candles lit whatever the hour.
- The lighthouse's turning beam now lights the gallery's railing, floor and cap as it passes over them.
- Changing the style or the time of day no longer flashes the plain blobs while the scene is cut again: the picture keeps its style until the new one is ready.
- Diorama: in the Blocks style a scene's water now moves. The koi pond's rain and fish make ripples in soft blobs among the cubes, or, with Water ripples on the Style tab, as columns of blocks that rise and fall in steps, see-through enough to show the koi under them (Ripple height sets how high they stand).
- Engine: `Actor.flows` marks a surface that moves by itself (a pond's is marked already); `BlockLook.flow` draws it as blocks or leaves it blobs, and `BlockLook.swell` sets how high its ripples stand.
- Blocks style: a lamp that stays put now casts block shadows. A lantern lights only the faces turned to it with nothing in the way, so its own cap and post, and the tops of things round it, stay dark.
- Blocks: the backdrop is the scene's sky or a plain color.
- Diorama, Brush and Ink and Scene Creator: a new Blocks style builds the scene from cubes on a grid, each block one flat color and each face one tone, with the shadows blocks cast on each other and the scene's own lamps shining on them. A Block size slider goes from fine to chunky.
- Engine: `Stage.setBlocks(look)` draws any actor as blocks (`buildBlocks`, `BlockView`).
- Diorama: pixel art reads more hand-drawn. Surfaces lie in flat patches (a pixel takes the color most of its neighbors on the same thing share), dither is kept for the sky and the light round glowing things, one-pixel bumps and notches come off outlines, lines lose their kinks and doubled corners, and the light round a lamp or lit window takes the stone's own shades or the lamp's color instead of a ring of greens and browns. Patches of one or two pixels join their neighbors unless they are a highlight or a detail, edges toward the sun take a lighter rim, the peak of each smooth lit form a highlight, and pixel art starts at Finest detail. After Silicon Jungle's Ink Studio cleanup pass. Scene Creator's pixel art uses it too.
- Diorama: the Finish tab is down to Dither, Glow, Paint in steps, Outline (none, one color or each thing's own), Lines inside the scene, Sky behind, Heat haze, Color cycling and Rock the view. Four samples, steady pixels, calmer pixels, dither that moves with things, glow in rings and softer lit outlines are always on (each still turns off from the address, `?fine=0`, `?steady=0`, `?calm=0`, `?flat=0`, `?surface=0`, `?bands=0`, `?selout=0`), and the exact sort is `?sort=radix`.
- Engine: painting in steps keeps each paint in its own hue, so a red with no darker red in the palette stays red in shade instead of turning brown or orange.
- Diorama: pixel art draws each frame about half as hard as this morning, and phones start it at Fine detail.
- Diorama: a Light in bands switch on the Finish tab lights each blob as one block in three flat steps of sun, so shade falls in crisp bands and stonework and water keep their paint.
- Diorama: the windmill's white sails no longer show spots of sky blue, in shade, on their lit edges or where they turn over the sky.
- Diorama: where one thing meets another, pixel art takes its colors from that thing alone, so the grass behind no longer bleeds into the edge of a hay bale or a bush.
- Diorama: zooming in on pixel art makes the pixels bigger instead of the blobs, so edges stay crisp and lines stay on what they outline.
- Diorama: Shade each pixel, a new Finish switch, works the light out a pixel at a time so light and shade fall in bands that follow each shape.
- Diorama: pixel art draws lines only where one thing meets another, and the blobs along an edge are fitted to it, so fences, rims and field edges end cleanly with their outlines on them.
- Diorama: every style follows a scene's sky as it changes, so Fishing for the moon turns to night in cel shading, paint, watercolor and stained glass too.
- Scene Creator can save a scene for the Blobscape engine as one rigged .glb that plays its loop.
- Scene Creator can copy a link that holds the whole scene in the address, so a scene can be shared without anything being stored.
- Scan Studio can open a cleaned scan in Scene Creator, where it becomes the land of a new scene.
- Scene Creator opens a splat scan (.ply, .spz, .splat or .ksplat) as the land of a new scene, leveled and cleaned, with props standing on it.
- Scene Creator opens a model of a whole scene (.glb): each thing in it becomes a prop, standing where it stood.
- Scene Creator opens a scene description (.json) from a file, with the things it marks (or the things on bones of their own) as props.
- Scene Creator: a model of your own arrives at its real size beside the scene's props, never too big for the land or too small to see.
- Scene Creator: your own models are kept in this browser under Your props, and a scene saved as a file carries the models it uses.
- Scene Creator: a rigged mesh from Blender or a game kit, or a model that isn't a closed surface, is covered in blobs and lit by the scene's sun; a rigged one plays its own moves.
- Scene Creator: open a still model of your own (an .obj with its .mtl, or a .glb) and it is cut into the scene on the same grid, under the same light, as the props from our scenes.
- Scene Creator: open a rigged splat .glb of your own, such as one saved from Splat Creatures, and set it down in a scene playing its moves and blend shapes.
- Scene Creator: every look of a creature is its own card, so an ember or jade dragon, an arctic fox or an autumn elf can stand in a scene too.
- Scene Creator: the creatures of Splat Creatures (the fox, the elf, the dragon and the rest) can be set down in a scene, each playing its own move.
- Scene Creator: lamps can be dragged with a finger, the lamp Height slider no longer springs back, and choosing rain or snow cuts only the land again.
- Scene Creator is in the menu in the sandbox's place: make your own pixel diorama from a scene or a bare land and props cut out of our scenes, light it, pick a style and export the loop. The sandbox moved, unchanged, to the experiments.
- Diorama: changing scenes plays a screen transition (dither, cross-fade, through black, iris, diamond iris, wipe, clock, blinds, checkerboard, tile flood or blocks, or a plain cut), picked under Changing scenes on the Scene tab; an idea from Silicon Jungle's Ink Studio.
- Scene Creator: twelve kit pieces made by rules (walls, a fence, steps, an arch, columns, trees, a cactus, crystals, a boulder, a stump and a bush) join the library, and Props mode has packs that narrow the cards to a theme and set a whole pack down at once; an idea from Silicon Jungle's Ink Studio.
- Shape Shifter: matched partners, the new default, swap blobs between nearby pairs wherever that shortens trips or keeps colors closer, so paths stop crossing; an idea from Silicon Jungle's Ink Studio.
- Diorama: save a scene as a 3D model, a rigged .glb of blocks on the scene's own grid or a smooth surface, with its loop as an animation, with ideas from Silicon Jungle's Ink Studio.
- Scene Creator keeps your scenes in your own browser: an edit is saved a moment later and is there when you come back, Your scenes lists them with a picture each to open, rename, copy or delete, and a scene can be saved as a file and opened again anywhere.
- Scene Creator (unlisted): Style draws the scene in every look Diorama has, and Export saves a frame, the loop or a flight along a camera path.
- Splat Creatures: sprite sheets can come with a normal map and a depth map laid out the same way, for games that light their sprites, with ideas from Silicon Jungle's Ink Studio.
- Brush and Ink and Diorama: a Stipple style of pen dots, and the ASCII look can draw in braille dots or quarter blocks, with ideas from Silicon Jungle's Ink Studio.
- Diorama: glow in rings, heat haze over fires and lamps, color cycling and softer outlines on lit sides, after Silicon Jungle's Ink Studio; the campfire uses the first three.
- Diorama: the dither pattern now moves with the things it falls on instead of standing still on the screen while they turn under it (Dither moves with things, on by default), and the picture keeps to whole art pixels as the view moves. Thanks to Silicon Jungle's Ink Studio for the ideas.
- Scene Creator (unlisted): Light sets a baked sun and sky, a live sun by the hour with moving shadows, lamps, glow, haze and weather.
- Brush and Ink has a Detail choice in its Subject tab (Light, Full, Fine), kept in the address like the others (`?detail=fine`): more blobs make finer marks.
- Seasonal Bouquets: the ceramic snowman's coal mouth and buttons sit on its surface instead of sinking into it, and its hat no longer shows through its head from low down.
- Diorama: cel shading now follows the scene's own light. Lamps, fires and the lighthouse's turning beam light what they reach as one more tone, lit windows and flames stay bright, and a scene under a dark sky is drawn in a night's light in front of its own sky.
- Diorama: Glow now turns up the light that lamps, fires and other glowing things cast on what stands round them, not only the shine round bright pixels. A scene opens lit as before; `?glow=` sets it in the address.
- Diorama: the koi pond's lantern light no longer passes through the stone caps; it leaves only by the openings. Engine: a scene light that casts shadows can set `clear`, the open room round it, for a lamp in a small hollow.
- Diorama: an exported loop now rocks the view when Rock the view is on, and still joins up. Turn the switch off on the Finish tab for a still view.
- Diorama: the lighthouse is now written as a scene description like the others, so a tap on its island throws sparkles too. It looks almost the same; a few textures (the sea's waves, the rock's layers) are drawn a little differently.
- Engine: scene descriptions can ask for a finer grid (`grid`), paint by nearness to a shape (`near`), paint open water (`waves`), say how level a face must be to count as a top (`faces.up`), and start a circling light partway round (`circle.phase`).
- Diorama: the lighthouse no longer shows its far side and lit windows through its walls when seen up close.
- Neon, a new style on Diorama and Brush and Ink: tubes of glowing light along every outline with pulses running along them, over dark bodies that catch the light as it passes. Tubes take each thing's own color or a set of sign colors. Lamps, lit windows and flames shine in their own color and light what is round them.
- Diorama: a new Export tab saves the scene's loop in any style, not only pixel art, as an MP4 or an animated PNG. The loop is drawn one frame at a time, so it joins up when it repeats and no frame is dropped, and it uses the view as it is when you press the button: it doesn't rock, and turning or zooming while it runs changes nothing. Save this frame works in every style too. In full screen, an Export button beside the record button opens the same choices, so a loop can be exported at the view's biggest size.
- Diorama: a new scene, Fishing for the moon. A boy on a floating island casts his line into a cloud and hauls up the moon, then the sun, and the sky turns from day to night and back as each is flung up.
- Diorama: scenes are picked from a Select a Scene window with every scene's card, a search box and arrow-key picking, with previous and next buttons beside it; the long list in the Scene tab and the cards section down the page are gone.
- Diorama: the painted, inked, cel shaded and ASCII styles run faster on phones. They start on a lighter detail and are drawn a little less sharp there, and cel shading's cast shadows cost less.
- Diorama: the Pixels tab is now Style. Pixel art is still how a scene starts, and every look from Brush and Ink can be picked in its place: gouache, oil, ink and wash, hatching, cel shading, ASCII or the plain blobs, each with its own settings. The style is kept in the page's address.
- Diorama: a new scene, Turkey Run. A giant turkey chases a cook in an apron down a country road in the fall, past a fence, trees, pumpkins and a billboard that never stop coming.
- Diorama: a recorded loop saved as an animated PNG can be made bigger. Picture size saves each pixel of the art 1, 2, 4 or 6 pixels wide, and starts at 4.
- Engine: scene descriptions have a new move, `pass`, for things that go by at an even speed over and over, such as what a runner on the spot runs past.
- Diorama: a loop can be recorded at 24 frames a second as well as 12, and Rock the view on the Finish tab holds a scene's swaying view still.
- Every experiment's preview has a Record button beside Full screen: press it, turn the view, change a look or a season, press it again, and a video of just the picture is saved (an MP4 where the browser can make one), with none of the buttons or hints over it. A recording stops by itself after three minutes.
- Scene Creator (unlisted): Arrange picks a prop by a tap or from a list and moves, turns, sizes, lifts, copies and deletes it, with undo and redo.
- Scene Creator (unlisted): Props adds from the library by a tap or by dragging a card onto the view, swaps the land under the props, and shows the room left.
- Seasonal Bouquets: the snowman's top hat is solid in the Soft look, where the head and the far side of its band showed through it.
- Stained glass, a new style on Diorama and Brush and Ink: every surface is cut into panes of colored glass that stay put as the view turns, with lead between them and the light behind.
- Diorama: a Tech glitch style, pixel art with bursts of scanline jitter, color split and broken blocks that pop in and out in sudden steps, and still join up in an exported loop.
- Engine: `Stage.setGlitch` lays the same glitch over pixel mode, with `glitchArt` as its CPU twin.
- Watercolor, a new style on Diorama and Brush and Ink: thin washes on paper with edges that run and dry darker, the grain showing through, a wash of the scene's sky behind and a faint pencil line underneath.
- What's New: a post about Diorama's styles (neon, stained glass, watercolor and the rest), the Export tab and the two newest scenes.
- Diorama: a new scene, White witch at the henge. A magic circle wakes among standing stones at night, sparks gather into a witch in a white robe and a tall white hat, and she waves her wand once and vanishes in a shower of the same sparks.
- Engine: a move in a scene description can take `during: [from, to]`, so it happens once at its own moment of the loop instead of all the way through it, a sprout can set how quickly it grows and shrinks (`rise`, `fall`), and a light can shine for part of the loop only. Scenes can now tell a short story.
- Engine: a new `dissolve` move. The blobs of a part shrink away one by one, each drifting up as it goes, so light, smoke or a ghost can gather out of motes and break up into them again.
- Seasonal Bouquets stands its vase on one of four tables, picked with the bouquet or by hand: a long rustic wooden table, a round wooden top on a turned pedestal, a round glass top on a metal frame, and a white garden table of pierced metal. Every table has legs down to the ground; tip the view down to see them. The address now also keeps the table, the draft and whether petals fall (`?table=long|round|glass|garden`, `?draft=0` to `2`, `?petals=0`).
- Every experiment with a Detail choice takes it from the address and writes it there when you pick one (`?detail=fine`, or a blob count such as `?detail=200k` on Splat Creatures, Clockwork and Shape Shifter), so a link opens at the detail you chose.
- Fixed: Day and Night had lost its shadows where the browser has no WebGPU, since cel shading was added.
- Seasonal Bouquets: stems no longer poke out through the sides of a glass vase near its foot.
- New experiment, Seasonal Bouquets: pick a season and a florist that never repeats itself grows every flower petal by petal from a recipe (48 flowers and greens: peonies, tulips and lilac in spring, roses, sunflowers and delphiniums in summer, dahlias, wheat and Chinese lanterns in fall, amaryllis, winterberry and pine in winter), arranges them by the rules florists use, and stands them in a glass vase, a jam jar, a ceramic vase, a bucket, a watering can, a rain boot, a pumpkin or a ceramic snowman. The stems sway in a draft, a petal falls now and then, it can be drawn soft, in gouache, oil, ink and wash or cel shading, and the address names the bouquet so you can send it to someone.
- Pixel Diorama has a new scene, Space whales: a mother whale and two calves swimming through space with stars on their backs, their tails and flippers beating slowly, past a ringed planet and its moon, banks of nebula and stardust streaming by.
- Brush and Ink's ASCII look draws fur and grass as strokes: a cell that is mostly long thin blobs gets the one of | _ / \\ nearest the way they run, so the fox's coat and a field of grass read as strokes that follow each strand (Look tab, Strokes along fur and grass). A new subject, Fox in the grass, shows both.
- Brush and Ink has a new look, Cel shading: every blob flat in its own color, the light cut into two or three clean tones, shadows cast by whatever stands in the light, and an even outline. The light is live, so you can turn it round the subject and raise or lower it and the shadows follow. Each part's colors are gathered into a few flat ones (a mottled wall becomes one color, a stripe stays a stripe), and there are four backdrops (`?look=cel`).
- Engine: `Stage.setCel` and `CelPass` (cel shading for any stage made with `lights`), `celTones`, `celColor`, `shadowView` and `gatherColors`, a `flat` mark, and `unlit` to cut a scene or creature with no light baked into it.
- Brush and Ink has a new look, ASCII: the picture as a grid of characters, heavier ones where there is more to show and | _ / \\ strokes along the edges. The characters take the colors of what they stand for on a dark screen, or one ink on paper; a cell keeps its character until another clearly fits better, so the text holds steady as you turn the view, and Copy as text gives you the picture in plain characters. Scan Studio's Lighting tab offers it too, and the engine has it as `Stage.setGlyphs`.
- Day and Night has seasons. The Sky tab is now Season, and picking one changes the scene as well as the sun's path: in spring the leafy trees blossom and petals drift down, summer is full leaf, in fall the leaves turn yellow and orange and come down, and in winter the trees are bare and snow falls and lies on the roofs, the pines and the ground. Fireflies come out in spring and summer only. The city's park and roofs follow the season too (`?season=spring|fall|winter`). The latitude and the moon are still in the same tab.
- New page, What's New, in the header between Sandbox and Engine: posts about what has been added and why, newest first, going back to the first two tools. Each post has its own page and picture, releases are marked, and there is a feed for readers (/whats-new/feed.xml).
- Splat Creatures has a second fox, the Minimalist fox: the plain capsule fox from the engine page's one-tag example, with the same coats, moves and controls as the others. It is in the sandbox and Shape Shifter too.
- The dragon's breath ends by leaving its mouth and thinning away out in front, instead of shrinking back in. On Splat Creatures the waiting mark now stays until a detailed creature is really on screen.
- Splat Creatures: the dragon's breath now acts on what is round it. Its ribs fill and its throat glows before the flame comes; the flame lights its hide (and casts shadows, on WebGPU), glows through a lens, and comes down on a floor of flagstones that burns, spreads a little and stays scorched for a while; sparks fly off the end and smoke hangs at the mouth after. Each look has its own breath: frost for the ice dragon (rime and ice on the floor), fire for ember, a green venom for jade. The engine page's dragon does the same.
- Engine: `Stage.useLights`, `setGlowGain` and `recolor`; a sprite sheet leaves out whatever is drawn with the creature (`extras`) and any live light; the dragon has a `lungs` bone (44 bones) and `breathAt`, `dragonBreath`.

## [0.4.0] - 2026-11-18

The headlines:

- Three new experiments: **Wading Pond** (real water, reflections and a lens), **Day and Night** (a cabin and a city lit live through a whole day) and **One Scene, Four Ways** (one scene drawn by a bare shader, three.js meshes, Spark splats and Blobscape).
- The sandbox is a workspace with five modes, and Sand, Snow and Goo is rebuilt so each material behaves like itself.
- Pixel Diorama has two new scenes (Koi pond in the rain, Fox and wisp), and every gallery loop is recorded again.
- In the engine: brush and ink outlines, clean cuts, colliders, water, mirrors, a lens, sunlight and steadier shadows.
- Links to Blobscape now preview with a picture of the page they lead to.

Everything, newest first:

- The dragon's forelegs hang loose while it flies: elbows back, forearms dropping from them and paws limp with the claws down, swinging a little behind each wingbeat. They were held out stiffly in front with the paws turned up.
- Skin no longer tears. The dragon's wings opened black seams and rows of holes as they beat, and the backs of the frog's legs came apart as it jumped. Blobs now stretch with the skin they are part of: where two bones pull skin out between them, each blob is pulled out by the same amount, on every creature, in files and in models opened from outside. Skin shared between more than four bones no longer splits along the lines where a bone was dropped, and thin sheets such as wing skin are cut without the rows of holes they had even at rest. In the engine: `weightGradients`, and `span` on a sculpted part for skin stretched between its bones.
- A link to Blobscape now shows a picture of what it leads to. Each experiment's page shares its own cover, and the front page shares the logo beside four experiments, in place of one plain logo card for every page.
- Pixel Diorama's gallery loops are recorded again, so they show each scene as it is now: the koi pond's cherry tree, and every scene at 50% dither.
- Pixel Diorama has a new scene, Fox and wisp: a furred fox trotting through tall grass round a standing stone at night while a wisp of light circles it and throws moving shadows. It is the fox scene from One Scene, Four Ways.
- The fox has whiskers. The dark lines on its muzzle, which read as streaks across its face, are gone.
- New experiment, One Scene, Four Ways: one pixel-art scene drawn at the same moment by a shader written with no engine, three.js meshes, Spark splats and Blobscape, all with the same pixel-art finish. Two scenes: a furred fox trotting through tall grass with a wisp of light circling it (its grass painted blade by blade with moonlight, darker the deeper it stands), and Pixel Diorama's campfire. One camera and one light slider drive all four, each picture shows how many frames a second it could draw, a phone shows one at a time, and cards below say what each is made of, what moves, what its light can do and where it stops.
- Pixel Diorama's koi pond has a cherry tree in full bloom in place of the maple: billows of pale and deep pink blossom over dark boughs, with petals drifting down and lying on the moss. Its stone lanterns no longer turn warm all over: each one's light used to sit inside solid stone and shine through it onto the cap and rim. The light boxes are now hollow with paper screens in their openings, and the light gets out only through those. The scene's daylight is an overcast day's, with no warm sun in it. The low lantern now stands wholly on the bank; one of its legs was in the water.
- The sandbox's header spans the whole window like the page under it: the logo sits at the left edge and the menu at the right.
- Pixel Diorama has a new scene, Koi pond in the rain: a pond in a moss garden with two stone lanterns, a red maple, bamboo and irises. The water is a real one. Every raindrop leaves a ring where it lands, the koi push wakes as they circle, and the rings spread, cross, bounce off the stepping stones and the banks and die away; with WebGPU the water also mirrors the lanterns and the maple. Any scene written as data can have it: a description's new `water` floods a basin, takes the scene's own rain and is moved by the bones named in `bodies`. In the engine: `SceneWater` works one loop of a scene's water out, and `Stage` takes extra actors, `reshape` and `setMirror`.
- Pixel Diorama: every scene now starts with Dither at 50% (they started between 5% and 12%).
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

[Unreleased]: https://github.com/mtblck/blobscape/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/mtblck/blobscape/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/mtblck/blobscape/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/mtblck/blobscape/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/mtblck/blobscape/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/mtblck/blobscape/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/mtblck/blobscape/releases/tag/v0.1.0
