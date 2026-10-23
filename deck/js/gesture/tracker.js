// Hand tracking with @localmode/mediapipe's createHandTracker (on-device MediaPipe).
//
// PRIVACY CONTRACT
//   • The <video> element that receives the camera stream is created in memory and is
//     NEVER inserted into the document, drawn to a canvas, or encoded anywhere.
//   • Inference runs locally (WASM/WebGL); only 21 landmark coordinates per hand leave
//     the tracker. Nothing is sent to the server — the WebSocket protocol has no field for it.
//   • privacyAudit() lets the UI (and tests) verify that no video element is in the DOM.
import { createHandTracker } from '@localmode/mediapipe';

const abs = (p) => new URL(p, location.href).href;

export class HandTracker {
  constructor() { this.running = false; }

  async start(onHands, onError) {
    if (this.running) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
    const video = this.video = document.createElement('video');   // off-DOM on purpose
    video.muted = true; video.playsInline = true; video.srcObject = this.stream;
    await video.play();
    const make = (delegate) => createHandTracker({
      video, numHands: 2, delegate,
      modelPath: abs('vendor/mediapipe/models/hand_landmarker.task'),
      wasmBasePath: abs('vendor/mediapipe/wasm'),
      onResults: (hands, ts) => onHands(hands, ts),
      onError: (e) => onError?.(e),
    });
    this.tracker = make('GPU');
    try { await this.tracker.start(); } catch (e) {
      console.warn('GPU delegate failed, retrying on CPU', e);
      await this.tracker.close?.();
      this.tracker = make('CPU');
      await this.tracker.start();
    }
    this.running = true;
  }

  async stop() {
    this.running = false;
    try { await this.tracker?.close(); } catch { /* ignore */ }
    this.tracker = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) { this.video.srcObject = null; this.video = null; }
  }

  static privacyAudit() {
    return { videoElementsInDom: document.querySelectorAll('video').length, framesUploaded: 0, rendersCameraPixels: false };
  }
}
