# Models served with the site

`depth-anything-v2-small.onnx` is Depth Anything V2 Small, 8-bit quantized ONNX weights
(`onnx/model_quantized.onnx` from https://huggingface.co/onnx-community/depth-anything-v2-small,
converted from https://huggingface.co/depth-anything/Depth-Anything-V2-Small).
License: Apache 2.0 (only the Small model is; the larger ones are not).

Yang, Kang, Huang, Zhao, Xu, Feng, Zhao: "Depth Anything V2", 2024, arXiv:2406.09414.

The sandbox's One photo to a scene runs it in the visitor's browser (ONNX Runtime Web, WebAssembly),
so photos never leave their device.
sha256 fcf51f1b230362b28690bb9d1809bf0431f29cad20534e3f589bd7285547f20d

`slimsam-encoder.onnx` and `slimsam-decoder.onnx` are SlimSAM-77 (uniform), a slimmed Segment Anything, 8-bit
quantized ONNX weights (`onnx/vision_encoder_quantized.onnx` and `onnx/prompt_encoder_mask_decoder_quantized.onnx`
from https://huggingface.co/Xenova/slimsam-77-uniform, converted from https://huggingface.co/nielsr/slimsam-77-uniform).
License: Apache 2.0.

Chen, Fang, Wang, Zhu, Wang: "SlimSAM: 0.1% Data Makes Segment Anything Slim", 2023, arXiv:2312.05284.
Kirillov and others: "Segment Anything", 2023, arXiv:2304.02643.

The sandbox's tap to select runs them in the visitor's browser the same way: the view's picture never leaves their device.
sha256 cce23c7b2e5d4f330932738fb67ba518e04b0d99ccdd1cccd22a7da4e01f2971 (encoder)
sha256 cb90b279f549d2cab7fd6e20c38522438c65d84bdcca3d2a764cff7d857fdce2 (decoder)
