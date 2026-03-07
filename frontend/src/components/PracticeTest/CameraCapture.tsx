import { useEffect, useRef, useState } from 'react';

// Touch/mobile detection — used to choose native camera vs getUserMedia
const isMobile =
  typeof navigator !== 'undefined' &&
  (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1);

type Props = {
  previewUrl: string | null;
  onCapture: (base64: string, previewUrl: string) => void;
  onClear: () => void;
};

/**
 * Unified photo capture for subjective questions.
 *
 * Desktop: "Open Webcam" launches getUserMedia with a live preview + Capture button.
 *          Falls back to file picker if camera permission is denied.
 *          "Upload File" opens a standard file picker.
 *
 * Mobile:  "Take Photo" uses <input capture="environment"> to open the native camera app.
 *          "Upload File" opens the gallery/files without capture.
 */
export function CameraCapture({ previewUrl, onCapture, onClear }: Props) {
  const [streaming, setStreaming] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraFileRef = useRef<HTMLInputElement>(null);

  // Assign stream to video element after it mounts in the streaming state
  useEffect(() => {
    if (streaming && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [streaming]);

  // Stop any active stream on unmount
  useEffect(() => () => stopStream(), []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function openWebcam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      streamRef.current = stream;
      setStreaming(true);
    } catch {
      // Permission denied or no camera — fall back to file picker
      fileRef.current?.click();
    }
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    stopStream();
    setStreaming(false);
    onCapture(dataUrl.split(',')[1], dataUrl);
  }

  function cancelStream() {
    stopStream();
    setStreaming(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      onCapture(dataUrl.split(',')[1], dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // reset so same file can be re-selected
  }

  function handleClear() {
    stopStream();
    setStreaming(false);
    onClear();
  }

  // ── Preview ───────────────────────────────────────────────────────────────

  if (previewUrl) {
    return (
      <div className="space-y-3">
        <div className="relative">
          <img
            src={previewUrl}
            alt="Your working"
            className="w-full rounded-lg border border-gray-200 object-contain max-h-64"
          />
          <button
            onClick={handleClear}
            className="absolute top-2 right-2 rounded-full bg-white border border-gray-200 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-red-500 shadow-sm"
          >
            ✕
          </button>
        </div>
        <button
          onClick={handleClear}
          className="w-full rounded-lg border border-gray-300 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          Retake photo
        </button>
      </div>
    );
  }

  // ── Streaming (desktop webcam live preview) ───────────────────────────────

  if (streaming) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg overflow-hidden bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full max-h-64 object-cover"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={captureFrame}
            className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 active:scale-[0.98] transition-all"
          >
            📷 Capture
          </button>
          <button
            onClick={cancelStream}
            className="rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Idle ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-2">
      {/* Hidden file inputs */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      {isMobile && (
        <input
          ref={cameraFileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
      )}

      {isMobile ? (
        <>
          <button
            onClick={() => cameraFileRef.current?.click()}
            className="flex items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-5 py-5 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors w-full justify-center active:scale-[0.98]"
          >
            <span className="text-xl">📷</span> Take a photo of your working
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors w-full justify-center"
          >
            <span>📁</span> Upload from files
          </button>
        </>
      ) : (
        <>
          <button
            onClick={openWebcam}
            className="flex items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-5 py-5 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors w-full justify-center"
          >
            <span className="text-xl">📷</span> Open Webcam
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors w-full justify-center"
          >
            <span>📁</span> Upload from files
          </button>
        </>
      )}
    </div>
  );
}
