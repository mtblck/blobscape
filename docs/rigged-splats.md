# Rigged Gaussian splats in glTF

**Draft, November 2026.** Extension names in files today: `BLOBSCAPE_gaussian_skinning` for bones and `BLOBSCAPE_gaussian_morphs` for morphs. Proposed multi-vendor names: `EXT_gaussian_splatting_skinning` and `EXT_gaussian_splatting_morphing`.

## Why this exists

`KHR_gaussian_splatting` (ratified 2026) stores splats in glTF. It says how a node's transform moves, turns and squashes a splat, but it says nothing about skinning. glTF's own skinning (`JOINTS_0`, `WEIGHTS_0`, a `skin`) only defines where a skinned *point* goes. A splat is a point with a shape, so a file with both is ambiguous. Two viewers can play the same rigged splat file and show different blobs at every joint.

This extension settles that with one rule for how a skinned splat's shape follows its bones. It adds no new data, because everything else is standard glTF. A viewer that doesn't know the extension still opens the file and shows the splats in their bind pose.

Morph targets have the same gap. A glTF morph moves points, and a splat moved without its shape leaves gaps where a surface stretches. The second extension, under [Morphs](#morphs), adds the one thing a splat needs beside each `POSITION` delta: how its shape changes.

## Example

```json
{
  "extensionsUsed": ["KHR_gaussian_splatting", "BLOBSCAPE_gaussian_skinning"],
  "meshes": [{
    "primitives": [{
      "mode": 0,
      "attributes": {
        "POSITION": 0,
        "KHR_gaussian_splatting:SCALE": 1,
        "KHR_gaussian_splatting:ROTATION": 2,
        "KHR_gaussian_splatting:OPACITY": 3,
        "KHR_gaussian_splatting:SH_DEGREE_0_COEF_0": 4,
        "JOINTS_0": 5,
        "WEIGHTS_0": 6
      },
      "extensions": {
        "KHR_gaussian_splatting": {
          "kernel": "ellipse",
          "colorSpace": "srgb_rec709_display",
          "extensions": {
            "BLOBSCAPE_gaussian_skinning": {
              "rotationBlend": "quaternionAverage",
              "scaleBlend": "weightedAverage"
            }
          }
        }
      }
    }]
  }],
  "nodes": [{ "mesh": 0, "skin": 0 }, "… joint nodes …"],
  "skins": [{ "joints": [1, 2, 3], "inverseBindMatrices": 7 }],
  "animations": ["… standard rotation, translation and scale channels on the joint nodes …"]
}
```

The extension object sits inside the `KHR_gaussian_splatting` object, as that spec asks of extensions that build on it. It is listed in `extensionsUsed` and not in `extensionsRequired`.

## The rule

For splat *i* with bind-pose center **p**, rotation **r** (a unit quaternion), scales **s** = (s<sub>x</sub>, s<sub>y</sub>, s<sub>z</sub>), joints *j*<sub>0..3</sub> and weights *w*<sub>0..3</sub> (which sum to 1):

Each joint's skin matrix is the standard glTF one, **M**<sub>j</sub> = global(joint *j*) · inverseBind(*j*). Its upper 3×3 must factor as *k*<sub>j</sub>·**R**<sub>j</sub>, a rotation times a positive *uniform* scale. Let **q**<sub>j</sub> be **R**<sub>j</sub> as a unit quaternion.

**Center.** This is glTF's linear blend, unchanged:

> **p**′ = Σ *w*<sub>j</sub> **M**<sub>j</sub> **p**

**Rotation** (`rotationBlend: "quaternionAverage"`). Align every **q**<sub>j</sub> with the first joint's (flip its sign when their dot product is negative), then:

> **r**′ = normalize(Σ *w*<sub>j</sub> ±**q**<sub>j</sub>) · **r**

**Scale** (`scaleBlend: "weightedAverage"`):

> **s**′ = (Σ *w*<sub>j</sub> *k*<sub>j</sub>) · **s**

The splat's covariance is then built from **r**′ and **s**′ in the usual way: Σ′ = **R**(**r**′) diag(**s**′)² **R**(**r**′)ᵀ.

**Spherical harmonics**, when present, turn by **r**′·**r**⁻¹, the same way `KHR_gaussian_splatting` turns them for a node's rotation.

**Sorting** must use the skinned centers **p**′. A splat's depth changes as it moves.

### Why this rule and not the matrix one

The obvious alternative pushes the covariance through the blended matrix: Σ′ = **A** Σ **A**ᵀ with **A** = Σ *w*<sub>j</sub> **M**<sub>j</sub>(3×3). That's what you get by treating a splat like a mesh vertex. But a blend of two rotations isn't a rotation, so on a twisting joint **A** shrinks, and the splats there flatten into slivers. It's the splat version of linear-blend skinning's "candy-wrapper" collapse, and it's easy to see: the splats on a twisted wrist go see-through. Averaging the rotations keeps every splat the same size and shape as it turns. Blobscape's tests check that on a half-twist, where the matrix rule loses the volume of the joint's splats and this rule keeps it.

Dual quaternion skinning (Spark's default) also keeps splats whole. It moves centers along an arc rather than a straight blend, and on the fox's joints the difference is at most 6 mm. It has no scale, though, so a bone can't grow. This rule keeps glTF's center math, so mesh tools that already skin `POSITION` put splats in the same places, and bones can grow.

### Growing bones

Joints may animate a positive uniform `scale`, which is what lets a tongue or a flame start hidden inside a mouth and grow out. Non-uniform joint scale is undefined, as it is for nodes in `KHR_gaussian_splatting`.

## Morphs

A morph (a blend shape) gives every splat its own small change, and one weight says how much of it to take, so a pufferfish can swell or a tail can bend with no bone at all. In the file a morph is a standard glTF morph target on the splat primitive, keyed by standard `weights` animation channels on the mesh's node. Each target holds two attributes:

- `POSITION`: how far each splat's center moves, as for any glTF morph.
- `BLOBSCAPE_gaussian_morphs:SHAPE`: how the surface round each splat stretches and turns. It is a `MAT3` of floats per splat, **G** = **J** − **I**, where **J** is the morph's local 3×3 map at that splat (stored by columns, as glTF stores every matrix). A splat the morph leaves alone has **G** = 0.

```json
{
  "extensionsUsed": ["KHR_gaussian_splatting", "BLOBSCAPE_gaussian_skinning", "BLOBSCAPE_gaussian_morphs"],
  "meshes": [{
    "primitives": [{
      "mode": 0,
      "attributes": { "POSITION": 0, "…": "the splat and skin attributes, as above" },
      "targets": [
        { "POSITION": 7, "BLOBSCAPE_gaussian_morphs:SHAPE": 8 },
        { "POSITION": 9, "BLOBSCAPE_gaussian_morphs:SHAPE": 10 }
      ],
      "extensions": {
        "KHR_gaussian_splatting": {
          "extensions": {
            "BLOBSCAPE_gaussian_skinning": { "…": "as above" },
            "BLOBSCAPE_gaussian_morphs": {
              "shapeBlend": "linearMap",
              "morphs": [{ "name": "puff", "targets": [0] }, { "name": "tail left", "targets": [1] }]
            }
          }
        }
      }
    }],
    "weights": [0, 0],
    "extras": { "targetNames": ["puff", "tail left"] }
  }],
  "animations": ["… a weights channel on the mesh's node, beside the joints' channels …"]
}
```

The extension object sits inside the `KHR_gaussian_splatting` object, beside the skinning one, and is listed in `extensionsUsed` only. A file may have morphs without a skin.

### The rule

For splat *i* with bind-pose center **p** and covariance Σ, and targets *k* with weights *w*<sub>k</sub>, deltas **d**<sub>k</sub> and shape changes **G**<sub>k</sub>:

> **p**′ = **p** + Σ *w*<sub>k</sub> **d**<sub>k</sub>

> **J** = **I** + Σ *w*<sub>k</sub> **G**<sub>k</sub>, and Σ′ = **J** Σ **J**ᵀ

The morphed splat is then skinned as above, from **p**′ and Σ′ (split back into a rotation and scales). Like `POSITION` deltas, the changes add up, so morphs mix, run backward with a negative weight and overshoot past 1. **J** Σ **J**ᵀ is a real covariance for any weights, so no weight breaks a splat; a weight that makes **J** singular flattens splats to discs, which is what that shape is.

**Spherical harmonics**, when present, turn by the rotation part of **J** (from its polar decomposition). Opacity and color do not morph.

### Why carry the shape

A mesh morph only moves points, and the triangles between them stretch for free. Splats have no triangles. Move just the centers and a spike grown seven times longer is the same few small splats in a dotted line, and a body swollen to twice its size shows the gaps between them. **G** is what lets each splat stretch and turn with the surface under it. It costs nine floats per splat per target, and a target that moves few splats can be a sparse accessor (Blobscape writes one when under half the splats move), so a tail's morph costs the tail.

### In-between shapes

A morph is a straight line, so a part that must travel round something (a lid over an eye) can have in-between shapes. glTF has none, so each in-between is a target of its own, and the extension's `morphs` list says which targets are one morph, in order. With *n* targets, the morph's weight *w* sits between targets ⌊*nw*⌋ − 1 and ⌊*nw*⌋ (−1 being the rest shape), and the file's `weights` channel keys those two targets' shares. A viewer that only knows glTF morphs therefore plays the same centers, and a reader can find the morph's weight again from the last target with any weight. Without the extension, or if its groups don't cover every target once in order, each target is its own morph, named from `extras.targetNames`.

## What a viewer without this extension shows

- **Knows `KHR_gaussian_splatting`, not skinning** (three.js r186's loader): the splats in their bind pose, standing still. Blobscape's verify run checks this.
- **Knows glTF morphs, not ours:** morphed centers with the splats' shapes left as they were, so a stretched surface shows gaps. That's the left fish in Blobscape's [Morphs lesson](https://blobscape.dev/lessons/morphs/).
- **Skins splats its own way:** the same centers, but possibly different shapes at the joints. That's why the rule needs a name.
- **Knows neither:** the `POSITION` points, or nothing.

## Sample files

Here, written by `scripts/rigged-samples.ts`:

- [`fox.glb`](../public/rigged-splats/fox.glb): 4,000 splats, 14 bones, `trot` and `idle`.
- [`frog.glb`](../public/rigged-splats/frog.glb): 4,145 splats, 20 bones, `jump`, `tongue` and `idle`. The tongue is a bone that grows from scale 0, so it's hidden at rest.
- [`puffer.glb`](../public/rigged-splats/puffer.glb): 5,257 splats, 3 bones and 4 morphs (`puff`, `spikes`, `tail left`, `tail right`), with `swim` and `puff` clips that key their weights. Only the puff moves every splat; the other three are sparse.

Larger ones (up to 400k splats, and the 43-bone dragon) come from the Download button on [Splat Creatures](https://blobscape.dev/experiments/creature/).

## Implementations

- **Blobscape's engine** (`src/splat-engine/`): writes and reads these files, and skins on the GPU on WebGPU (a compute pass) or WebGL (in the vertex shader). `rig.ts` `skinBlob` is the reference on the CPU. Morphs are applied on the CPU so far (`morph.ts` `applyMorphs`), before the bones; Splat Creatures opens a file with morphs and plays its clips, or sets each morph by hand while it stands still.
- **Spark 2.4** can play these files through its `SplatSkinning` in either of its modes, if you give every bone an identity rest pose and pass the full skin transform each frame. The engine lab does this (`src/engine-lab/sparkBones.ts`). Spark's linear-blend mode then matches our centers to 1e-4 m. Its dual-quaternion mode agrees on splats held by one bone and is within 6 mm elsewhere on the fox. Neither mode is this rotation rule. With a non-identity rest pose, Spark 2.4 turns bones about the origin rather than their head (`src/engine-lab/sparkSkinning.test.ts` shows it).

## Open questions

- **Name.** `BLOBSCAPE_` is not a registered vendor prefix. If another implementation takes this up, it should become `EXT_gaussian_splatting_skinning`.
- **A `dualQuaternion` value** for `rotationBlend`, so a file can say "play me the way Spark does".
- **Morphs as their own extension.** They are a second extension so a file can have morphs without bones, and a viewer can take one rule without the other. They could fold into one animated-splats extension if others prefer.
- **Smaller shape changes.** Many morphs only move and stretch evenly, where **G** could be a single number. A quantized or symmetric **G** would cut the nine floats; we haven't needed it yet.
