/**
 * SignatureOmbreRoomPreview.jsx
 *
 * Displays the room scene with embossed ombré panels tiled on the wall.
 * Room setup PNG is loaded automatically from public/images/room-setups/.
 * Black pixels in the room image become transparent (wall = panel zone).
 * Furniture renders on top of the panel wall.
 */

import React, { useRef, useEffect, useCallback } from 'react';

const ROOM_SETUP_URL = '/images/room-setups/Colour_Core_Setup.png';
const PREVIEW_SIZE = 680; // fixed px

const SignatureOmbreRoomPreview = ({ panelImage, panelCount = 3, className }) => {
  const wallRef = useRef(null);
  const overlayRef = useRef(null);

  // Load room setup image and convert black → transparent (wall zone becomes see-through)
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, cv.width, cv.height);
      const px = imgData.data;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] < 15 && px[i + 1] < 15 && px[i + 2] < 15) px[i + 3] = 0;
      }
      ctx.putImageData(imgData, 0, 0);
      if (overlayRef.current) {
        overlayRef.current.src = cv.toDataURL('image/png');
      }
    };
    img.onerror = () => console.error('SignatureOmbreRoomPreview: failed to load room image', ROOM_SETUP_URL);
    img.src = ROOM_SETUP_URL;
  }, []);

  // Tile panel image across wall canvas whenever it changes.
  // IMPORTANT: do NOT clear before the image loads — that causes the flicker.
  // We draw straight over the previous frame so there is no blank gap.
  const tileWall = useCallback(() => {
    const canvas = wallRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    if (!panelImage) {
      // No render yet — show a neutral placeholder
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#c8b8a8';
      ctx.fillRect(0, 0, W, H);
      return;
    }

    const img = new Image();
    img.onload = () => {
      // Draw directly over the previous frame — the old tiles stay visible
      // right up until this draw call, eliminating the blank flash.
      const pw = Math.floor(W / panelCount);
      for (let i = 0; i < panelCount; i++) {
        ctx.drawImage(img, i * pw, 0, pw, H);
      }
    };
    img.src = panelImage;
  }, [panelImage, panelCount]);

  useEffect(() => { tileWall(); }, [tileWall]);

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: PREVIEW_SIZE,
        height: PREVIEW_SIZE,
        flexShrink: 0,
        background: '#e8e4df',
        overflow: 'hidden',
      }}
    >
      {/* Layer 1: panel wall tiles */}
      <canvas
        ref={wallRef}
        width={2000}
        height={2000}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1 }}
      />
      {/* Layer 2: room furniture / walls overlay (black→transparent) */}
      <img
        ref={overlayRef}
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 3, pointerEvents: 'none' }}
      />
    </div>
  );
};

export default SignatureOmbreRoomPreview;
