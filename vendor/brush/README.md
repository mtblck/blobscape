# Brush, built for the browser

[Brush](https://github.com/ArthurBrussee/brush) is a Gaussian splat trainer written in Rust on WebGPU
(Arthur Brussee and contributors; Apache 2.0, see `LICENSE`). The sandbox's "Train from a capture folder" runs it
in a worker (`src/blobscape/train/train.worker.ts`).

These files are its JavaScript binding, `apps/brush-js`, built from commit
`1388f74c6fe0236f68ee4915564bf00e9d2e3747` with `blobscape.patch`, which does three things:

- adds `Training.exportPly()`, which hands the splats so far back as the bytes of a .ply, through Brush's own
  exporter;
- packs two outputs of the forward projection pass and two of the backward one into shared buffers, so no pass
  binds more than 10 storage buffers. Chrome reports `maxStorageBuffersPerShaderStage` as 10 on many real graphics
  cards, and Brush as it comes binds 12 and 11 in those passes;
- sets CubeCL's autotune level to `full` in the browser, because the lower levels first run a timing probe that
  blocks on the GPU, which WebAssembly cannot do.

- `brush_js.js`, `brush_js.d.ts`: the binding (wasm-bindgen 0.2.128, `--target web`)
- `brush_js_bg.wasm`: the trainer, shrunk with Binaryen (`wasm-opt -Oz --strip-debug --strip-producers`)

## Building it again

Rust 1.88 or later with the `wasm32-unknown-unknown` target, `wasm-bindgen-cli` 0.2.128 and Binaryen's `wasm-opt`:

```sh
git clone https://github.com/ArthurBrussee/brush && cd brush
git checkout 1388f74c6fe0236f68ee4915564bf00e9d2e3747
git apply /path/to/vendor/brush/blobscape.patch
cargo build --release --target wasm32-unknown-unknown -p brush-js
wasm-bindgen target/wasm32-unknown-unknown/release/brush_js.wasm --target web --out-dir pkg
wasm-opt -Oz --strip-debug --strip-producers pkg/brush_js_bg.wasm -o pkg/brush_js_bg.wasm
```

Then copy `pkg/brush_js.js`, `pkg/brush_js.d.ts` and `pkg/brush_js_bg.wasm` here.

Brush's sort uses WebGPU subgroups, which Chrome's software renderer is not given, so the browser checks here stop
at the refusal unless run with `VERIFY_TRAIN=1` on a machine with a real graphics card.
