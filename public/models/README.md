# Models served with the site

`depth-anything-v2-small.onnx` is Depth Anything V2 Small, 8-bit quantized ONNX weights
(`onnx/model_quantized.onnx` from https://huggingface.co/onnx-community/depth-anything-v2-small,
converted from https://huggingface.co/depth-anything/Depth-Anything-V2-Small).
License: Apache 2.0 (only the Small model is; the larger ones are not).

Yang, Kang, Huang, Zhao, Xu, Feng, Zhao: "Depth Anything V2", 2024, arXiv:2406.09414.

The sandbox's One photo to a scene runs it in the visitor's browser (ONNX Runtime Web, WebAssembly),
so photos never leave their device.
sha256 fcf51f1b230362b28690bb9d1809bf0431f29cad20534e3f589bd7285547f20d
