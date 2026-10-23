// src/models.ts
var MEDIAPIPE_MODELS = {
  // ─── Vision ────────────────────────────────────────────────────
  hand_landmarker: {
    name: "Hand Landmarker",
    description: "21-point hand landmark detection with handedness.",
    task: "hand_landmarker",
    domain: "vision",
    url: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
    sizeBytes: 7819105,
    size: "7.8MB"
  },
  pose_landmarker: {
    name: "Pose Landmarker (Lite)",
    description: "33-point body pose landmark detection \u2014 lite variant.",
    task: "pose_landmarker",
    domain: "vision",
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    sizeBytes: 5777746,
    size: "5.8MB"
  },
  pose_landmarker_full: {
    name: "Pose Landmarker (Full)",
    description: "33-point body pose landmark detection \u2014 higher accuracy.",
    task: "pose_landmarker",
    domain: "vision",
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
    sizeBytes: 9398198,
    size: "9.4MB"
  },
  face_landmarker: {
    name: "Face Landmarker",
    description: "478-point face mesh detection with optional blendshapes.",
    task: "face_landmarker",
    domain: "vision",
    url: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    sizeBytes: 3758596,
    size: "3.8MB"
  },
  face_detector: {
    name: "Face Detector (BlazeFace)",
    description: "Fast face detection with bounding boxes and 6 keypoints.",
    task: "face_detector",
    domain: "vision",
    url: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
    sizeBytes: 229746,
    size: "230KB"
  },
  gesture_recognizer: {
    name: "Gesture Recognizer",
    description: "Recognizes 8 hand gestures with hand landmarks.",
    task: "gesture_recognizer",
    domain: "vision",
    url: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
    sizeBytes: 8373440,
    size: "8.4MB"
  },
  image_classifier: {
    name: "Image Classifier (EfficientNet-Lite0)",
    description: "General image classification (ImageNet, 1000 classes).",
    task: "image_classifier",
    domain: "vision",
    url: "https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/float32/1/efficientnet_lite0.tflite",
    sizeBytes: 18582189,
    size: "18.6MB"
  },
  object_detector: {
    name: "Object Detector (EfficientDet-Lite0)",
    description: "General object detection (COCO, 80 classes).",
    task: "object_detector",
    domain: "vision",
    url: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
    sizeBytes: 7254339,
    size: "7.3MB"
  },
  image_segmenter: {
    name: "Image Segmenter (Selfie)",
    description: "Selfie / person segmentation masks.",
    task: "image_segmenter",
    domain: "vision",
    url: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite",
    sizeBytes: 249537,
    size: "250KB"
  },
  image_embedder: {
    name: "Image Embedder (MobileNet-V3 Small)",
    description: "Image embedding vectors for similarity search.",
    task: "image_embedder",
    domain: "vision",
    url: "https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite",
    sizeBytes: 4117670,
    size: "4.1MB"
  },
  // ─── Audio ─────────────────────────────────────────────────────
  audio_classifier: {
    name: "Audio Classifier (YAMNet)",
    description: "Environmental audio event classification (521 categories).",
    task: "audio_classifier",
    domain: "audio",
    url: "https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite",
    sizeBytes: 4126810,
    size: "4.1MB"
  },
  // ─── Text ──────────────────────────────────────────────────────
  language_detector: {
    name: "Language Detector",
    description: "Identifies the language of text (110 languages).",
    task: "language_detector",
    domain: "text",
    url: "https://storage.googleapis.com/mediapipe-models/language_detector/language_detector/float32/1/language_detector.tflite",
    sizeBytes: 315294,
    size: "315KB"
  },
  text_embedder: {
    name: "Text Embedder (Universal Sentence Encoder)",
    description: "Semantic text embedding vectors.",
    task: "text_embedder",
    domain: "text",
    url: "https://storage.googleapis.com/mediapipe-models/text_embedder/universal_sentence_encoder/float32/1/universal_sentence_encoder.tflite",
    sizeBytes: 6120274,
    size: "6.1MB"
  }
};
var DEFAULT_MODELS = {
  hand_landmarker: "hand_landmarker",
  pose_landmarker: "pose_landmarker",
  face_landmarker: "face_landmarker",
  face_detector: "face_detector",
  gesture_recognizer: "gesture_recognizer",
  image_classifier: "image_classifier",
  object_detector: "object_detector",
  image_segmenter: "image_segmenter",
  image_embedder: "image_embedder",
  audio_classifier: "audio_classifier",
  language_detector: "language_detector",
  text_embedder: "text_embedder"
};
function getModelEntry(id) {
  return MEDIAPIPE_MODELS[id];
}
function resolveModelUrl(modelIdOrUrl, customPath) {
  if (customPath) {
    return customPath;
  }
  const entry = getModelEntry(modelIdOrUrl);
  if (entry) {
    return entry.url;
  }
  return modelIdOrUrl;
}

// src/implementations/base.ts
import { ModelLoadError } from "@localmode/core";
var LazyMediaPipeTask = class {
  /**
   * @param loader - Async factory that creates the underlying MediaPipe task
   * @param modelId - Model identifier used in error messages
   */
  constructor(loader, modelId) {
    this.loader = loader;
    this.modelId = modelId;
  }
  task = null;
  loadPromise = null;
  /** Whether the task has finished loading. */
  get isLoaded() {
    return this.task !== null;
  }
  /**
   * Get the loaded task, initializing it on first call.
   *
   * @throws {ModelLoadError} If task initialization fails
   */
  async get() {
    if (this.task) {
      return this.task;
    }
    if (this.loadPromise) {
      return this.loadPromise;
    }
    this.loadPromise = (async () => {
      try {
        const task = await this.loader();
        this.task = task;
        return task;
      } catch (error) {
        this.loadPromise = null;
        throw new ModelLoadError(
          this.modelId,
          error instanceof Error ? error : new Error(String(error))
        );
      }
    })();
    return this.loadPromise;
  }
  /** Dispose the underlying task and free WASM resources. */
  close() {
    if (this.task) {
      try {
        this.task.close();
      } catch {
      }
      this.task = null;
      this.loadPromise = null;
    }
  }
};

// src/implementations/hand-landmarker.ts
import { VisionError } from "@localmode/core";

// src/utils.ts
var MEDIAPIPE_CDN_VERSION = "0.10";
function resolveWasmPath(domain, providerSetting, modelSetting) {
  if (modelSetting) {
    return modelSetting;
  }
  if (typeof providerSetting === "string") {
    return providerSetting;
  }
  if (providerSetting && providerSetting[domain]) {
    return providerSetting[domain];
  }
  return `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-${domain}@${MEDIAPIPE_CDN_VERSION}/wasm`;
}
async function toImageSource(input) {
  if (typeof ImageData !== "undefined" && input instanceof ImageData) {
    return input;
  }
  if (input instanceof Blob) {
    return createImageBitmap(input);
  }
  if (input instanceof ArrayBuffer) {
    return createImageBitmap(new Blob([input]));
  }
  if (typeof input === "string") {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Failed to fetch image from "${input}": HTTP ${response.status}`);
    }
    const blob = await response.blob();
    return createImageBitmap(blob);
  }
  throw new Error("Unsupported image input type for MediaPipe");
}
function releaseImageSource(source) {
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    source.close();
  }
}
async function toAudioSamples(input, targetSampleRate = 16e3, inputSampleRate) {
  if (input instanceof Float32Array) {
    return { samples: input, sampleRate: inputSampleRate ?? targetSampleRate };
  }
  const arrayBuffer = input instanceof Blob ? await input.arrayBuffer() : input;
  const AudioCtx = typeof OfflineAudioContext !== "undefined" ? OfflineAudioContext : globalThis.webkitOfflineAudioContext;
  if (!AudioCtx) {
    throw new Error("OfflineAudioContext is not available \u2014 cannot decode audio");
  }
  const decodeCtx = new AudioCtx(1, 1, targetSampleRate);
  const decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
  const offline = new AudioCtx(
    1,
    Math.ceil(decoded.duration * targetSampleRate || 1),
    targetSampleRate
  );
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return { samples: rendered.getChannelData(0), sampleRate: targetSampleRate };
}
function mapLandmark(lm) {
  return {
    x: lm.x,
    y: lm.y,
    z: lm.z,
    ...lm.visibility !== void 0 ? { visibility: lm.visibility } : {}
  };
}

// src/implementations/hand-landmarker.ts
var MediaPipeHandLandmarker = class {
  modelId;
  provider = "mediapipe";
  task;
  constructor(modelId, settings = {}, providerSettings = {}) {
    this.modelId = `mediapipe:${modelId}`;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath("vision", providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? "GPU";
    this.task = new LazyMediaPipeTask(async () => {
      const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(wasmPath);
      return HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: "IMAGE",
        numHands: 2
      });
    }, this.modelId);
  }
  async doDetect(options) {
    const { images, numHands = 2, abortSignal } = options;
    abortSignal?.throwIfAborted();
    const landmarker = await this.task.get();
    abortSignal?.throwIfAborted();
    landmarker.setOptions({ numHands });
    const startTime = performance.now();
    const results = [];
    try {
      for (const image of images) {
        abortSignal?.throwIfAborted();
        const source = await toImageSource(image);
        const raw = landmarker.detect(source);
        releaseImageSource(source);
        const hands = raw.landmarks.map((landmarks, i) => ({
          landmarks: landmarks.map(mapLandmark),
          worldLandmarks: (raw.worldLandmarks[i] ?? []).map(mapLandmark),
          handedness: raw.handedness[i]?.[0]?.categoryName === "Left" ? "Left" : "Right",
          score: raw.handedness[i]?.[0]?.score ?? 0
        }));
        results.push(hands);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new VisionError(
        `Hand landmark detection failed: ${error?.message ?? String(error)}`,
        {
          hint: "Ensure the image is a valid Blob, ImageData, ArrayBuffer, or URL.",
          cause: error instanceof Error ? error : void 0
        }
      );
    }
    return {
      results,
      usage: { durationMs: performance.now() - startTime }
    };
  }
  /** Dispose the underlying MediaPipe task and free WASM resources. */
  close() {
    this.task.close();
  }
};

// src/implementations/pose-landmarker.ts
import { VisionError as VisionError2 } from "@localmode/core";
var MediaPipePoseLandmarker = class {
  modelId;
  provider = "mediapipe";
  task;
  constructor(modelId, settings = {}, providerSettings = {}) {
    this.modelId = `mediapipe:${modelId}`;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath("vision", providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? "GPU";
    this.task = new LazyMediaPipeTask(async () => {
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(wasmPath);
      return PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: "IMAGE",
        numPoses: 1
      });
    }, this.modelId);
  }
  async doDetect(options) {
    const { images, numPoses = 1, abortSignal } = options;
    abortSignal?.throwIfAborted();
    const landmarker = await this.task.get();
    abortSignal?.throwIfAborted();
    landmarker.setOptions({ numPoses });
    const startTime = performance.now();
    const results = [];
    try {
      for (const image of images) {
        abortSignal?.throwIfAborted();
        const source = await toImageSource(image);
        const raw = landmarker.detect(source);
        releaseImageSource(source);
        const poses = raw.landmarks.map((landmarks, i) => ({
          landmarks: landmarks.map(mapLandmark),
          worldLandmarks: (raw.worldLandmarks[i] ?? []).map(mapLandmark),
          score: landmarks.length > 0 ? landmarks.reduce((sum, l) => sum + (l.visibility ?? 0), 0) / landmarks.length : 0
        }));
        results.push(poses);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new VisionError2(
        `Pose landmark detection failed: ${error?.message ?? String(error)}`,
        {
          hint: "Ensure the image is a valid Blob, ImageData, ArrayBuffer, or URL.",
          cause: error instanceof Error ? error : void 0
        }
      );
    }
    return {
      results,
      usage: { durationMs: performance.now() - startTime }
    };
  }
  /** Dispose the underlying MediaPipe task and free WASM resources. */
  close() {
    this.task.close();
  }
};

// src/implementations/face-detector.ts
import { VisionError as VisionError3 } from "@localmode/core";
var FACE_KEYPOINT_NAMES = [
  "rightEye",
  "leftEye",
  "noseTip",
  "mouthCenter",
  "rightEarTragion",
  "leftEarTragion"
];
var MediaPipeFaceDetector = class {
  modelId;
  provider = "mediapipe";
  task;
  constructor(modelId, settings = {}, providerSettings = {}) {
    this.modelId = `mediapipe:${modelId}`;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath("vision", providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? "GPU";
    this.task = new LazyMediaPipeTask(async () => {
      const { FilesetResolver, FaceDetector } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(wasmPath);
      return FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: "IMAGE"
      });
    }, this.modelId);
  }
  async doDetect(options) {
    const { images, minDetectionConfidence, abortSignal } = options;
    abortSignal?.throwIfAborted();
    const detector = await this.task.get();
    abortSignal?.throwIfAborted();
    if (minDetectionConfidence !== void 0) {
      detector.setOptions({ minDetectionConfidence });
    }
    const startTime = performance.now();
    const results = [];
    try {
      for (const image of images) {
        abortSignal?.throwIfAborted();
        const source = await toImageSource(image);
        const raw = detector.detect(source);
        releaseImageSource(source);
        const faces = raw.detections.map((det) => {
          const keypoints = (det.keypoints ?? []).map((kp, i) => ({
            x: kp.x,
            y: kp.y,
            name: kp.label ?? FACE_KEYPOINT_NAMES[i] ?? `keypoint${i}`
          }));
          return {
            box: {
              x: det.boundingBox?.originX ?? 0,
              y: det.boundingBox?.originY ?? 0,
              width: det.boundingBox?.width ?? 0,
              height: det.boundingBox?.height ?? 0
            },
            score: det.categories[0]?.score ?? 0,
            keypoints
          };
        });
        faces.sort((a, b) => b.score - a.score);
        results.push(faces);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new VisionError3(
        `Face detection failed: ${error?.message ?? String(error)}`,
        {
          hint: "Ensure the image is a valid Blob, ImageData, ArrayBuffer, or URL.",
          cause: error instanceof Error ? error : void 0
        }
      );
    }
    return {
      results,
      usage: { durationMs: performance.now() - startTime }
    };
  }
  /** Dispose the underlying MediaPipe task and free WASM resources. */
  close() {
    this.task.close();
  }
};

// src/implementations/face-landmarker.ts
import { VisionError as VisionError4 } from "@localmode/core";
var MediaPipeFaceLandmarker = class {
  modelId;
  provider = "mediapipe";
  task;
  constructor(modelId, settings = {}, providerSettings = {}) {
    this.modelId = `mediapipe:${modelId}`;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath("vision", providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? "GPU";
    this.task = new LazyMediaPipeTask(async () => {
      const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(wasmPath);
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: "IMAGE",
        numFaces: 1
      });
    }, this.modelId);
  }
  async doDetect(options) {
    const { images, numFaces = 1, outputBlendshapes = false, abortSignal } = options;
    abortSignal?.throwIfAborted();
    const landmarker = await this.task.get();
    abortSignal?.throwIfAborted();
    landmarker.setOptions({ numFaces, outputFaceBlendshapes: outputBlendshapes });
    const startTime = performance.now();
    const results = [];
    try {
      for (const image of images) {
        abortSignal?.throwIfAborted();
        const source = await toImageSource(image);
        const raw = landmarker.detect(source);
        releaseImageSource(source);
        const faces = raw.faceLandmarks.map((landmarks, i) => {
          const item = {
            landmarks: landmarks.map(mapLandmark),
            score: 1
          };
          if (outputBlendshapes && raw.faceBlendshapes[i]) {
            const blendshapes = raw.faceBlendshapes[i].categories.map(
              (c) => ({ categoryName: c.categoryName, score: c.score })
            );
            item.blendshapes = blendshapes;
          }
          return item;
        });
        results.push(faces);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new VisionError4(
        `Face landmark detection failed: ${error?.message ?? String(error)}`,
        {
          hint: "Ensure the image is a valid Blob, ImageData, ArrayBuffer, or URL.",
          cause: error instanceof Error ? error : void 0
        }
      );
    }
    return {
      results,
      usage: { durationMs: performance.now() - startTime }
    };
  }
  /** Dispose the underlying MediaPipe task and free WASM resources. */
  close() {
    this.task.close();
  }
};

// src/implementations/gesture-recognizer.ts
import { VisionError as VisionError5 } from "@localmode/core";
var MediaPipeGestureRecognizer = class {
  modelId;
  provider = "mediapipe";
  task;
  constructor(modelId, settings = {}, providerSettings = {}) {
    this.modelId = `mediapipe:${modelId}`;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath("vision", providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? "GPU";
    this.task = new LazyMediaPipeTask(async () => {
      const { FilesetResolver, GestureRecognizer } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(wasmPath);
      return GestureRecognizer.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: "IMAGE",
        numHands: 2
      });
    }, this.modelId);
  }
  async doRecognize(options) {
    const { images, numHands = 2, abortSignal } = options;
    abortSignal?.throwIfAborted();
    const recognizer = await this.task.get();
    abortSignal?.throwIfAborted();
    recognizer.setOptions({ numHands });
    const startTime = performance.now();
    const results = [];
    try {
      for (const image of images) {
        abortSignal?.throwIfAborted();
        const source = await toImageSource(image);
        const raw = recognizer.recognize(source);
        releaseImageSource(source);
        const gestures = raw.landmarks.map((landmarks, i) => ({
          gesture: raw.gestures[i]?.[0]?.categoryName ?? "None",
          score: raw.gestures[i]?.[0]?.score ?? 0,
          handedness: raw.handedness[i]?.[0]?.categoryName === "Left" ? "Left" : "Right",
          landmarks: landmarks.map(mapLandmark)
        }));
        results.push(gestures);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new VisionError5(
        `Gesture recognition failed: ${error?.message ?? String(error)}`,
        {
          hint: "Ensure the image is a valid Blob, ImageData, ArrayBuffer, or URL.",
          cause: error instanceof Error ? error : void 0
        }
      );
    }
    return {
      results,
      usage: { durationMs: performance.now() - startTime }
    };
  }
  /** Dispose the underlying MediaPipe task and free WASM resources. */
  close() {
    this.task.close();
  }
};

// src/implementations/image-classifier.ts
import { VisionError as VisionError6 } from "@localmode/core";
var MediaPipeImageClassifier = class {
  modelId;
  provider = "mediapipe";
  task;
  constructor(modelId, settings = {}, providerSettings = {}) {
    this.modelId = `mediapipe:${modelId}`;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath("vision", providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? "GPU";
    this.task = new LazyMediaPipeTask(async () => {
      const { FilesetResolver, ImageClassifier } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(wasmPath);
      return ImageClassifier.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: "IMAGE"
      });
    }, this.modelId);
  }
  async doClassify(options) {
    const { images, topK, abortSignal } = options;
    abortSignal?.throwIfAborted();
    const classifier = await this.task.get();
    abortSignal?.throwIfAborted();
    if (topK !== void 0) {
      classifier.setOptions({ maxResults: topK });
    }
    const startTime = performance.now();
    const results = [];
    try {
      for (const image of images) {
        abortSignal?.throwIfAborted();
        const source = await toImageSource(image);
        const raw = classifier.classify(source);
        releaseImageSource(source);
        const categories = raw.classifications[0]?.categories ?? [];
        results.push(
          categories.map((c) => ({
            label: c.categoryName || c.displayName || `class_${c.index}`,
            score: c.score
          }))
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new VisionError6(
        `Image classification failed: ${error?.message ?? String(error)}`,
        {
          hint: "Ensure the image is a valid Blob, ImageData, ArrayBuffer, or URL.",
          cause: error instanceof Error ? error : void 0
        }
      );
    }
    return {
      results,
      usage: { durationMs: performance.now() - startTime }
    };
  }
  /** Dispose the underlying MediaPipe task and free WASM resources. */
  close() {
    this.task.close();
  }
};

// src/implementations/object-detector.ts
import { VisionError as VisionError7 } from "@localmode/core";
var MediaPipeObjectDetector = class {
  modelId;
  provider = "mediapipe";
  task;
  constructor(modelId, settings = {}, providerSettings = {}) {
    this.modelId = `mediapipe:${modelId}`;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath("vision", providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? "GPU";
    this.task = new LazyMediaPipeTask(async () => {
      const { FilesetResolver, ObjectDetector } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(wasmPath);
      return ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: "IMAGE"
      });
    }, this.modelId);
  }
  async doDetect(options) {
    const { images, threshold, abortSignal } = options;
    abortSignal?.throwIfAborted();
    const detector = await this.task.get();
    abortSignal?.throwIfAborted();
    if (threshold !== void 0) {
      detector.setOptions({ scoreThreshold: threshold });
    }
    const startTime = performance.now();
    const results = [];
    try {
      for (const image of images) {
        abortSignal?.throwIfAborted();
        const source = await toImageSource(image);
        const raw = detector.detect(source);
        releaseImageSource(source);
        const objects = raw.detections.map((det) => ({
          label: det.categories[0]?.categoryName || det.categories[0]?.displayName || "object",
          score: det.categories[0]?.score ?? 0,
          box: {
            x: det.boundingBox?.originX ?? 0,
            y: det.boundingBox?.originY ?? 0,
            width: det.boundingBox?.width ?? 0,
            height: det.boundingBox?.height ?? 0
          }
        }));
        results.push({ objects });
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new VisionError7(
        `Object detection failed: ${error?.message ?? String(error)}`,
        {
          hint: "Ensure the image is a valid Blob, ImageData, ArrayBuffer, or URL.",
          cause: error instanceof Error ? error : void 0
        }
      );
    }
    return {
      results,
      usage: { durationMs: performance.now() - startTime }
    };
  }
  /** Dispose the underlying MediaPipe task and free WASM resources. */
  close() {
    this.task.close();
  }
};

// src/implementations/image-segmenter.ts
import { VisionError as VisionError8 } from "@localmode/core";
var MediaPipeImageSegmenter = class {
  modelId;
  provider = "mediapipe";
  segmentationType = "semantic";
  task;
  constructor(modelId, settings = {}, providerSettings = {}) {
    this.modelId = `mediapipe:${modelId}`;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath("vision", providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? "GPU";
    this.task = new LazyMediaPipeTask(async () => {
      const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(wasmPath);
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: "IMAGE",
        outputConfidenceMasks: true,
        outputCategoryMask: true
      });
    }, this.modelId);
  }
  async doSegment(options) {
    const { images, abortSignal } = options;
    abortSignal?.throwIfAborted();
    const segmenter = await this.task.get();
    abortSignal?.throwIfAborted();
    const startTime = performance.now();
    const results = [];
    try {
      for (const image of images) {
        abortSignal?.throwIfAborted();
        const source = await toImageSource(image);
        const raw = segmenter.segment(source);
        releaseImageSource(source);
        const masks = [];
        if (raw.categoryMask) {
          masks.push({
            label: "category",
            score: 1,
            mask: raw.categoryMask.getAsUint8Array()
          });
        }
        if (raw.confidenceMasks) {
          raw.confidenceMasks.forEach((mpMask, i) => {
            const floats = mpMask.getAsFloat32Array();
            const bytes = new Uint8Array(floats.length);
            for (let p = 0; p < floats.length; p++) {
              bytes[p] = Math.round(Math.min(1, Math.max(0, floats[p])) * 255);
            }
            masks.push({ label: `confidence_${i}`, score: 1, mask: bytes });
          });
        }
        raw.close();
        results.push({ masks });
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new VisionError8(
        `Image segmentation failed: ${error?.message ?? String(error)}`,
        {
          hint: "Ensure the image is a valid Blob, ImageData, ArrayBuffer, or URL.",
          cause: error instanceof Error ? error : void 0
        }
      );
    }
    return {
      results,
      usage: { durationMs: performance.now() - startTime }
    };
  }
  /** Dispose the underlying MediaPipe task and free WASM resources. */
  close() {
    this.task.close();
  }
};

// src/implementations/image-embedder.ts
import { VisionError as VisionError9 } from "@localmode/core";
var DEFAULT_DIMENSIONS = 1024;
var MediaPipeImageEmbedder = class {
  modelId;
  provider = "mediapipe";
  dimensions;
  task;
  constructor(modelId, settings = {}, providerSettings = {}) {
    this.modelId = `mediapipe:${modelId}`;
    this.dimensions = DEFAULT_DIMENSIONS;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath("vision", providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? "GPU";
    this.task = new LazyMediaPipeTask(async () => {
      const { FilesetResolver, ImageEmbedder } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(wasmPath);
      return ImageEmbedder.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: "IMAGE"
      });
    }, this.modelId);
  }
  async doExtract(options) {
    const { images, abortSignal } = options;
    abortSignal?.throwIfAborted();
    const embedder = await this.task.get();
    abortSignal?.throwIfAborted();
    const startTime = performance.now();
    const features = [];
    try {
      for (const image of images) {
        abortSignal?.throwIfAborted();
        const source = await toImageSource(image);
        const raw = embedder.embed(source);
        releaseImageSource(source);
        const floatEmbedding = raw.embeddings[0]?.floatEmbedding ?? [];
        features.push(Float32Array.from(floatEmbedding));
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new VisionError9(
        `Image feature extraction failed: ${error?.message ?? String(error)}`,
        {
          hint: "Ensure the image is a valid Blob, ImageData, ArrayBuffer, or URL.",
          cause: error instanceof Error ? error : void 0
        }
      );
    }
    return {
      features,
      usage: { durationMs: performance.now() - startTime }
    };
  }
  /** Dispose the underlying MediaPipe task and free WASM resources. */
  close() {
    this.task.close();
  }
};

// src/implementations/audio-classifier.ts
import { AudioError } from "@localmode/core";
var YAMNET_SAMPLE_RATE = 16e3;
var MediaPipeAudioClassifier = class {
  modelId;
  provider = "mediapipe";
  task;
  constructor(modelId, settings = {}, providerSettings = {}) {
    this.modelId = `mediapipe:${modelId}`;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath("audio", providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? "GPU";
    this.task = new LazyMediaPipeTask(async () => {
      const { FilesetResolver, AudioClassifier } = await import("@mediapipe/tasks-audio");
      const fileset = await FilesetResolver.forAudioTasks(wasmPath);
      return AudioClassifier.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate }
      });
    }, this.modelId);
  }
  async doClassify(options) {
    const { audio, topK = 5, abortSignal } = options;
    abortSignal?.throwIfAborted();
    const classifier = await this.task.get();
    abortSignal?.throwIfAborted();
    const startTime = performance.now();
    const results = [];
    try {
      for (const clip of audio) {
        abortSignal?.throwIfAborted();
        const { samples } = await toAudioSamples(clip, YAMNET_SAMPLE_RATE);
        const frameResults = classifier.classify(samples, YAMNET_SAMPLE_RATE);
        const totals = /* @__PURE__ */ new Map();
        for (const frame of frameResults) {
          for (const category of frame.classifications[0]?.categories ?? []) {
            const label = category.categoryName || category.displayName || `class_${category.index}`;
            const entry = totals.get(label) ?? { sum: 0, count: 0 };
            entry.sum += category.score;
            entry.count += 1;
            totals.set(label, entry);
          }
        }
        const frameCount = Math.max(frameResults.length, 1);
        const predictions = [...totals.entries()].map(([label, { sum }]) => ({ label, score: sum / frameCount })).sort((a, b) => b.score - a.score).slice(0, topK);
        results.push(predictions);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new AudioError(
        `Audio classification failed: ${error?.message ?? String(error)}`,
        {
          hint: "Ensure the audio is a valid Blob, ArrayBuffer, or Float32Array of PCM samples.",
          cause: error instanceof Error ? error : void 0
        }
      );
    }
    return {
      results,
      usage: { durationMs: performance.now() - startTime }
    };
  }
  /** Dispose the underlying MediaPipe task and free WASM resources. */
  close() {
    this.task.close();
  }
};

// src/implementations/text-classifier.ts
import { ValidationError } from "@localmode/core";
var MediaPipeTextClassifier = class {
  modelId;
  provider = "mediapipe";
  /** Labels are model-defined and not known until inference returns them. */
  labels = [];
  task;
  constructor(modelPath, settings = {}, providerSettings = {}) {
    if (!modelPath) {
      throw new ValidationError(
        "MediaPipe text classification requires a custom-trained model.",
        'MediaPipe ships no default text classifier. Train one with MediaPipe Model Maker and pass its .tflite URL: mediapipe.textClassifier("https://your-cdn/model.tflite").'
      );
    }
    this.modelId = `mediapipe:text-classifier`;
    const wasmPath = resolveWasmPath("text", providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? "GPU";
    this.task = new LazyMediaPipeTask(async () => {
      const { FilesetResolver, TextClassifier } = await import("@mediapipe/tasks-text");
      const fileset = await FilesetResolver.forTextTasks(wasmPath);
      return TextClassifier.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelPath, delegate }
      });
    }, this.modelId);
  }
  async doClassify(options) {
    const { texts, abortSignal } = options;
    abortSignal?.throwIfAborted();
    const classifier = await this.task.get();
    abortSignal?.throwIfAborted();
    const startTime = performance.now();
    const results = [];
    try {
      for (const text of texts) {
        abortSignal?.throwIfAborted();
        const raw = classifier.classify(text);
        const categories = raw.classifications[0]?.categories ?? [];
        const sorted = [...categories].sort((a, b) => b.score - a.score);
        const top = sorted[0];
        const allScores = {};
        for (const c of categories) {
          allScores[c.categoryName || c.displayName || `class_${c.index}`] = c.score;
        }
        results.push({
          label: top?.categoryName || top?.displayName || "unknown",
          score: top?.score ?? 0,
          allScores
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw error;
    }
    return {
      results,
      usage: { inputTokens: 0, durationMs: performance.now() - startTime }
    };
  }
  /** Dispose the underlying MediaPipe task and free WASM resources. */
  close() {
    this.task.close();
  }
};

// src/implementations/text-embedder.ts
import { EmbeddingError } from "@localmode/core";
var DEFAULT_DIMENSIONS2 = 100;
var MediaPipeTextEmbedder = class {
  modelId;
  provider = "mediapipe";
  dimensions;
  maxEmbeddingsPerCall = void 0;
  supportsParallelCalls = false;
  task;
  constructor(modelId, settings = {}, providerSettings = {}) {
    this.modelId = `mediapipe:${modelId}`;
    this.dimensions = DEFAULT_DIMENSIONS2;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath("text", providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? "GPU";
    this.task = new LazyMediaPipeTask(async () => {
      const { FilesetResolver, TextEmbedder } = await import("@mediapipe/tasks-text");
      const fileset = await FilesetResolver.forTextTasks(wasmPath);
      return TextEmbedder.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate }
      });
    }, this.modelId);
  }
  async doEmbed(options) {
    const { values, abortSignal } = options;
    abortSignal?.throwIfAborted();
    const embedder = await this.task.get();
    abortSignal?.throwIfAborted();
    const embeddings = [];
    try {
      for (const value of values) {
        abortSignal?.throwIfAborted();
        const raw = embedder.embed(value);
        const floatEmbedding = raw.embeddings[0]?.floatEmbedding ?? [];
        embeddings.push(Float32Array.from(floatEmbedding));
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new EmbeddingError(
        `Text embedding failed: ${error?.message ?? String(error)}`,
        {
          hint: "Ensure the input values are non-empty strings.",
          cause: error instanceof Error ? error : void 0
        }
      );
    }
    return {
      embeddings,
      usage: { tokens: 0 },
      response: {
        modelId: this.modelId,
        timestamp: /* @__PURE__ */ new Date()
      }
    };
  }
  /** Dispose the underlying MediaPipe task and free WASM resources. */
  close() {
    this.task.close();
  }
};

// src/implementations/language-detector.ts
import { TranslationError } from "@localmode/core";
var MediaPipeLanguageDetector = class {
  modelId;
  provider = "mediapipe";
  task;
  constructor(modelId, settings = {}, providerSettings = {}) {
    this.modelId = `mediapipe:${modelId}`;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath("text", providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? "GPU";
    this.task = new LazyMediaPipeTask(async () => {
      const { FilesetResolver, LanguageDetector } = await import("@mediapipe/tasks-text");
      const fileset = await FilesetResolver.forTextTasks(wasmPath);
      return LanguageDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate }
      });
    }, this.modelId);
  }
  async doDetect(options) {
    const { text, abortSignal } = options;
    abortSignal?.throwIfAborted();
    const detector = await this.task.get();
    abortSignal?.throwIfAborted();
    const startTime = performance.now();
    try {
      const raw = detector.detect(text);
      const languages = raw.languages.map((l) => ({
        languageCode: l.languageCode,
        confidence: l.probability
      }));
      return {
        languages,
        usage: { durationMs: performance.now() - startTime }
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new TranslationError(
        `Language detection failed: ${error?.message ?? String(error)}`,
        {
          hint: "Ensure the input text is a non-empty string.",
          cause: error instanceof Error ? error : void 0
        }
      );
    }
  }
  /** Dispose the underlying MediaPipe task and free WASM resources. */
  close() {
    this.task.close();
  }
};

// src/streaming/tracker-base.ts
import { ModelLoadError as ModelLoadError2 } from "@localmode/core";
var StreamingTracker = class {
  /**
   * @param video - Video element to read frames from
   * @param modelId - Model identifier used in error messages
   * @param onError - Optional per-frame error callback
   */
  constructor(video, modelId, onError) {
    this.video = video;
    this.modelId = modelId;
    this.onError = onError;
  }
  task = null;
  rafId = null;
  lastVideoTime = -1;
  running = false;
  get isRunning() {
    return this.running;
  }
  async start() {
    if (this.running) {
      return;
    }
    if (!this.task) {
      try {
        this.task = await this.loadTask();
      } catch (error) {
        throw new ModelLoadError2(
          this.modelId,
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }
    this.running = true;
    this.loop();
  }
  loop = () => {
    if (!this.running || !this.task) {
      return;
    }
    try {
      if (this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = this.video.currentTime;
        this.processFrame(this.task, performance.now());
      }
    } catch (error) {
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
    this.rafId = requestAnimationFrame(this.loop);
  };
  stop() {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
  async close() {
    this.stop();
    if (this.task) {
      try {
        this.task.close();
      } catch {
      }
      this.task = null;
    }
  }
};

// src/streaming/hand-tracker.ts
var HandStreamingTracker = class extends StreamingTracker {
  constructor(options) {
    super(options.video, "mediapipe:hand_landmarker", options.onError);
    this.options = options;
  }
  async loadTask() {
    const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
    const wasmPath = resolveWasmPath("vision", this.options.wasmBasePath);
    const fileset = await FilesetResolver.forVisionTasks(wasmPath);
    return HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: resolveModelUrl(DEFAULT_MODELS.hand_landmarker, this.options.modelPath),
        delegate: this.options.delegate ?? "GPU"
      },
      runningMode: "VIDEO",
      numHands: this.options.numHands ?? 2
    });
  }
  processFrame(task, timestampMs) {
    const raw = task.detectForVideo(this.video, timestampMs);
    const hands = raw.landmarks.map((landmarks, i) => ({
      landmarks: landmarks.map(mapLandmark),
      worldLandmarks: (raw.worldLandmarks[i] ?? []).map(mapLandmark),
      handedness: raw.handedness[i]?.[0]?.categoryName === "Left" ? "Left" : "Right",
      score: raw.handedness[i]?.[0]?.score ?? 0
    }));
    this.options.onResults(hands, timestampMs);
  }
};
function createHandTracker(options) {
  return new HandStreamingTracker(options);
}

// src/streaming/pose-tracker.ts
var PoseStreamingTracker = class extends StreamingTracker {
  constructor(options) {
    super(options.video, "mediapipe:pose_landmarker", options.onError);
    this.options = options;
  }
  async loadTask() {
    const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const wasmPath = resolveWasmPath("vision", this.options.wasmBasePath);
    const fileset = await FilesetResolver.forVisionTasks(wasmPath);
    return PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: resolveModelUrl(DEFAULT_MODELS.pose_landmarker, this.options.modelPath),
        delegate: this.options.delegate ?? "GPU"
      },
      runningMode: "VIDEO",
      numPoses: this.options.numPoses ?? 1
    });
  }
  processFrame(task, timestampMs) {
    const raw = task.detectForVideo(this.video, timestampMs);
    const poses = raw.landmarks.map((landmarks, i) => ({
      landmarks: landmarks.map(mapLandmark),
      worldLandmarks: (raw.worldLandmarks[i] ?? []).map(mapLandmark),
      score: landmarks.length > 0 ? landmarks.reduce((sum, l) => sum + (l.visibility ?? 0), 0) / landmarks.length : 0
    }));
    this.options.onResults(poses, timestampMs);
  }
};
function createPoseTracker(options) {
  return new PoseStreamingTracker(options);
}

// src/streaming/face-tracker.ts
var FaceStreamingTracker = class extends StreamingTracker {
  constructor(options) {
    super(options.video, "mediapipe:face_landmarker", options.onError);
    this.options = options;
  }
  async loadTask() {
    const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision");
    const wasmPath = resolveWasmPath("vision", this.options.wasmBasePath);
    const fileset = await FilesetResolver.forVisionTasks(wasmPath);
    return FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: resolveModelUrl(DEFAULT_MODELS.face_landmarker, this.options.modelPath),
        delegate: this.options.delegate ?? "GPU"
      },
      runningMode: "VIDEO",
      numFaces: this.options.numFaces ?? 1,
      outputFaceBlendshapes: this.options.outputBlendshapes ?? false
    });
  }
  processFrame(task, timestampMs) {
    const raw = task.detectForVideo(this.video, timestampMs);
    const faces = raw.faceLandmarks.map((landmarks, i) => {
      const item = {
        landmarks: landmarks.map(mapLandmark),
        score: 1
      };
      if (this.options.outputBlendshapes && raw.faceBlendshapes[i]) {
        const blendshapes = raw.faceBlendshapes[i].categories.map((c) => ({
          categoryName: c.categoryName,
          score: c.score
        }));
        item.blendshapes = blendshapes;
      }
      return item;
    });
    this.options.onResults(faces, timestampMs);
  }
};
function createFaceTracker(options) {
  return new FaceStreamingTracker(options);
}

// src/streaming/gesture-tracker.ts
var GestureStreamingTracker = class extends StreamingTracker {
  constructor(options) {
    super(options.video, "mediapipe:gesture_recognizer", options.onError);
    this.options = options;
  }
  async loadTask() {
    const { FilesetResolver, GestureRecognizer } = await import("@mediapipe/tasks-vision");
    const wasmPath = resolveWasmPath("vision", this.options.wasmBasePath);
    const fileset = await FilesetResolver.forVisionTasks(wasmPath);
    return GestureRecognizer.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: resolveModelUrl(
          DEFAULT_MODELS.gesture_recognizer,
          this.options.modelPath
        ),
        delegate: this.options.delegate ?? "GPU"
      },
      runningMode: "VIDEO",
      numHands: this.options.numHands ?? 2
    });
  }
  processFrame(task, timestampMs) {
    const raw = task.recognizeForVideo(this.video, timestampMs);
    const gestures = raw.landmarks.map((landmarks, i) => ({
      gesture: raw.gestures[i]?.[0]?.categoryName ?? "None",
      score: raw.gestures[i]?.[0]?.score ?? 0,
      handedness: raw.handedness[i]?.[0]?.categoryName === "Left" ? "Left" : "Right",
      landmarks: landmarks.map(mapLandmark)
    }));
    this.options.onResults(gestures, timestampMs);
  }
};
function createGestureTracker(options) {
  return new GestureStreamingTracker(options);
}

// src/provider.ts
function trackerWasmPath(providerSettings, optionPath) {
  return optionPath ?? resolveWasmPath("vision", providerSettings.wasmBasePath);
}
function createMediaPipe(settings = {}) {
  return {
    // ─── Vision: landmarks & gestures ────────────────────────────
    handLandmarker(modelId = DEFAULT_MODELS.hand_landmarker, modelSettings) {
      return new MediaPipeHandLandmarker(modelId, modelSettings, settings);
    },
    poseLandmarker(modelId = DEFAULT_MODELS.pose_landmarker, modelSettings) {
      return new MediaPipePoseLandmarker(modelId, modelSettings, settings);
    },
    faceLandmarker(modelId = DEFAULT_MODELS.face_landmarker, modelSettings) {
      return new MediaPipeFaceLandmarker(modelId, modelSettings, settings);
    },
    faceDetector(modelId = DEFAULT_MODELS.face_detector, modelSettings) {
      return new MediaPipeFaceDetector(modelId, modelSettings, settings);
    },
    gestureRecognizer(modelId = DEFAULT_MODELS.gesture_recognizer, modelSettings) {
      return new MediaPipeGestureRecognizer(modelId, modelSettings, settings);
    },
    // ─── Vision: existing core interfaces ────────────────────────
    imageClassifier(modelId = DEFAULT_MODELS.image_classifier, modelSettings) {
      return new MediaPipeImageClassifier(modelId, modelSettings, settings);
    },
    objectDetector(modelId = DEFAULT_MODELS.object_detector, modelSettings) {
      return new MediaPipeObjectDetector(modelId, modelSettings, settings);
    },
    imageSegmenter(modelId = DEFAULT_MODELS.image_segmenter, modelSettings) {
      return new MediaPipeImageSegmenter(modelId, modelSettings, settings);
    },
    imageEmbedder(modelId = DEFAULT_MODELS.image_embedder, modelSettings) {
      return new MediaPipeImageEmbedder(modelId, modelSettings, settings);
    },
    // ─── Audio ───────────────────────────────────────────────────
    audioClassifier(modelId = DEFAULT_MODELS.audio_classifier, modelSettings) {
      return new MediaPipeAudioClassifier(modelId, modelSettings, settings);
    },
    // ─── Text ────────────────────────────────────────────────────
    textClassifier(modelPath, modelSettings) {
      return new MediaPipeTextClassifier(modelPath, modelSettings, settings);
    },
    textEmbedder(modelId = DEFAULT_MODELS.text_embedder, modelSettings) {
      return new MediaPipeTextEmbedder(modelId, modelSettings, settings);
    },
    languageDetector(modelId = DEFAULT_MODELS.language_detector, modelSettings) {
      return new MediaPipeLanguageDetector(modelId, modelSettings, settings);
    },
    // ─── Streaming (vision, provider-specific) ───────────────────
    createHandTracker(options) {
      return createHandTracker({
        ...options,
        wasmBasePath: trackerWasmPath(settings, options.wasmBasePath),
        delegate: options.delegate ?? settings.delegate
      });
    },
    createPoseTracker(options) {
      return createPoseTracker({
        ...options,
        wasmBasePath: trackerWasmPath(settings, options.wasmBasePath),
        delegate: options.delegate ?? settings.delegate
      });
    },
    createFaceTracker(options) {
      return createFaceTracker({
        ...options,
        wasmBasePath: trackerWasmPath(settings, options.wasmBasePath),
        delegate: options.delegate ?? settings.delegate
      });
    },
    createGestureTracker(options) {
      return createGestureTracker({
        ...options,
        wasmBasePath: trackerWasmPath(settings, options.wasmBasePath),
        delegate: options.delegate ?? settings.delegate
      });
    }
  };
}
var mediapipe = createMediaPipe();
export {
  DEFAULT_MODELS,
  MEDIAPIPE_MODELS,
  MediaPipeAudioClassifier,
  MediaPipeFaceDetector,
  MediaPipeFaceLandmarker,
  MediaPipeGestureRecognizer,
  MediaPipeHandLandmarker,
  MediaPipeImageClassifier,
  MediaPipeImageEmbedder,
  MediaPipeImageSegmenter,
  MediaPipeLanguageDetector,
  MediaPipeObjectDetector,
  MediaPipePoseLandmarker,
  MediaPipeTextClassifier,
  MediaPipeTextEmbedder,
  createFaceTracker,
  createGestureTracker,
  createHandTracker,
  createMediaPipe,
  createPoseTracker,
  getModelEntry,
  mediapipe,
  resolveModelUrl
};
//# sourceMappingURL=index.js.map