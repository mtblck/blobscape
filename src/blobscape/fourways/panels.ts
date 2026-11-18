/** The four ways the page draws its scene, in the order they are shown, with what the page says about each. */
export const PANELS = [
  {
    id: 'shader', label: 'Plain shader',
    what: 'No engine and no library: one fragment shader on a bare WebGL canvas. Every shape is a distance formula typed out by hand, and each pixel walks a ray through them.',
    realTime: 'Yes. The cost is per pixel, so small pixel art is cheap and a full screen is not.',
    moves: 'Whatever the formulas were written to move: the flames, the pines, the sparks.',
    light: 'Worked out afresh for every pixel, with soft shadows from the moon and the fire.',
    limit: 'Everything is this one shader. The next scene starts from a blank page, a creature on bones would be a great many formulas, and nothing in it can be saved as a model.',
  },
  {
    id: 'meshes', label: 'three.js meshes',
    what: 'The library’s own cylinders, cones, boxes and lumps, with small tiling textures, Lambert materials and two lights that cast shadow maps.',
    realTime: 'Yes. A few thousand triangles is light work for any GPU.',
    moves: 'Groups turned and scaled each frame; the sparks and fireflies are one instanced mesh.',
    light: 'Live, with shadows from the moon and the fire that follow whatever moves.',
    limit: 'It is made of flat faces. Rough, round and soft things (a lumpy rock, a pine’s needles, fur, smoke) each need their own modeling, and every pattern is a texture to make.',
  },
  {
    id: 'splats', label: 'Spark splats',
    what: 'Spark draws splats; it does not make them. These are the blobs Blobscape cut, handed over as a file would be, moved by Spark’s own skinning and sorted in its worker.',
    realTime: 'Yes. Its sort runs a frame or more behind the view.',
    moves: 'The same bones as Blobscape, through Spark’s skinning.',
    light: 'Painted into the colors when the splats are made. The flames flicker, the glow on the ground does not, and the Fire slider changes nothing.',
    limit: 'It needs splats from somewhere: a scan, or another tool. It has no lights, so a scene that should answer to light has to be painted again.',
  },
  {
    id: 'blobscape', label: 'Blobscape',
    what: 'The scene is a description: a list of shapes, paints, bones, moves and lights. The engine cuts it into blobs once, then moves and lights every blob on the GPU each frame.',
    realTime: 'Yes, after a wait while the scene is cut. Each frame moves, lights and sorts every blob.',
    moves: 'Anything on a bone, from the description alone.',
    light: 'Moonlight and its shadows are painted in as the scene is cut. The fire and the lantern are live lights on every blob; the fire’s shadows are worked out once at the cut, so they flicker with it but do not follow what moves.',
    limit: 'The cut takes seconds, not milliseconds, and the picture is as fine as its grid: a thing smaller than a cell is a blob or two.',
  },
] as const

export type PanelId = (typeof PANELS)[number]['id']
