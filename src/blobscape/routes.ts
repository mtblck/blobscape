import { useEffect, useState } from 'react'
import type { Goal } from './progress.ts'

/**
 * Pages are real paths (/lessons/one-blob/), each prerendered to its own HTML
 * file at build time (scripts/prerender.ts) so search engines and link
 * previews see every page. In the browser it's still one app: links between
 * these pages swap the page without a reload (useLinkNavigation).
 */
export type Route = { page: 'home' } | { page: 'lessons' } | { page: 'lesson'; id: string } | { page: 'sandbox' } | { page: 'creature' } | { page: 'forest' } | { page: 'clockwork' } | { page: 'shift' } | { page: 'flow' } | { page: 'diorama' } | { page: 'dungeon' } | { page: 'scan' } | { page: 'experiments' } | { page: 'engine' } | { page: 'spec' } | { page: 'contact' } | { page: 'notfound' }

export const LESSONS = [
  { id: 'one-blob', title: 'One blob', summary: 'Five kinds of number, 14 in all, make one Gaussian. Pull each one and see what it does.' },
  { id: 'footprint', title: 'Footprint', summary: 'A 3D blob lands on screen as a 2D ellipse. Orbit it and watch the shadow it casts change.' },
  { id: 'order', title: 'Order matters', summary: 'See-through blobs only blend right when drawn back to front. Draw them in the wrong order.' },
  { id: 'many', title: 'Many make a shape', summary: 'From one blob to twenty thousand: when does a pile of blobs become a solid object?' },
  { id: 'angle', title: 'Color by angle', summary: 'A blob that changes color as you walk round it, and how many numbers that takes.' },
  { id: 'paint', title: 'Paint', summary: 'Spray blobs onto the floor by hand, and trade blob size against how many you need.' },
  { id: 'formats', title: 'Splat files', summary: 'The same scene saved three ways: what a splat file holds, and how small it can get.' },
  { id: 'break', title: 'Break it', summary: 'Shrink every blob to a dot, blow the scene apart, and put it back exactly.' },
  { id: 'one-bone', title: 'One bone', summary: 'A bone moves blobs it never touches. Bend a caterpillar and find out which ones follow.' },
  { id: 'weights', title: 'Weights', summary: 'Bend an arm and the elbow tears. Fix it without moving a bone.' },
  { id: 'twist', title: 'Twist without tearing', summary: 'Turn a wrist over two ways, and see why one of them squashes the blobs flat.' },
  { id: 'walk', title: 'Walk cycle', summary: 'Four poses and some timing make a walk. Find the ones that matter, and stop the feet sliding.' },
  { id: 'feet', title: 'Feet on the ground', summary: 'A walk made on flat ground, put on steps, a slope and rocks. Bend the legs to fit, and find what a leg can’t reach.' },
  { id: 'model', title: 'Blobs to a model', summary: 'Save the walking fox as splats and as a solid mesh, and see what each one keeps.' },
  { id: 'morphs', title: 'Morphs', summary: 'A pufferfish with no moving bones that swells, bristles and swings its tail. Move its blobs, and find out why moving them is not enough.' },
  { id: 'fur', title: 'Fur and grass', summary: 'A coat of five thousand strands and a lawn in the wind, each strand one stretched blob. Find what holds a coat together, and what a blade needs to bend.' },
  { id: 'shoot', title: 'Photo shoot', summary: 'Photograph a toy bird and train blobs to match. How many photos does it take to get every side right?' },
  { id: 'fuzzy', title: 'Fuzzy things', summary: 'Grass, a dandelion clock and a wooden block, kept as splats and as a mesh. Which keeps what, and for how many bytes?' },
  { id: 'floaters', title: 'Floaters and cleanup', summary: 'A rushed capture leaves blobs hanging in the air. Cut them away, and find what no cut can fix.' },
  { id: 'lighting', title: 'Lighting is baked', summary: 'A scan keeps the light it was shot in. Move the lamp, and try three ways to make the scan keep up.' },
  { id: 'shimmer', title: 'Why small blobs shimmer', summary: 'A wire fence in the distance blinks as it moves. Blur it to stop the blinking, and find what the blur costs.' },
  { id: 'first-creature', title: 'Your first creature', summary: 'A slug of two shapes on two bones, made with the engine in a page of code. Make its tail bend, close the crease, and let it swing.' },
] as const

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five']
/** How many lessons there are, in words ("thirteen"), for headings and links. */
export const LESSON_COUNT = WORDS[LESSONS.length] ?? String(LESSONS.length)

/** Lessons come in parts, shown as groups on the lesson list. `from` is the index of each part's first lesson. */
export const PARTS = [
  { title: 'One object', from: 0, summary: 'What a blob is, and how thousands of them make a thing you can look at from anywhere.' },
  { title: 'Rigs and 3D models', from: 8, summary: 'Bones that move blobs, a walk cycle and feet that find the ground, a creature that leaves as a model Blender opens, a pufferfish that moves with no bones, and fur.' },
  { title: 'Real things from photos', from: 16, summary: 'Where splats really shine: capturing real objects and places from photos, and what a capture can and can’t do.' },
  { title: 'Build with the engine', from: 21, summary: 'The engine behind the experiments, as code you can take away: a creature on bones, a scene written as data, and pixel art.' },
] as const

/**
 * Each lesson's goals, in one place so the home page can count them. The
 * check for each goal lives with its lesson, keyed by these ids.
 */
export const LESSON_GOALS: Record<(typeof LESSONS)[number]['id'], Goal[]> = {
  'one-blob': [
    { id: 'pancake', label: 'Squash it into a pancake', hint: 'Make one size much smaller than the other two.', where: 'shape', why: 'Three sizes set the shape. Make one tiny and the blob goes flat.' },
    { id: 'needle', label: 'Stretch it into a needle', hint: 'Make one size much bigger than the other two.', where: 'shape', why: 'The same three numbers, set differently, give a completely different blob.' },
    { id: 'tilt', label: 'Turn it', where: 'turn', why: 'Turning changes which way the shape points, not the shape itself.' },
    { id: 'ghost', label: 'Make it a ghost', hint: 'Turn the opacity right down, but not to nothing.', where: 'look', why: 'Opacity is how much the very center covers. It always fades out toward the edge.' },
  ],
  'footprint': [
    { id: 'round', label: 'Find an angle where the footprint is round', hint: 'Look straight at the flat face.', where: 'view', why: 'Face on, a flat blob covers the most screen it can: a full circle.' },
    { id: 'line', label: 'Make the footprint a thin line', hint: 'Look at it edge-on.', where: 'view', why: 'Edge on, the same blob covers almost nothing. What lands on screen depends on where you look from.' },
    { id: 'hard', label: 'Cut the reach to 1σ or less and see the hard edge', where: 'reach', why: 'Stop drawing too soon and the soft edge gets chopped off: speed traded for smoothness.' },
  ],
  'order': [
    { id: 'wrong', label: 'See list order get it wrong', hint: 'Compare the two views: which blob looks in front?', where: 'view', why: 'Blending assumes each new blob is in front. Draw the far one last and it paints over the near one.' },
    { id: 'luck', label: 'Turn the camera until list order happens to be right', hint: 'Go round the back.', where: 'camera', why: 'From behind, the stored order happens to run back to front, so it looks right by luck.' },
    { id: 'reversed', label: 'Draw front to back', where: 'order', why: 'Front to back is exactly backwards: the nearest blob ends up buried.' },
    { id: 'opaque', label: 'Make the blobs fully opaque while the order is wrong', hint: 'Now the wrong blob hides the right one completely.', where: 'look', why: 'With nothing see-through, a wrong order no longer just looks muddy: it hides blobs that should be in front.' },
  ],
  'many': [
    { id: 'few', label: 'Go below 30 blobs and watch the shape fall apart', where: 'count', why: 'With so few, each blob has to be huge to cover the surface, so the shape turns lumpy.' },
    { id: 'lots', label: 'Go past 5,000 blobs', where: 'count', why: 'Thousands of small blobs make a smooth surface. Real captures use millions.' },
    { id: 'balls', label: 'Swap the flat discs for round balls', hint: 'Look at the outline: round blobs make a lumpier edge.', where: 'blobs', why: 'Round balls bulge out past the surface at the edge; flat discs lie along it.' },
    { id: 'gaps', label: 'Shrink the blobs until you can see through the gaps', where: 'count', why: 'Shrink them and the surface turns to dust: there is nothing between the blobs.' },
  ],
  'angle': [
    { id: 'walk', label: 'Walk round the ball and watch the shine follow you', hint: 'Drag either view, or use the Walk round slider.', where: 'view', why: "The bright spot isn't painted on: each blob changes color with where you look from." },
    { id: 'flat', label: 'Find the degree where the shine disappears', hint: 'Give each blob fewer numbers.', where: 'degree', why: 'Degree 0 is one color for every direction, so the shine can only average away.' },
    { id: 'sharp', label: "Sharpen the shine until degree 3 can't keep up", hint: "Compare the two highlights, and watch how bright the stored one gets.", where: 'shine', why: 'Sharp glints need finer patterns than 48 numbers can build, so captures blur mirror-like shine.' },
  ],
  'paint': [
    { id: 'cover', label: 'Cover the square', hint: 'Drag across the square to spray.', where: 'view', why: 'Overlap enough soft patches and a surface appears.' },
    { id: 'few', label: 'Cover it again with fewer than 150 blobs', hint: 'Erase or clear what you have, then change how big each blob is.', where: 'brush', why: 'Big blobs cover more ground with fewer of them, but blur any detail inside each one.' },
    { id: 'balls', label: 'Paint with round balls, then look edge-on', hint: 'Switch off flat discs, spray, then lower the camera.', where: 'kind', why: 'Round blobs bulge up out of the floor. Flat discs are what make a surface look thin.' },
  ],
  'formats': [
    { id: 'smallest', label: 'Compare the three formats and find the smallest', hint: 'Try each one and watch the file size.', where: 'format', why: '.spz packs each number into a byte or two, then compresses the lot.' },
    { id: 'small', label: 'Get the file under 150 KB', hint: 'A file is blobs times bytes per blob.', where: 'keep', why: 'Fewer blobs, smaller file: the size scales with the count.' },
    { id: 'patchy', label: 'Keep so few blobs that the cap goes patchy', hint: 'Look at the red cap as you lower Keep.', where: 'keep', why: 'Drop blobs and the gaps show. Training adds blobs exactly where the detail needs them.' },
  ],
  'break': [
    { id: 'dots', label: 'Shrink every blob to a dot', where: 'size', why: 'The surface turns into a cloud of points, because it was never a surface.' },
    { id: 'apart', label: 'Blow it apart', where: 'explode', why: 'Each blob flies on its own: nothing holds them together.' },
    { id: 'back', label: 'Put it back together exactly', hint: 'Undo both: no explosion, blobs at full size.', where: 'explode', why: 'Nothing was lost. A splat is a list of blobs, not a surface.' },
  ],
  'one-bone': [
    { id: 'lift', label: "Lift the caterpillar's head with the bone", hint: 'Turn the bone well up, and watch which blobs go with it.', where: 'bend', why: 'Every blob hung on the bone turns about the joint with it, though the bone touches none of them.' },
    { id: 'tear', label: 'Tear the caterpillar open', hint: 'Change which blobs hang on the bone, not how far it turns.', where: 'hang', why: 'Blobs between the joint and the cut stay with the body bone, so the body splits at the cut, not at the joint.' },
    { id: 'swing', label: 'Make blobs behind the joint swing up with the head', hint: 'Hang more of the body on the bone.', where: 'hang', why: 'A blob follows its bone wherever it sits: hung on the head bone, the middle swings round the joint and through the floor.' },
    { id: 'seam', label: 'Put the cut back at the joint, bend it hard, and find the seam that\'s left', hint: 'Look along the top of the bend.', where: 'view', why: 'With one bone per blob, the outside of a bend always opens a little. The next lesson lets a blob follow two.' },
  ],
  'weights': [
    { id: 'crack', label: 'Bend the elbow until the arm tears open', hint: 'Look at the outside of the elbow.', where: 'bend', why: 'Each blob follows one bone or the other, so the outside of the joint pulls apart and the inside piles up.' },
    { id: 'smooth', label: 'Bend it past 80° with no tear', hint: 'Let blobs near the elbow follow both bones.', where: 'blend', why: 'Blobs near the joint follow both bones a little, so they land between the two and fill the gap.' },
    { id: 'rubber', label: 'Spread the blend so wide the arm goes rubbery', where: 'blend', why: 'The middle of the forearm half-follows the upper arm, so the whole arm curves like a hose.' },
    { id: 'offset', label: 'Move the blend off the elbow and watch where it creases', where: 'blend', why: "Weights don't know where the joint is: put the blend elsewhere and the arm creases there." },
  ],
  'twist': [
    { id: 'flat', label: 'Turn the hand right over and compare the two wrists', hint: 'Look down on the wrists from above.', where: 'twist', why: 'Halfway between facing up and facing down is flat: blended matrices squash the wrist blobs into slivers.' },
    { id: 'small', label: 'Find a twist small enough that blended matrices get away with it', where: 'twist', why: 'A small turn barely squashes. The flattening grows with the angle, so it hides until a wrist turns right over.' },
    { id: 'hard', label: 'Stop the left wrist flattening without changing the twist', hint: 'The squashed blobs are the ones that follow both bones.', where: 'blend', why: 'With no blobs shared, nothing flattens, but the wrist tears instead. Blended matrices can’t have both; averaged turns can.' },
  ],
  'walk': [
    { id: 'two', label: 'Play the walk from the two contact poses only, and watch the feet', hint: 'Fewer keys.', where: 'keys', why: 'Nothing lifts a foot between two contacts: each one swings forward through the floor. Passing poses pick the feet up.' },
    { id: 'hold', label: 'Play it slowly with every key held, no in-betweens', where: 'keys', why: 'Without in-betweens the fox snaps from pose to pose. The blended frames between keys are most of what you see.' },
    { id: 'grip', label: 'Make the feet stop sliding on the ground', hint: 'The ground slides under a walk on the spot. Match it to the feet.', where: 'ground', why: 'A planted foot must move back exactly as fast as the ground, or it skates.' },
    { id: 'run', label: 'Speed it up to a run, and keep the feet planted', hint: 'A step of under half a second.', where: 'timing', why: 'Half the step time, twice the foot speed: the same stride covers ground twice as fast.' },
  ],
  'model': [
    { id: 'pieces', label: 'Raise the surface level until the fox falls apart', where: 'surface', why: 'The mesh wraps only where blobs are dense enough. Thin legs and ears thin out first, so they break off.' },
    { id: 'coarse', label: 'Make the grid so coarse the mesh strays 8 cm from the blobs', where: 'grid', why: 'A grid can’t hold anything smaller than a cell: ears and toes melt into lumps.' },
    { id: 'keep', label: 'Make a mesh in one piece, within 5 cm of the blobs, under 300 KB', hint: 'Watch the size as you change the grid.', where: 'grid', why: 'Each finer grid roughly quadruples the triangles. The trick is the coarsest grid that keeps what matters.' },
  ],
  'morphs': [
    { id: 'spikes', label: 'Grow the spikes right out and compare the two fish', hint: 'Look closely at one spike.', where: 'body', why: 'A spike grows to seven times its length. Move only the centers and its few blobs become a dotted line. Each blob has to stretch along the spike.' },
    { id: 'thin', label: 'Make the fish thinner than it was built, though it has no thin shape', hint: 'A morph is a change, and a change has a direction.', where: 'body', why: 'A morph stores a direction for every blob, not a place to end up. A negative amount runs the puff backward, for no extra numbers.' },
    { id: 'past', label: 'Swing the tail further than its shape goes, and watch what it does instead of curling', hint: 'Nothing stops a slider at 100%.', where: 'tail', why: 'A morph moves each blob along a straight line, and past its shape it keeps going. The tail cannot curl further round, so it grows. Turning is a bone’s job.' },
  ],
  'feet': [
    { id: 'sink', label: 'Put the elf on uneven ground and find a foot sunk into it', hint: 'Leave the legs as the walk made them.', where: 'ground', why: 'The walk was made on flat ground, so every foot is exactly as wrong as the height of the ground under it: inside a step, or over a dip.' },
    { id: 'plant', label: 'Walk the elf on steps with its feet on different treads, every foot on its own tread', hint: 'Walk it up the steps, then let the legs bend.', where: 'feet', why: 'Each foot is planned on the ground itself: down, it rides with its tread; up, it rises over every edge before it lands on the next. Hip, knee and ankle make a triangle with known sides, so the knee has one place to go.' },
    { id: 'reach', label: 'Find a step down a leg can’t reach, then fix it without changing the step', hint: 'Hold the hips still and make the steps deeper.', where: 'feet', why: 'A leg is only so long. Sink the hips by whatever the lower foot needs and every leg reaches; that is why game characters crouch a little on stairs.' },
    { id: 'tilt', label: 'Stand the elf on a slope of 15° or more with its soles flat on it', hint: 'Bending the legs moves the ankles. What turns the feet?', where: 'feet', why: 'The foot is a bone of its own. After the leg is bent it is turned by the slope under it, worked out from the ground’s height either side of it.' },
  ],
  'fur': [
    { id: 'felt', label: 'Turn the critter’s fur into felt', hint: 'What makes a blob look like a hair?', where: 'strand', why: 'A hair is many times longer than it is wide. Widen the blobs and they blur into one soft surface: a strand reads as fur only while it stays thin.' },
    { id: 'skin', label: 'Take the skin away and keep the critter solid, under 2% light through, without widening a strand', hint: 'The skin’s blobs become strands. Where must the strands lie to hide the body on their own?', where: 'skin', why: 'Without skin, strands have to cover the body by overlapping like shingles: laid flat and long. A short, fluffy coat can’t, which is why the fox keeps a skin under its fur, a shade darker.' },
    { id: 'bend', label: 'Make the grass bend in a breeze instead of tipping over like sticks', hint: 'One blob is always straight.', where: 'bend', why: 'A blob can stretch and turn but never curve. Two or more blobs end to end, each a straight piece of the blade, make the curve.' },
    { id: 'budget', label: 'Bend the lawn in a full breeze and keep 2,000 blades or more', hint: 'The budget is fixed. Count what each extra blob costs.', where: 'bend', why: 'Every blob in a blade is one blade fewer. Long grass gets just enough pieces to bend, and short fur, which never bends much, stays one blob a strand.' },
  ],
  'shoot': [
    { id: 'back', label: 'Train from photos of the front only, then look at the back', hint: 'Keep every camera near the front, wait for training, then turn the view round.', where: 'look', why: 'No photo saw the back, so nothing told those blobs what to be. They only had to look right from the front.' },
    { id: 'floaters', label: 'Match your photos almost perfectly while every side stays under 65%', hint: 'Two or more photos, all from nearly the same place.', where: 'cameras', why: 'Blobs floating in the air can add up to the right photo. Seen from anywhere else, they are floaters.' },
    { id: 'few', label: 'Get every side above 92% with four photos or fewer', where: 'cameras', why: 'Spread out, each photo pins down blobs the others can’t see. Bunched up, they mostly agree with each other.' },
    { id: 'round', label: 'Get every side above 97%', where: 'cameras', why: 'Every new angle rules out blobs that only fit the others. Real captures use hundreds of photos for this.' },
  ],
  'floaters': [
    { id: 'free', label: 'Cut a third of the blobs without changing what you see', hint: 'Some blobs are nearly invisible.', where: 'cuts', why: 'Blobs faded almost to nothing still cost bytes. Cutting them is free: nothing you can see changes.' },
    { id: 'clear', label: 'Raise every side by 5 points, keeping your photos above 98%', hint: 'Go after the strays and smudges in the air.', where: 'cuts', why: 'Clearing junk out of the air helps, but only where the junk was. The far side stays a guess.' },
    { id: 'far', label: 'Cut until your photos drop below 95%', where: 'cuts', why: 'A cut sees one number per blob, not a bird. Push it too far and it takes the real thing.' },
    { id: 'retake', label: 'Beat your best cleanup without cutting anything', hint: 'Look at how the bird was captured.', where: 'capture', why: 'Eight photos all round beat any cut. Cleanup tidies a good capture; it can’t rescue a bad one.' },
  ],
  'lighting': [
    { id: 'stuck', label: 'Swing the lamp round to the other side and compare', where: 'lamp', why: 'The real table changes and the scan doesn’t. Its light and shadows are part of its color now.' },
    { id: 'double', label: 'Add a live light from the other side', hint: 'Keep the lamp well away from where it was.', where: 'relight', why: 'The old light is still painted on, so the scan ends up lit from both sides and the score barely moves.' },
    { id: 'guess', label: 'Take the old light out and get past 55% with the lamp moved', hint: 'Work out where the capture’s lamp stood from the scan’s shading.', where: 'old', why: 'Divide out the old light and the ball and box relight well. The shadows still sit where they were.' },
    { id: 'shape', label: 'Get the table within 2% with the lamp moved', hint: 'The old shadows have to go. What would you need to know to move them?', where: 'old', why: 'Shadows need the scene’s shape: what blocked the light. With it, both the light and the shadows move.' },
  ],
  'shimmer': [
    { id: 'blink', label: 'Make the fence blink as it drifts', hint: 'Send it further away, with no blur.', where: 'distance', why: 'Far off, a wire is thinner than a pixel. Each pixel looks at one point, its middle, and the wire is caught or missed as it slides.' },
    { id: 'calm', label: 'Stop the blinking without bringing the fence closer', hint: 'Keep it at 6 m or more.', where: 'blur', why: 'Blurred to at least a pixel wide, no wire can fall between two pixel middles. Most splat renderers do this to every blob.' },
    { id: 'heavy', label: 'Find what the blur costs far away', hint: 'Compare how much fence each view shows, at 6 m or more.', where: 'blur', why: 'A wire blurred a pixel wide is still drawn as solid as before, so far off it covers twice what it should: thin things go thick.' },
    { id: 'both', label: 'At 7 m or more, keep the blink under 2% and the fence within 5% of what it should cover', hint: 'The blur spreads each blob out. What else would have to change?', where: 'fade', why: 'Fade each blob by as much as the blur spread it and it covers what it should, still too wide to blink. That is Mip-Splatting’s 2D filter.' },
  ],
  'first-creature': [
    { id: 'bend', label: 'Make the tail bend with its bone', hint: 'The bone turns already. Look at what the skin listens to.', where: 'skin', why: 'A blob moves only with the bones its part lists. Turn a bone nobody listens to and nothing happens.' },
    { id: 'smooth', label: 'Bend the tail hard with no crease where it joins', hint: 'Watch the readout as you change how far a weight spreads.', where: 'skin', why: 'Spread each blob\u2019s weight over both bones near the join and it turns part of the way, so the skin bends instead of folding.' },
    { id: 'swing', label: 'Let the tail swing behind as the slug turns', where: 'move', why: 'A swing pulls the tail toward its pose loosely instead of setting it, so it lags, overshoots and settles, on top of the move.' },
  ],
  'fuzzy': [
    { id: 'blades', label: 'Give the grass mesh its finest grid, and count the blade tips it keeps', where: 'mesh', why: 'None. A blade is thinner than a grid cell, so the skin can’t close round it and the blades melt into the clump.' },
    { id: 'tiny', label: 'Keep every blade tip as splats in 10 KB or less', hint: 'Fewer blobs, but not too few.', where: 'splats', why: 'One flat blob can be a whole stretch of blade, so a few hundred keep the lot.' },
    { id: 'fluff', label: 'Find out how much light gets through the dandelion clock', hint: 'Change the thing, then read under the view.', where: 'thing', why: 'Faint blobs let light through the way the seed head does. A mesh is solid or nothing: wrapped round this cloud, the fluff is gone.' },
    { id: 'block', label: 'Shrink the block’s mesh to a twentieth of its splats’ size, with sharp edges', hint: 'Look for a way to tidy the mesh’s flat faces.', where: 'mesh', why: 'A few dozen triangles keep every edge and stripe sharp. Hard, flat things are what meshes are for.' },
  ],
}

/** Lessons still to come, shown grayed out on the home page. */
export const COMING: { title: string; summary: string }[] = []

/** The page at a path, or null when the path isn't one of Blobscape's (a tool, the engine lab, a typo). */
export function parsePath(pathname: string): Route | null {
  const m = pathname.replace(/^\/+|\/+$/g, '').split('/')
  if (m.length === 1 && m[0] === '') return { page: 'home' }
  if (m[0] === 'lessons' && m.length === 1) return { page: 'lessons' }
  if (m[0] === 'lessons' && m.length === 2 && LESSONS.some((l) => l.id === m[1])) return { page: 'lesson', id: m[1] }
  if (m.length === 1 && m[0] === 'sandbox') return { page: 'sandbox' }
  if (m.length === 1 && m[0] === 'experiments') return { page: 'experiments' }
  if (m.length === 1 && m[0] === 'engine') return { page: 'engine' }
  if (m.length === 2 && m[0] === 'engine' && m[1] === 'rigged-splats') return { page: 'spec' }
  if (m.length === 1 && m[0] === 'contact') return { page: 'contact' }
  if (m.length === 2 && m[0] === 'experiments' && m[1] === 'creature') return { page: 'creature' }
  if (m.length === 2 && m[0] === 'experiments' && m[1] === 'forest-walk') return { page: 'forest' }
  if (m.length === 2 && m[0] === 'experiments' && m[1] === 'clockwork') return { page: 'clockwork' }
  if (m.length === 2 && m[0] === 'experiments' && m[1] === 'shape-shifter') return { page: 'shift' }
  if (m.length === 2 && m[0] === 'experiments' && m[1] === 'sand-snow-goo') return { page: 'flow' }
  if (m.length === 2 && m[0] === 'experiments' && m[1] === 'pixel-diorama') return { page: 'diorama' }
  if (m.length === 2 && m[0] === 'experiments' && m[1] === 'scan-studio') return { page: 'scan' }
  if (m.length === 2 && m[0] === 'experiments' && m[1] === 'dungeon-run') return { page: 'dungeon' }
  // The old address, before every experiment moved under /experiments/ (Vercel redirects it too)
  if (m.length === 1 && m[0] === 'creature') return { page: 'creature' }
  return null
}

/** Old links used the hash (#/lesson/one-blob); they still land on the right page. */
export function parseLegacyHash(hash: string): Route | null {
  if (!hash.startsWith('#/')) return null
  const m = hash.slice(2).split('/')
  if (m[0] === 'lesson' && LESSONS.some((l) => l.id === m[1])) return { page: 'lesson', id: m[1] }
  if (m[0] === 'sandbox') return { page: 'sandbox' }
  if (m[0] === 'creature') return { page: 'creature' }
  if (m[0] === 'lessons') return { page: 'lessons' }
  return { page: 'home' }
}

export function href(r: Route): string {
  if (r.page === 'lesson') return `/lessons/${r.id}/`
  if (r.page === 'sandbox') return '/sandbox/'
  if (r.page === 'creature') return '/experiments/creature/'
  if (r.page === 'forest') return '/experiments/forest-walk/'
  if (r.page === 'clockwork') return '/experiments/clockwork/'
  if (r.page === 'shift') return '/experiments/shape-shifter/'
  if (r.page === 'flow') return '/experiments/sand-snow-goo/'
  if (r.page === 'diorama') return '/experiments/pixel-diorama/'
  if (r.page === 'scan') return '/experiments/scan-studio/'
  if (r.page === 'dungeon') return '/experiments/dungeon-run/'
  if (r.page === 'experiments') return '/experiments/'
  if (r.page === 'engine') return '/engine/'
  if (r.page === 'spec') return '/engine/rigged-splats/'
  if (r.page === 'contact') return '/contact/'
  if (r.page === 'lessons') return '/lessons/'
  return '/'
}

const NAVIGATE = 'blobscape:navigate'

/** Goes to a page without reloading (or to any URL of this site, keeping its query). */
export function navigate(url: string) {
  window.history.pushState(null, '', url)
  window.dispatchEvent(new Event(NAVIGATE))
}

export function go(r: Route) {
  navigate(href(r))
}

function current(): Route {
  return parsePath(window.location.pathname) ?? { page: 'notfound' }
}

/** The page in the address bar, kept up to date. `at` fixes the first one, for prerendering a page outside a browser. */
export function useRoute(at?: Route): Route {
  const [route, setRoute] = useState<Route>(() => {
    if (at) return at
    const legacy = window.location.pathname === '/' ? parseLegacyHash(window.location.hash) : null
    if (legacy) window.history.replaceState(null, '', href(legacy) + window.location.search)
    // The old /creature/ address (Vercel redirects it; this covers dev and anywhere without the redirect)
    const now = current()
    if (now.page === 'creature' && window.location.pathname !== href(now)) window.history.replaceState(null, '', href(now) + window.location.search + window.location.hash)
    return now
  })
  useEffect(() => {
    const on = () => setRoute((was) => {
      const now = current()
      // Same page (a query or #anchor change): keep the object so nothing remounts
      return href(now) === href(was) && now.page === was.page ? was : now
    })
    window.addEventListener('popstate', on)
    window.addEventListener(NAVIGATE, on)
    return () => {
      window.removeEventListener('popstate', on)
      window.removeEventListener(NAVIGATE, on)
    }
  }, [])
  return route
}

/**
 * Plain left-clicks on links to Blobscape's own pages change the page in
 * place instead of reloading it. Everything else (new tab, downloads, the
 * tools, other sites, #anchors on this page) is left to the browser.
 */
export function useLinkNavigation() {
  useEffect(() => {
    const on = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = e.target instanceof Element ? e.target.closest('a') : null
      if (!a || !a.href || (a.target && a.target !== '_self') || a.hasAttribute('download')) return
      const url = new URL(a.href)
      if (url.origin !== window.location.origin || !parsePath(url.pathname)) return
      const samePage = url.pathname === window.location.pathname && url.search === window.location.search
      if (samePage && url.hash) return
      e.preventDefault()
      // A link to the page you're on goes back to its top, without a new history entry
      if (samePage) window.scrollTo(0, 0)
      else navigate(url.pathname + url.search + url.hash)
    }
    document.addEventListener('click', on)
    return () => document.removeEventListener('click', on)
  }, [])
}
