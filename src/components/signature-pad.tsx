"use client";

import { Eraser } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const INK = "#0b2a4a";
const EXPORT_WIDTH = 600;
/** Fewer points than this is a tap, not a signature. */
const MIN_POINTS = 12;

/**
 * Draw-your-signature box for finger, pen or mouse. Posts the drawing as a PNG data URL in a hidden input named `name`
 * ("" until something is drawn). Always light paper, also at night, so the ink reads as it will on the document.
 */
export function SignaturePad({
  name,
  onChange,
  label,
  clearLabel,
  placeholder,
}: {
  name: string;
  onChange?: (value: string) => void;
  label: string;
  clearLabel: string;
  placeholder: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const points = useRef(0);
  const [value, setValue] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Sized on first show (the pad may mount inside a closed <details>); once drawn on, resizing would wipe the ink.
    const fit = () => {
      if (points.current || !canvas.clientWidth) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round(canvas.clientWidth * ratio);
      canvas.height = Math.round(canvas.clientHeight * ratio);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) * canvas.width) / rect.width, y: ((event.clientY - rect.top) * canvas.height) / rect.height, scale: canvas.width / rect.width };
  };

  const publish = (next: string) => {
    setValue(next);
    onChange?.(next);
  };

  const exportImage = () => {
    const canvas = canvasRef.current!;
    if (points.current < MIN_POINTS) return publish("");
    const width = Math.min(EXPORT_WIDTH, canvas.width);
    const out = document.createElement("canvas");
    out.width = width;
    out.height = Math.round((canvas.height * width) / canvas.width);
    out.getContext("2d")!.drawImage(canvas, 0, 0, out.width, out.height);
    publish(out.toDataURL("image/png"));
  };

  const down = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y, scale } = point(event);
    const ctx = event.currentTarget.getContext("2d")!;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x, y, 1.2 * scale, 0, Math.PI * 2);
    ctx.fill();
    last.current = { x, y };
    points.current += 1;
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const { x, y, scale } = point(event);
    const ctx = event.currentTarget.getContext("2d")!;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4 * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    last.current = { x, y };
    points.current += 1;
  };

  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    exportImage();
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    points.current = 0;
    publish("");
  };

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-red-600">
          <Eraser size={14} />
          {clearLabel}
        </button>
      </div>
      <div className="relative overflow-hidden rounded-xl ring-1 ring-inset ring-slate-300" style={{ background: "#fffdf7" }}>
        <canvas
          ref={canvasRef}
          className="block h-40 w-full cursor-crosshair touch-none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
          aria-label={label}
          role="img"
        />
        <span className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-dashed" style={{ borderColor: "rgba(11, 42, 74, 0.12)" }} aria-hidden="true" />
        {value ? null : (
          <span className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs" style={{ color: "rgba(11, 42, 74, 0.45)" }}>
            {placeholder}
          </span>
        )}
      </div>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
