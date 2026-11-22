# Scenes made from props

A Diorama scene can be written two ways. The older way is one description (`SceneDoc`) holding every part, with
`prop` marks that let Scene Creator lift things out of it (rule 13 of `scene-descriptions.md`). The newer way, and the
one to use when building or rebuilding a scene (Matt, 2026-11-21), is **a land and props set down on it**: the props
are the library's own pieces, written once, and the scene only names them and says where they stand.

That way, a prop is the source of truth. Improve the stone lantern's light, give the bamboo a sway in the wind, fix
a petal that pokes through a stone: the change reaches every scene that sets that prop down, in Diorama and in
Scene Creator alike. Nothing is copied.

The koi pond (`src/blobscape/diorama/scenes/koi.ts`) is the first scene built this way.

## The pieces

- **A prop** is a `PropDoc` (`splat-engine/project.ts`): a small description holding one thing (its parts, bones,
  moves and lights) standing on the origin, and its `foot`, the point it stands on (normally `[0, 0, 0]`). Write it
  as `scene-descriptions.md` says for any scene: lamps say when they are lit (rule 14), moving bits ride bones with
  small moves that loop.
- **A land** is a `PropDoc` too, holding what everything stands on and the scene's setting: the ground, water, its
  koi or anything that only makes sense in that water, the sky, air, light, look, palette and camera.
- **Where they live**: `src/blobscape/props/` (`garden.ts` holds the koi pond's pieces; `index.ts` lists every piece
  as `MADE`, with its id, a sentence for its card, and its group). Scene Creator's library lists everything in `MADE`.
  A new kind of thing gets its own file there (`town.ts`, `forest.ts`, ...).
- **A scene** is a `SceneProject`, the same thing Scene Creator saves: a name, a loop, a land by id, and the props
  set down on it, each with `at` (where its foot goes), `turn` (degrees about the upright), `size`, and optionally
  `phase` (its moves start that share of the loop later, so five of one bamboo don't sway as one), `lit` and `still`.
  `composeScene` (`splat-engine/compose.ts`) turns it into one description, which Diorama draws like any other:
  every style, the weather, the water, time of day.
- In `diorama/scenes.ts` the scene is `described(id, composeScene(PROJECT, madeProp), about, { project: PROJECT })`,
  plus `weather` if it starts under a shared weather. With `project` set, Scene Creator opens the scene as those very
  pieces, and the library tests hold that every piece it names is in the library.

## Taking an existing scene apart and putting it back together

1. **List the things in it.** Group parts that make one thing (a lantern's foot, post, box, panes and cap; a tree's
   limbs, blossom and the petals at its foot). What only belongs to the ground or the water stays in the land.
2. **Look in the library first** (`npm run scene -- --props`, or Scene Creator's Props mode). Reuse a piece that is
   there rather than making another.
3. **Write each missing piece as a prop on the origin.** Move its parts so the point it stands on is `[0, 0, 0]`
   (subtract where it stood). Rename its bones for what they are (`stalk`, `stem`, `pad`). Its lights come with it.
   Where a scene had several of nearly the same thing (five bamboo stalks, fourteen stones), write one, or two
   variants, and set it down several times turned and sized.
4. **Write the land**: the rest of the old description, without the things that are now props. Take out anything the
   shared recipes do (rain, snow, clouds, the moon and stars): those come from the weather and `heavens`.
5. **Write the scene** as a `SceneProject` setting each prop down where it stood (`at` is the old position of its
   foot), and give repeats different `turn`, `size` and `phase`.
6. **Add the pieces to `MADE`** in `props/index.ts`, then `npm run build` and `npm run props` for their cards.
7. **Check it**: `npm test` (every scene builds at every detail with all its parts; a part now buried in another prop
   shows here as "a part caught no grid cell"), and `npm run scene -- scene.blobscape.json --shots out/` to look.

## Building a scene in code, as the page does by hand

`SceneBuilder` (`src/blobscape/creator/build.ts`) does what Scene Creator's modes do, for an assistant or a script:

```ts
import { SceneBuilder } from './src/blobscape/creator/build.ts'

const s = new SceneBuilder('Lantern garden', 'plain-turf')   // a land from the library
s.put('tall-stone-lantern', -0.4, 0.2)                       // stood on the ground there, as a drop in Props mode
s.put('bamboo', 0.5, -0.3, { turn: 40, size: 1.1, phase: 0.3 })
s.at('lily-pad', [0.1, -0.045, 0.5])                         // exactly there, on water
s.light({ live: { hour: 21 } })                              // as Light mode
export default s
```

- `s.project()` is the `.blobscape.json` Scene Creator opens (Scene mode, Open a file) and saves.
- `s.doc()` is the description Diorama draws.
- `npm run scene -- garden.ts --shots out/` reviews a builder, a project file or a description alike and draws it.
- `SceneBuilder.library()` lists every prop and land by id.

The same project format is what Scene Creator's assistant tools (WebMCP, `creator/agentTools.ts`) edit in the page.

## What it can't do yet

- Creatures in a scene made from props open in Scene Creator, but Diorama can't draw them yet (`doc()` refuses).
- Things that ride the land's water (the koi) stay in the land, since water bodies name the land's own bones.
- Falling petals are the land's air, so they don't follow the cherry tree when it is moved in Scene Creator.
