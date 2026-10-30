# Plan: Image Insertion Feature

## Overview

Add an "Insert Image" button to the editor toolbar that opens the native file picker (`.jpg`, `.jpeg`, `.png` only) and places the selected image onto the current notebook page at the pen cursor position. Images are draggable so they can be repositioned after placement.

---

## UX Flow

```
1. User taps/clicks the Insert Image button (📷 icon) in the left floating toolbar,
   positioned just above the Pages button.

2. Native file picker opens (platform-agnostic):
   - macOS: Finder dialog
   - Windows: File Explorer dialog
   - iPad/iPhone: Files/Photos picker
   - Android: Files/Photos picker

3. Filtered to image formats only: .jpg, .jpeg, .png.

4. On selection, the image is rendered on the canvas at the current pen cursor position.

5. User can drag the image to reposition it anywhere on the page.

6. Multiple images can be placed on the same page, stacked in order of insertion.

7. A deleted stroke button can also delete the topmost image annotation (or we add
   a small X overlay on hover/tap of the image).
```

---

## Data Model Changes

### New field on `Page`

```ts
interface Page {
  // ... existing fields ...
  images: ImageAnnotation[];   // NEW
}

interface ImageAnnotation {
  id: string;              // unique per-insert, e.g. "img_" + random
  x: number;               // top-left position on page (CSS pixels)
  y: number;
  url: string;             // blob URL or data URL pointing to the image
  width: number;           // displayed width (CSS px)
  height: number;          // displayed height (CSS px)
  createdAt: number;
}
```

> **Note:** `url` should use `URL.createObjectURL(file)` when the image is first loaded,
> then we store the blob URL. For cloud sync, we'll upload the image to Supabase Storage
> and store the CDN URL instead — that's a future step.

### Supabase schema update (`supabase-schema.sql`)

No DB schema change needed. Images are stored as blob/data URLs in the `strokes` JSON column's sibling — `pages.images` array. They live in the page JSON blob like strokes and text annotations already do.

---

## UI Changes

### 1. New Toolbar Button

**Location:** Left floating toolbar, between Hand (pan) button and Pages button.

**Icon:** `Image` from `lucide-react` (same style as other icons).

**Style:** Identical to existing `FloatingBtn` — 48px circle, glass-dark on desktop/tablet,
matching border/color treatment.

```ts
{
  comp: FloatingBtn,
  props: {
    onClick: handleInsertImage,       // NEW handler
    tooltip: 'Insert Image',
    icon: <Image size={20} />,
    style: { bottom: 196, left: 6 },  // 60px above Pages (Pages @ 136)
  },
}
```

### 2. Image Preview Overlay (while dragging / after placement)

On hover or touch, show a small **"×"** button in the top-right corner of the image for deletion.

---

## Canvas Rendering Changes

### `drawImageAnnotation` function (new)

```ts
const drawImageAnnotation = (
  ctx: CanvasRenderingContext2D,
  img: ImageAnnotation,
  dpr: number
) => {
  const image = imgCacheRef.current.get(img.id);
  if (!image || image.complete === false) return;

  ctx.save();
  ctx.drawImage(
    image,
    img.x * dpr,
    img.y * dpr,
    img.width * dpr,
    img.height * dpr
  );
  ctx.restore();
};
```

Add this call inside the main `useEffect` that redraws the canvas (around line 480):

```ts
(notebook.pages[currentPageIndex]?.images ?? []).forEach((img) =>
  drawImageAnnotation(ctx, img, dpr)
);
```

### Image cache ref

```ts
const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
```

Populate when an image is inserted or loaded from saved page data.

---

## Drag-to-Reposition Logic

### Mouse events (desktop)

- `onPointerDown` on the canvas checks if the pointer landed inside any image's bounding box.
- If yes, set `draggingImageRef` to that image's id and record the offset.
- `onPointerMove` moves the image: `img.x += dx / dpr`, `img.y += dy / dpr`.
- `onPointerUp` commits the position update to the notebook state.

### Touch events (mobile/tablet)

Same logic, but use `touchstart`/`touchmove`/`touchend` instead of pointer events,
or rely on pointer events which cover both (they already exist on the canvas).

> Pointer events already work on touch devices, so no separate touch handlers are needed.

### Z-order

Images render in insertion order (earlier images first, later images on top).
Dragging brings a dragged image to the front (remove + re-append in array).

---

## File Picker Implementation

### HTML `<input type="file">` (approach A — simplest)

```tsx
<input
  ref={fileInputRef}
  type="file"
  accept=".jpg,.jpeg,.png"
  style={{ display: 'none' }}
  onChange={handleFileChange}
  multiple
/>
```

Triggered by a hidden `<input>` click in `handleInsertImage`:

```ts
const fileInputRef = useRef<HTMLInputElement>(null);
const handleInsertImage = () => fileInputRef.current?.click();
```

**Pros:** Works on every platform (macOS, Windows, iOS, Android) natively.
**Cons:** No drag-and-drop support without extra work (can add later).

### Alternative: Web API `showOpenFilePicker` (approach B — Chromium only)

Not recommended for now — doesn't work on Safari/iOS.

**Decision: Use approach A** (HTML `<input>`) for full cross-platform coverage.

---

## State Management

### New state

```ts
const [isImageDragging, setIsImageDragging] = useState(false);
const draggingImageRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
```

### `handleFileChange`

```ts
const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  for (const file of Array.from(files)) {
    if (!file.type.match(/image\/(jpeg|png)/)) continue;

    const url = URL.createObjectURL(file);
    const img = await loadImage(url); // new helper: returns { width, height }

    // Scale to fit page width if too large
    const canvas = canvasRef.current;
    const maxWidth = canvas ? canvas.getBoundingClientRect().width * 0.6 : 400;
    const scale = Math.min(1, maxWidth / img.width);
    const finalW = img.width * scale;
    const finalH = img.height * scale;

    // Place at current cursor position (or center of page)
    const pos = lastPointerPosRef.current
      ? { x: lastPointerPosRef.current.x - finalW / 2, y: lastPointerPosRef.current.y - finalH / 2 }
      : { x: 24, y: 24 };

    const ann: ImageAnnotation = {
      id: 'img_' + Math.random().toString(36).substring(2, 9),
      x: pos.x,
      y: pos.y,
      url,
      width: finalW,
      height: finalH,
      createdAt: Date.now(),
    };

    // Add to page state
    const page = nb.pages[pageIndexRef.current];
    const updatedPages = [...nb.pages];
    updatedPages[pageIndexRef.current] = {
      ...page,
      images: [...(page.images ?? []), ann],
    };
    updateCurrentNotebook(updatedPages, 0);

    // Cache the decoded image element
    imageCacheRef.current.set(ann.id, img.el);
  }

  // Reset input so the same file can be re-selected
  e.target.value = '';
}, [updateCurrentNotebook]);
```

### `loadImage` helper

```ts
const loadImage = (url: string): Promise<{ el: HTMLImageElement; width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve({ el, width: el.naturalWidth, height: el.naturalHeight });
    el.onerror = reject;
    el.src = url;
  });
```

---

## Click Detection for Dragging

Add a hit-test helper:

```ts
const hitTestImage = (
  pageX: number, pageY: number,
  images: ImageAnnotation[], dpr: number
): ImageAnnotation | null => {
  for (let i = images.length - 1; i >= 0; i--) {
    const img = images[i];
    if (
      pageX >= img.x &&
      pageX <= img.x + img.width &&
      pageY >= img.y &&
      pageY <= img.y + img.height
    ) {
      return img;
    }
  }
  return null;
};
```

Use in `startDrawing` (the pointer-down handler) — before starting a stroke, check if
we're hitting an image. If yes, start a drag instead of a stroke.

---

## Delete on Hover/Tap

Add a small "×" button in the top-right corner of each placed image:

```ts
// Rendered in the canvas draw loop (not in DOM):
ctx.save();
ctx.fillStyle = 'rgba(0,0,0,0.5)';
ctx.beginPath();
ctx.arc(deleteX, deleteY, 10 * dpr, 0, Math.PI * 2);
ctx.fill();
ctx.fillStyle = '#fff';
ctx.font = `${12 * dpr}px system-ui`;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('×', deleteX, deleteY);
ctx.restore();
```

Hit-testing the "×" button removes the image from the page's `images` array.

> Alternative (simpler): Just make the Trash2 button in the toolbar delete the topmost
> image when the current tool is "delete". This avoids hover button complexity.
> **Decision: Go with the Trash2 approach first**, add hover "×" as a polish later.

---

## Save / Cloud Sync

Currently, `updateCurrentNotebook` persists the entire notebook (including the `images` array)
to localStorage and to Supabase via `cloud.ts`. No additional changes needed for local saving.

For cloud sync, blob URLs won't survive across devices. Future step:
1. Upload image to Supabase Storage with key `notebooks/{id}/images/{imgId}.png`.
2. Replace `img.url` with the CDN URL from Supabase Storage.
3. On load, fetch from CDN instead of blob URL.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/Editor/EditorView.tsx` | Add `Image` import, new state, file input ref, `handleInsertImage`, `handleFileChange`, hit-test & drag logic, canvas draw call for images, new toolbar button in `floatButtons` |
| `src/storage/cloud.ts` | *Future:* add image upload to Supabase Storage |
| `supabase-schema.sql` | No change needed (images live in page JSON blob) |

---

## Out of Scope (Future Work)

- Drag-to-resize images
- Image rotation / flip
- Multi-select & batch-delete images
- Cloud sync of image blobs
- Paste from clipboard
- Drag-and-drop images from desktop onto the canvas
- Image layer ordering controls (bring to front / send to back)
