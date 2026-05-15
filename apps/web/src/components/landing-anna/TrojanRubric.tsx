"use client";

import { useEffect, useRef } from "react";

type Props = {
  src: string;
  alt?: string;
};

/** Pixelated mosaic overlay that clears on hover, with an inverting lens
 *  that follows the cursor. Mirrors the design's `#trojan` interaction. */
export function TrojanRubric({ src, alt = "" }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !img || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const drawPixels = () => {
      if (!img.complete || img.naturalWidth === 0) {
        img.addEventListener("load", drawPixels, { once: true });
        return;
      }
      const w = (canvas.width = wrap.clientWidth);
      const h = (canvas.height = wrap.clientHeight);
      const tile = 14;
      const tmpW = Math.ceil(w / tile);
      const tmpH = Math.ceil(h / tile);
      const tmp = document.createElement("canvas");
      tmp.width = tmpW;
      tmp.height = tmpH;
      const tctx = tmp.getContext("2d");
      if (!tctx) return;
      tctx.imageSmoothingEnabled = true;
      const ir = img.naturalWidth / img.naturalHeight;
      const cr = tmpW / tmpH;
      let sw: number, sh: number, sx: number, sy: number;
      if (ir > cr) {
        sh = img.naturalHeight;
        sw = img.naturalHeight * cr;
        sx = (img.naturalWidth - sw) / 2;
        sy = 0;
      } else {
        sw = img.naturalWidth;
        sh = img.naturalWidth / cr;
        sx = 0;
        sy = (img.naturalHeight - sh) / 2;
      }
      tctx.drawImage(img, sx, sy, sw, sh, 0, 0, tmpW, tmpH);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(tmp, 0, 0, w, h);
    };

    drawPixels();
    window.addEventListener("resize", drawPixels);

    const onMove = (e: MouseEvent) => {
      const lens = lensRef.current;
      if (!lens) return;
      const r = wrap.getBoundingClientRect();
      lens.style.left = `${e.clientX - r.left - 65}px`;
      lens.style.top = `${e.clientY - r.top - 65}px`;
    };
    wrap.addEventListener("mousemove", onMove);

    return () => {
      window.removeEventListener("resize", drawPixels);
      wrap.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <div ref={wrapRef} className="trojan">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imgRef} src={src} alt={alt} />
      <canvas ref={canvasRef} className="trojan__pixels" width={600} height={450} />
      <div ref={lensRef} className="trojan__lens" />
    </div>
  );
}
