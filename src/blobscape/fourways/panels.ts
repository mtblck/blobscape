/** The four ways the page draws a scene, in the order they are shown. */
export const PANELS = [
  { id: 'shader', label: 'Plain shader' },
  { id: 'meshes', label: 'three.js meshes' },
  { id: 'splats', label: 'Spark splats' },
  { id: 'blobscape', label: 'Blobscape' },
] as const

export type PanelId = (typeof PANELS)[number]['id']

/** What the page says about one panel for one scene. Keep every line true to what the panel does. */
export interface Words { what: string; realTime: string; moves: string; light: string; keep: string; limit: string }

const CAMPFIRE: Record<PanelId, Words> = {
  shader: {
    what: 'No engine and no library: one fragment shader on a bare WebGL canvas. Every shape is a distance formula typed out by hand, and each pixel walks a ray through them.',
    realTime: 'Yes. The cost is per pixel, so small pixel art is cheap and a full screen is not.',
    moves: 'Whatever the formulas were written to move: the flames, the pines, the sparks.',
    light: 'Worked out afresh for every pixel, with soft shadows from the moon and the fire.',
    keep: 'A picture. The scene lives only in the shader’s formulas, so nothing can be saved as a model or opened in another tool.',
    limit: 'Everything is this one shader. The next scene starts from a blank page, a creature on bones would be a great many formulas, and nothing in it can be saved as a model.',
  },
  meshes: {
    what: 'The library’s own cylinders, cones, boxes and lumps, with small tiling textures, Lambert materials and two lights that cast shadow maps.',
    realTime: 'Yes. A few thousand triangles is light work for any GPU.',
    moves: 'Groups turned and scaled each frame; the sparks and fireflies are one instanced mesh.',
    light: 'Live, with shadows from the moon and the fire that follow whatever moves.',
    keep: 'An ordinary three.js scene, which the library can save as a glTF model that most 3D tools open.',
    limit: 'It is made of flat faces. Rough, round and soft things (a lumpy rock, a pine’s needles, fur, smoke) each need their own modeling, and every pattern is a texture to make.',
  },
  splats: {
    what: 'Spark draws splats; it does not make them. These are the blobs Blobscape cut, handed over as a file would be, moved by Spark’s own skinning and sorted in its worker.',
    realTime: 'Yes. Its sort runs a frame or more behind the view.',
    moves: 'The same bones as Blobscape, through Spark’s skinning.',
    light: 'Painted into the colors when the splats are made. The flames flicker, the glow on the ground does not, and the Fire slider changes nothing.',
    keep: 'The splats it was handed, as they were. Spark reads the common splat files and writes .spz.',
    limit: 'It needs splats from somewhere: a scan, or another tool. It has no lights, so a scene that should answer to light has to be painted again.',
  },
  blobscape: {
    what: 'The scene is a description: a list of shapes, paints, bones, moves and lights. The engine cuts it into blobs once, then moves and lights every blob on the GPU each frame.',
    realTime: 'Yes, after a wait while the scene is cut. Each frame moves, lights and sorts every blob.',
    moves: 'Anything on a bone, from the description alone.',
    light: 'Moonlight and its shadows are painted in as the scene is cut. The fire and the lantern are live lights on every blob; the fire’s shadows are worked out once at the cut, so they flicker with it but do not follow what moves.',
    keep: 'The description, a few kilobytes of plain data that can be edited by hand and cut again. The engine can save the result as a rigged splat file (.glb) with its bones and moves, and the scene it came from plays in Pixel Diorama.',
    limit: 'The cut takes seconds, not milliseconds, and the picture is as fine as its grid: a thing smaller than a cell is a blob or two.',
  },
}

const FOX: Record<PanelId, Words> = {
  shader: {
    what: 'No engine and no library: one fragment shader on a bare WebGL canvas. The fox is round bars and balls melted together, with joints worked out on the CPU each frame; the grass is one bent blade a square of a grid, and each pixel walks a ray through all of it.',
    realTime: 'Yes, on a fair graphics card. Every pixel asks about nine blades and the whole fox at every step of its ray, so it is the dearest of the four here.',
    moves: 'The trot, the brush, the wind in the grass and the wisp, each as a formula typed out for this scene.',
    light: 'Worked out afresh for every pixel. The fox and the stones cast soft shadows from the wisp; the grass does not, because that would mean a second walk through every blade.',
    keep: 'A picture. The scene lives only in the shader’s formulas, so nothing can be saved as a model or opened in another tool.',
    limit: 'A coat is the hard part: the surface is roughened and streaked, which reads as fur from here and would not close up. A second animal means writing this again from the first line.',
  },
  meshes: {
    what: 'The fox is the library’s spheres, cones and tapered cylinders in a tree of groups, turned at the joints. Its coat is about eight thousand small cones stood on those shapes with the library’s surface sampler; the grass is one bent blade drawn several thousand times.',
    realTime: 'Yes, and quickly: this is what graphics cards are built for. Each blade is leaned by the wind on the CPU every frame.',
    moves: 'Groups turned each frame. The coat rides its body part stiffly, so it creases where two parts meet at a joint.',
    light: 'Live, with shadow maps from the moon and the wisp, so the fox, the stone and every blade shade each other.',
    keep: 'An ordinary three.js scene, which the library can save as a glTF model that most 3D tools open.',
    limit: 'It is a fox of separate hard parts. A body that bends as one skin needs a modeled, weighted mesh from a 3D tool, and soft fur needs cards or shells and a good deal of care.',
  },
  splats: {
    what: 'Spark draws splats; it does not make them. These are the blobs Blobscape made, fox, fur, grass and all, handed over as a file would be and moved by Spark’s own skinning.',
    realTime: 'Yes. Its sort runs a frame or more behind the view.',
    moves: 'The same bones as Blobscape, through Spark’s skinning: the trot, the brush and the grass.',
    light: 'Painted in once. The wisp travels, so its light is averaged over the whole lap: the fox, which the wisp never leaves, is lit evenly from every side, the meadow gets a faint ring, and nothing casts a shadow. The Wisp slider changes nothing.',
    keep: 'The splats it was handed, as they were. Spark reads the common splat files and writes .spz.',
    limit: 'It needs splats from somewhere, and it has no lights: the wisp still goes round, but its light and its shadows stay where they were painted.',
  },
  blobscape: {
    what: 'The turf, the stone and the sky are a description. The fox is the Creature page’s, asked for by name: a sculpted skin on fourteen bones under strands of fur, each strand a blob. The grass is three blobs a blade. All of it is one actor on one skeleton.',
    realTime: 'Yes, after a wait while the fox and the scene are made. Each frame moves, lights and sorts every blob.',
    moves: 'Everything on a bone: the trot bends the skin and the fur with it, and the grass leans in the wind.',
    light: 'The wisp is a live light on every blob. With WebGPU it casts shadows through a grid of what is in the way, worked out again each frame, so the fox’s and the stone’s shadows go round with it; with WebGL 2 the light is live and casts none. Moonlight is painted in as each thing is made: every blade of grass takes it by how it faces the moon, how deep it stands among the others and whether the stone is in the way, but the fox casts no moon shadow.',
    keep: 'One actor with its bones and moves, which the engine can save as a rigged splat file (.glb). The fox is the one from Splat Creatures, where it also bakes to sprite sheets, and the whole scene plays in Pixel Diorama.',
    limit: 'The shadow grid is coarse beside a mesh’s shadow map, so shadows are soft and a thin thing casts little. Making the fox takes seconds, and it draws a little slower than the meshes do.',
  },
}

export const WORDS: Record<string, Record<PanelId, Words>> = { campfire: CAMPFIRE, fox: FOX }
