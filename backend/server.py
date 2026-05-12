from fastapi import FastAPI, APIRouter, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import sys
import logging
import time
from collections import defaultdict
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import json
import hashlib
from datetime import datetime, timezone
from chat_knowledge import SYSTEM_PROMPT

# Python 3.14 introduced a strict assertion in _SelectorSocketTransport._write_send()
# that fires when the write callback is invoked after the buffer has already been
# drained (e.g. client disconnect mid-response). The assertion is benign — an empty
# buffer means there is nothing to send — but it floods the error log. Patch it out
# so that _write_send simply returns early when there is no data pending.
if sys.version_info >= (3, 14):
    try:
        import asyncio.selector_events as _sel
        _orig_write_send = _sel._SelectorSocketTransport._write_send

        def _guarded_write_send(self):
            if not self._buffer:
                return
            _orig_write_send(self)

        _sel._SelectorSocketTransport._write_send = _guarded_write_send
    except Exception:
        pass

try:
    from PIL import Image, ImageOps
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    logging.warning("Pillow not installed — /thumb/ endpoint will serve originals. Run: pip install Pillow")


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

CHAT_LOGS_DIR = ROOT_DIR / "chatbot_logs"
CHAT_LOGS_DIR.mkdir(exist_ok=True)

# Create the main app without a prefix
app = FastAPI()

# Serve static assets (images) from backend/static/ (only if the directory exists)
_static_dir = ROOT_DIR / "static"
if _static_dir.exists():
    app.mount("/static", StaticFiles(directory=_static_dir), name="static")

# Serve pre-generated catalog JSON from backend/data/
# This mirrors the S3 layout so the frontend works unchanged locally.
# Run scripts/dump_catalog.py first if backend/data/ doesn't exist yet.
_data_dir = ROOT_DIR / "data"
if _data_dir.exists():
    app.mount("/data", StaticFiles(directory=_data_dir), name="data")

@app.get("/health")
def health():
    return {"status": "ok"}

THUMB_CACHE_DIR = ROOT_DIR / "static" / "_thumbcache"
THUMB_SIZE = (200, 200)

@app.get("/thumb/{path:path}")
def serve_thumbnail(path: str):
    """
    Serves a resized thumbnail for any image under /static/images/.
    First call resizes + caches to static/_thumbcache/; subsequent calls
    return the cached file immediately.
    """
    source = ROOT_DIR / "static" / "images" / path
    if not source.exists():
        raise HTTPException(status_code=404, detail=f"Image not found: {path}")

    cached = THUMB_CACHE_DIR / path

    if not cached.exists():
        if not PIL_AVAILABLE:
            # Pillow missing — fall back to serving the original
            return FileResponse(source)
        cached.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source) as img:
            # Composite transparent images onto a white background before JPEG
            # save. Without this, RGBA/palette PNGs render with black where
            # transparent — common for line-drawing emboss thumbnails.
            if img.mode in ("RGBA", "LA", "P"):
                converted = img.convert("RGBA")
                background = Image.new("RGBA", converted.size, (255, 255, 255, 255))
                background.paste(converted, mask=converted.split()[3])
                img = background.convert("RGB")
            else:
                img = img.convert("RGB")
            # Center-crop + resize to exact square — mirrors CSS background-size:cover
            thumb = ImageOps.fit(img, THUMB_SIZE, Image.LANCZOS)
            thumb.save(cached, format="JPEG", quality=82, optimize=True)

    return FileResponse(cached, media_type="image/jpeg")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

@app.get("/tech-specs/{filename}")
def serve_tech_spec_pdf(filename: str):
    """
    Directly streams the requested technical spec PDF so browsers open it
    inline regardless of spaces or parentheses in the filename.
    """
    # Prevent path traversal: filename must be a plain name with no separators
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    pdf_path = (ROOT_DIR / "static" / "technical_specification_pdfs" / filename).resolve()
    allowed_dir = (ROOT_DIR / "static" / "technical_specification_pdfs").resolve()
    if not str(pdf_path).startswith(str(allowed_dir)):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not pdf_path.exists() or pdf_path.suffix.lower() != ".pdf":
        raise HTTPException(status_code=404, detail="Technical specification not found")
    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )

# Define Models
class ProductDesign(BaseModel):
    id: str
    product_type: str
    category: str
    design_code: str
    design_name: str
    texture_url: str
    thumbnail_url: str
    size: Optional[str] = None
    density: Optional[str] = None
    pattern: Optional[str] = None
    color: Optional[str] = None
    thickness: Optional[str] = None
    emboss: Optional[bool] = None
    # "single" → one texture repeated across all columns (default)
    # "continuous" → each column gets its own texture slice ({code}-1.jpg, -2.jpg, -3.jpg)
    panel_variant: str = "single"
    # Populated only when panel_variant == "continuous"
    texture_urls: Optional[List[str]] = None
    # Emboss pattern IDs available for this design (empty = emboss not supported)
    available_emboss: List[str] = []

class ProductCategory(BaseModel):
    id: str
    name: str
    product_type: str
    emboss_available: bool = False
    designs: List[ProductDesign] = []

class ProductType(BaseModel):
    id: str
    name: str
    active: bool
    sizes: List[str] = []
    densities: List[str] = []
    patterns: List[str] = []
    colors: List[str] = []
    thicknesses: List[str] = []
    categories: List[ProductCategory] = []


# Technical specifications for panels
TECH_SPECS = {
    "flat-embossed-vmd": {
        "fire_rating": "Class A (ASTM E84)",
        "nrc_rating": "0.85 - 0.95",
        "sustainability": ["FSC Certified", "GREENGUARD Gold", "Red List Free"],
        "material": "High-Density Polyester Fiber",
        "thickness_mm": "12-25mm",
        "weight_kg_m2": "2.4 - 4.8",
        "installation": "Adhesive / Mechanical Fix",
        "warranty": "10 Years",
        "certifications": ["ISO 14001", "ISO 9001", "OEKO-TEX Standard 100"]
    },
    "colored-hd-ombre": {
        "fire_rating": "Class A (ASTM E84)",
        "nrc_rating": "0.80 - 0.90",
        "sustainability": ["Recycled Content 60%", "GREENGUARD Gold", "Red List Free"],
        "material": "HD Acoustic Felt",
        "thickness_mm": "9-12mm",
        "weight_kg_m2": "1.8 - 2.2",
        "installation": "Adhesive Mount",
        "warranty": "8 Years",
        "certifications": ["ISO 14001", "Declare Label", "HPD"]
    },
    "ombre": {
        "fire_rating": "Class A (ASTM E84)",
        "nrc_rating": "0.80 - 0.90",
        "sustainability": ["Recycled Content 60%", "GREENGUARD Gold", "Red List Free"],
        "material": "HD Acoustic Felt",
        "thickness_mm": "9-12mm",
        "weight_kg_m2": "1.8 - 2.2",
        "installation": "Adhesive Mount",
        "warranty": "8 Years",
        "certifications": ["ISO 14001", "Declare Label", "HPD"]
    },
    "wood": {
        "fire_rating": "Class A (ASTM E84)",
        "nrc_rating": "0.85 - 0.95",
        "sustainability": ["FSC Certified", "GREENGUARD Gold", "Red List Free"],
        "material": "High-Density Polyester Fiber",
        "thickness_mm": "12-25mm",
        "weight_kg_m2": "2.4 - 4.8",
        "installation": "Adhesive / Mechanical Fix",
        "warranty": "10 Years",
        "certifications": ["ISO 14001", "ISO 9001", "OEKO-TEX Standard 100"]
    },
    "fabrics": {
        "fire_rating": "Class A (ASTM E84)",
        "nrc_rating": "0.85 - 0.95",
        "sustainability": ["FSC Certified", "GREENGUARD Gold", "Red List Free"],
        "material": "High-Density Polyester Fiber",
        "thickness_mm": "12-25mm",
        "weight_kg_m2": "2.4 - 4.8",
        "installation": "Adhesive / Mechanical Fix",
        "warranty": "10 Years",
        "certifications": ["ISO 14001", "ISO 9001", "OEKO-TEX Standard 100"]
    },
    "vicstrip": {
        "fire_rating": "Class B (ASTM E84)",
        "nrc_rating": "0.70 - 0.85",
        "sustainability": ["FSC Certified Wood", "Low VOC", "Red List Free"],
        "material": "MDF Core + Acoustic Backing",
        "thickness_mm": "12-25mm",
        "weight_kg_m2": "3.2 - 5.5",
        "installation": "Rail System / Direct Fix",
        "warranty": "15 Years",
        "certifications": ["ISO 14001", "PEFC", "EPD Verified"]
    }
}

# Mock Product Data
def generate_mock_products():
    """Generate mock product data for all product types"""
    
    # Solid color placeholders for textures
    solid_colors = [
        "#D4A574",  # Warm tan
        "#8B7355",  # Brown
        "#A0522D",  # Sienna
        "#CD853F",  # Peru
        "#DEB887",  # Burlywood
        "#BC8F8F",  # Rosy brown
        "#F5DEB3",  # Wheat
        "#D2B48C",  # Tan
        "#C4A484",  # Light brown
        "#9E8B6E",  # Khaki brown
    ]
    
    products = []
    
    # 1. Flat / Embossed VMD Panels
    vmd_categories_non_emboss = [
        "Nature Reimagined", "Marble"
    ]
    vmd_categories_emboss = ["Leather"]
    
    vmd_panel = {
        "id": "flat-embossed-vmd",
        "name": "Bespoke Graphics",
        "active": True,
        "sizes": ["1200x2400", "1200x2800"],
        "densities": [],
        "patterns": [],
        "colors": [],
        "thicknesses": ["12mm (PET Panel)", "25mm (PET Panel)", "PET Wool"],
        "categories": []
    }
    
    # ── Explicit designs for categories that have real assets ────────────────
    # To add a design: copy one block, increment the id/code, update the name,
    # set texture_color as a hex fallback, and point texture_url / thumbnail_url
    # at the file under backend/static/images/flat-embossed-vmt/panels/{cat-id}/
    EXPLICIT_CATEGORY_DESIGNS = {
        "Line & Texture": [
            {
                "id": "vmd-design-lt-001",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "AB-BL-02",
                "design_name": "AB-BL-02",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/AB-BL-02.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/AB-BL-02.jpg",
                "color_name": "AB-BL-02",
            },
            {
                "id": "vmd-design-lt-002",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "AB-NC-04",
                "design_name": "AB-NC-04",
                "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/AB-NC-04-PANEL-A.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/AB-NC-04-PANEL-A.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/AB-NC-04-PANEL-A.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/AB-NC-04-PANEL-B.jpg",
                ],
                "color_name": "AB-NC-04",
            },
            {
                "id": "vmd-design-lt-003",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "AB-NC-07",
                "design_name": "AB-NC-07",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/AB-NC-07.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/AB-NC-07.jpg",
                "color_name": "AB-NC-07",
            },
            {
                "id": "vmd-design-lt-004",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "AB-NC-09",
                "design_name": "AB-NC-09",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/AB-NC-09.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/AB-NC-09.jpg",
                "color_name": "AB-NC-09",
            },
            {
                "id": "vmd-design-lt-005",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "AB-NC-11",
                "design_name": "AB-NC-11",
                "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/AB-NC-11-PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/AB-NC-11-PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/AB-NC-11-PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/AB-NC-11-PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/AB-NC-11-PanelC.jpg",
                ],
                "color_name": "AB-NC-11",
            },
            {
                "id": "vmd-design-lt-006",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "AB-NE-03",
                "design_name": "AB-NE-03",
                "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/AB-NE-03_PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/AB-NE-03_PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/AB-NE-03_PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/AB-NE-03_PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/AB-NE-03_PanelC.jpg",
                ],
                "color_name": "AB-NE-03",
            },
            {
                "id": "vmd-design-lt-007",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "FB-PT-34",
                "design_name": "FB-PT-34",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/FB-PT-34.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/FB-PT-34.jpg",
                "color_name": "FB-PT-34",
            },
            {
                "id": "vmd-design-lt-008",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "FB-PT-37",
                "design_name": "FB-PT-37",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/FB-PT-37.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/FB-PT-37.jpg",
                "color_name": "FB-PT-37",
            },
            {
                "id": "vmd-design-lt-009",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "FB-PT-66",
                "design_name": "FB-PT-66",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/FB-PT-66.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/FB-PT-66.jpg",
                "color_name": "FB-PT-66",
            },
            {
                "id": "vmd-design-lt-010",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "SR-NC-01",
                "design_name": "SR-NC-01",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/SR-NC-01.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/SR-NC-01.jpg",
                "color_name": "SR-NC-01",
            },
            {
                "id": "vmd-design-lt-011",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "SR-NC-05",
                "design_name": "SR-NC-05",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/SR-NC-05.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/SR-NC-05.jpg",
                "color_name": "SR-NC-05",
            },
            {
                "id": "vmd-design-lt-012",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "SR-NC-08",
                "design_name": "SR-NC-08",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/SR-NC-08.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/SR-NC-08.jpg",
                "color_name": "SR-NC-08",
            },
            {
                "id": "vmd-design-lt-013",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "SR-NC-09",
                "design_name": "SR-NC-09",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/SR-NC-09.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/SR-NC-09.jpg",
                "color_name": "SR-NC-09",
            },
            {
                "id": "vmd-design-lt-014",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "SR-NC-10",
                "design_name": "SR-NC-10",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/SR-NC-10.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/SR-NC-10.jpg",
                "color_name": "SR-NC-10",
            },
            {
                "id": "vmd-design-lt-015",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "SR-NC-11",
                "design_name": "SR-NC-11",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/SR-NC-11.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/SR-NC-11.jpg",
                "color_name": "SR-NC-11",
            },
            {
                "id": "vmd-design-lt-016",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "SR-NC-12",
                "design_name": "SR-NC-12",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/SR-NC-12.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/SR-NC-12.jpg",
                "color_name": "SR-NC-12",
            },
            {
                "id": "vmd-design-lt-017",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "SR-NC-14",
                "design_name": "SR-NC-14",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/SR-NC-14.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/SR-NC-14.jpg",
                "color_name": "SR-NC-14",
            },
            {
                "id": "vmd-design-lt-018",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "SR-NC-15",
                "design_name": "SR-NC-15",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/SR-NC-15.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/SR-NC-15.jpg",
                "color_name": "SR-NC-15",
            },
            {
                "id": "vmd-design-lt-019",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "SR-NC-16",
                "design_name": "SR-NC-16",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/SR-NC-16.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/SR-NC-16.jpg",
                "color_name": "SR-NC-16",
            },
            {
                "id": "vmd-design-lt-020",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "WP-NC-08",
                "design_name": "WP-NC-08",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/WP-NC-08.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/WP-NC-08.jpg",
                "color_name": "WP-NC-08",
            },
            {
                "id": "vmd-design-lt-021",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "WP-NC-11",
                "design_name": "WP-NC-11",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/WP-NC-11.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/WP-NC-11.jpg",
                "color_name": "WP-NC-11",
            },
            # ── Add more Line & Texture designs here ──────────────────────
        ],
        "Rhythm & Repeat": [
            {
                "id": "vmd-design-rr-001",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "AB-BL-03",
                "design_name": "AB-BL-03",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-BL-03.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-BL-03.jpg",
                "color_name": "AB-BL-03",
            },
            {
                "id": "vmd-design-rr-002",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "AB-GR-01",
                "design_name": "AB-GR-01",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-GR-01.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-GR-01.jpg",
                "color_name": "AB-GR-01",
            },
            {
                "id": "vmd-design-rr-003",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "AB-GR-02",
                "design_name": "AB-GR-02",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-GR-02.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-GR-02.jpg",
                "color_name": "AB-GR-02",
            },
            {
                "id": "vmd-design-rr-004",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "AB-GR-03",
                "design_name": "AB-GR-03",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-GR-03.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-GR-03.jpg",
                "color_name": "AB-GR-03",
            },
            {
                "id": "vmd-design-rr-005",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "AB-GR-04",
                "design_name": "AB-GR-04",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-GR-04.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-GR-04.jpg",
                "color_name": "AB-GR-04",
            },
            {
                "id": "vmd-design-rr-006",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "AB-GY-01",
                "design_name": "AB-GY-01",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-GY-01.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-GY-01.jpg",
                "color_name": "AB-GY-01",
            },
            {
                "id": "vmd-design-rr-007",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "AB-GY-02",
                "design_name": "AB-GY-02",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-GY-02.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-GY-02.jpg",
                "color_name": "AB-GY-02",
            },
            {
                "id": "vmd-design-rr-008",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "AB-GY-03",
                "design_name": "AB-GY-03",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-GY-03.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-GY-03.jpg",
                "color_name": "AB-GY-03",
            },
            {
                "id": "vmd-design-rr-009",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "AB-NC-06",
                "design_name": "AB-NC-06",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-NC-06.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-NC-06.jpg",
                "color_name": "AB-NC-06",
            },
            {
                "id": "vmd-design-rr-010",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "AB-NC-08",
                "design_name": "AB-NC-08",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-NC-08.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-NC-08.jpg",
                "color_name": "AB-NC-08",
            },
            {
                "id": "vmd-design-rr-011",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "AB-NC-16",
                "design_name": "AB-NC-16",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-NC-16.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-NC-16.jpg",
                "color_name": "AB-NC-16",
            },
            {
                "id": "vmd-design-rr-012",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "AB-NC-18",
                "design_name": "AB-NC-18",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-NC-18.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-NC-18.jpg",
                "color_name": "AB-NC-18",
            },
            {
                "id": "vmd-design-rr-013",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "AB-NE-01",
                "design_name": "AB-NE-01",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-NE-01.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-NE-01.jpg",
                "color_name": "AB-NE-01",
            },
            {
                "id": "vmd-design-rr-014",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "AB-OR-02",
                "design_name": "AB-OR-02",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-OR-02.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-OR-02.jpg",
                "color_name": "AB-OR-02",
            },
            {
                "id": "vmd-design-rr-015",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "AB-OR-03",
                "design_name": "AB-OR-03",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-OR-03.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-OR-03.jpg",
                "color_name": "AB-OR-03",
            },
            {
                "id": "vmd-design-rr-016",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "AB-OR-04",
                "design_name": "AB-OR-04",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-OR-04.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-OR-04.jpg",
                "color_name": "AB-OR-04",
            },
            {
                "id": "vmd-design-rr-017",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "AB-PU-01",
                "design_name": "AB-PU-01",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-PU-01.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/AB-PU-01.jpg",
                "color_name": "AB-PU-01",
            },
            {
                "id": "vmd-design-rr-018",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "WP-BL-05",
                "design_name": "WP-BL-05",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/WP-BL-05.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/WP-BL-05.jpg",
                "color_name": "WP-BL-05",
            },
            {
                "id": "vmd-design-rr-019",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "WP-GR-01",
                "design_name": "WP-GR-01",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/WP-GR-01.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/WP-GR-01.jpg",
                "color_name": "WP-GR-01",
            },
            {
                "id": "vmd-design-rr-020",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "WP-NC-09",
                "design_name": "WP-NC-09",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/WP-NC-09.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/WP-NC-09.jpg",
                "color_name": "WP-NC-09",
            },
            {
                "id": "vmd-design-rr-021",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "WP-OR-01",
                "design_name": "WP-OR-01",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/WP-OR-01.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/WP-OR-01.jpg",
                "color_name": "WP-OR-01",
            },
            {
                "id": "vmd-design-rr-022",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "WP-PK-01",
                "design_name": "WP-PK-01",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/WP-PK-01.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/WP-PK-01.jpg",
                "color_name": "WP-PK-01",
            },
            {
                "id": "vmd-design-rr-023",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "WP-RD-01",
                "design_name": "WP-RD-01",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/WP-RD-01.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/WP-RD-01.jpg",
                "color_name": "WP-RD-01",
            },
            {
                "id": "vmd-design-rr-024",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "WP-RD-02",
                "design_name": "WP-RD-02",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/WP-RD-02.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/WP-RD-02.jpg",
                "color_name": "WP-RD-02",
            },
            {
                "id": "vmd-design-rr-025",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "WP-YL-01",
                "design_name": "WP-YL-01",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/WP-YL-01.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/WP-YL-01.jpg",
                "color_name": "WP-YL-01",
            },
            # ── Add more Rhythm & Repeat designs here ─────────────────────
        ],
        "Quiet Bloom": [
            {
                "id": "vmd-design-qb-001",
                "product_type": "flat-embossed-vmd",
                "category": "Quiet Bloom",
                "design_code": "NA-NC-01",
                "design_name": "NA-NC-01",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-quiet-bloom/NA-NC-01.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-quiet-bloom/NA-NC-01.jpg",
                "color_name": "NA-NC-01",
            },
            {
                "id": "vmd-design-qb-002",
                "product_type": "flat-embossed-vmd",
                "category": "Quiet Bloom",
                "design_code": "NA-NC-02",
                "design_name": "NA-NC-02",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-quiet-bloom/NA-NC-02.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-quiet-bloom/NA-NC-02.jpg",
                "color_name": "NA-NC-02",
            },
            {
                "id": "vmd-design-qb-003",
                "product_type": "flat-embossed-vmd",
                "category": "Quiet Bloom",
                "design_code": "NA-NC-05",
                "design_name": "NA-NC-05",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-quiet-bloom/NA-NC-05.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-quiet-bloom/NA-NC-05.jpg",
                "color_name": "NA-NC-05",
            },
            {
                "id": "vmd-design-qb-004",
                "product_type": "flat-embossed-vmd",
                "category": "Quiet Bloom",
                "design_code": "NA-NC-06",
                "design_name": "NA-NC-06",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-quiet-bloom/NA-NC-06.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-quiet-bloom/NA-NC-06.jpg",
                "color_name": "NA-NC-06",
            },
            {
                "id": "vmd-design-qb-005",
                "product_type": "flat-embossed-vmd",
                "category": "Quiet Bloom",
                "design_code": "NA-NC-07",
                "design_name": "NA-NC-07",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-quiet-bloom/NA-NC-07.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-quiet-bloom/NA-NC-07.jpg",
                "color_name": "NA-NC-07",
            },
            {
                "id": "vmd-design-qb-006",
                "product_type": "flat-embossed-vmd",
                "category": "Quiet Bloom",
                "design_code": "NA-NC-10",
                "design_name": "NA-NC-10",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-quiet-bloom/NA-NC-10.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-quiet-bloom/NA-NC-10.jpg",
                "color_name": "NA-NC-10",
            },
            {
                "id": "vmd-design-qb-007",
                "product_type": "flat-embossed-vmd",
                "category": "Quiet Bloom",
                "design_code": "NA-NC-11",
                "design_name": "NA-NC-11",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-quiet-bloom/NA-NC-11.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-quiet-bloom/NA-NC-11.jpg",
                "color_name": "NA-NC-11",
            },
            {
                "id": "vmd-design-qb-008",
                "product_type": "flat-embossed-vmd",
                "category": "Quiet Bloom",
                "design_code": "NA-NC-12",
                "design_name": "NA-NC-12",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-quiet-bloom/NA-NC-12.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-quiet-bloom/NA-NC-12.jpg",
                "color_name": "NA-NC-12",
            },
            {
                "id": "vmd-design-qb-009",
                "product_type": "flat-embossed-vmd",
                "category": "Quiet Bloom",
                "design_code": "NA-NC-15",
                "design_name": "NA-NC-15",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-quiet-bloom/NA-NC-15.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-quiet-bloom/NA-NC-15.jpg",
                "color_name": "NA-NC-15",
            },
            # ── Add more Quiet Bloom designs here ─────────────────────────
        ],
        "Indian Modern": [
            {
                "id": "vmd-design-im-001",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "FB-PT-35",
                "design_name": "FB-PT-35",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/FB-PT-35.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/FB-PT-35.jpg",
                "color_name": "FB-PT-35",
            },
            {
                "id": "vmd-design-im-002",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "FB-PT-36",
                "design_name": "FB-PT-36",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/FB-PT-36.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/FB-PT-36.jpg",
                "color_name": "FB-PT-36",
            },
            {
                "id": "vmd-design-im-003",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "FB-PT-38",
                "design_name": "FB-PT-38",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/FB-PT-38.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/FB-PT-38.jpg",
                "color_name": "FB-PT-38",
            },
            {
                "id": "vmd-design-im-004",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "FB-PT-67",
                "design_name": "FB-PT-67",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/FB-PT-67.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/FB-PT-67.jpg",
                "color_name": "FB-PT-67",
            },
            {
                "id": "vmd-design-im-005",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "FB-PT-68",
                "design_name": "FB-PT-68",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/FB-PT-68.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/FB-PT-68.jpg",
                "color_name": "FB-PT-68",
            },
            {
                "id": "vmd-design-im-006",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "FB-PT-70",
                "design_name": "FB-PT-70",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/FB-PT-70.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/FB-PT-70.jpg",
                "color_name": "FB-PT-70",
            },
            {
                "id": "vmd-design-im-007",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "IND-NC-01",
                "design_name": "IND-NC-01",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/IND-NC-01.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/IND-NC-01.jpg",
                "color_name": "IND-NC-01",
            },
            {
                "id": "vmd-design-im-008",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "IND-NC-02",
                "design_name": "IND-NC-02",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/IND-NC-02.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/IND-NC-02.jpg",
                "color_name": "IND-NC-02",
            },
            {
                "id": "vmd-design-im-009",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "IND-NC-04",
                "design_name": "IND-NC-04",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/IND-NC-04.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/IND-NC-04.jpg",
                "color_name": "IND-NC-04",
            },
            {
                "id": "vmd-design-im-010",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "IND-NC-05",
                "design_name": "IND-NC-05",
                "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/IND-NC-05-Panel1.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/IND-NC-05-Panel1.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/IND-NC-05-Panel1.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/IND-NC-05-Panel2.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/IND-NC-05-Panel1.jpg",
                ],
                "color_name": "IND-NC-05",
            },
            {
                "id": "vmd-design-im-011",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "IND-NC-06",
                "design_name": "IND-NC-06",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/IND-NC-06.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/IND-NC-06.jpg",
                "color_name": "IND-NC-06",
            },
            {
                "id": "vmd-design-im-012",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "NA-RD-03",
                "design_name": "NA-RD-03",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/NA-RD-03.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/NA-RD-03.jpg",
                "color_name": "NA-RD-03",
            },
            {
                "id": "vmd-design-im-013",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "WP-GR-03",
                "design_name": "WP-GR-03",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/WP-GR-03.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/WP-GR-03.jpg",
                "color_name": "WP-GR-03",
            },
            # ── Add more Indian Modern designs here ───────────────────────
        ],
        "Color Block": [
            {
                "id": "vmd-design-cb-001",
                "product_type": "flat-embossed-vmd",
                "category": "Color Block",
                "design_code": "AB-BL-04",
                "design_name": "AB-BL-04",
                "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-BL-04_PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-color-block/AB-BL-04_PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-BL-04_PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-BL-04_PanelB.jpg",
                ],
                "color_name": "AB-BL-04",
            },
            {
                "id": "vmd-design-cb-002",
                "product_type": "flat-embossed-vmd",
                "category": "Color Block",
                "design_code": "AB-BL-05",
                "design_name": "AB-BL-05",
                "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-BL-05_PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-color-block/AB-BL-05_PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-BL-05_PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-BL-05_PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-BL-05_PanelC.jpg",
                ],
                "color_name": "AB-BL-05",
            },
            {
                "id": "vmd-design-cb-003",
                "product_type": "flat-embossed-vmd",
                "category": "Color Block",
                "design_code": "AB-NC-01",
                "design_name": "AB-NC-01",
                "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-NC-01-PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-color-block/AB-NC-01-PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-NC-01-PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-NC-01-PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-NC-01-PanelC.jpg",
                ],
                "color_name": "AB-NC-01",
            },
            {
                "id": "vmd-design-cb-004",
                "product_type": "flat-embossed-vmd",
                "category": "Color Block",
                "design_code": "AB-NC-02",
                "design_name": "AB-NC-02",
                "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-NC-02-PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-color-block/AB-NC-02-PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-NC-02-PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-NC-02-PanelB.jpg",
                ],
                "color_name": "AB-NC-02",
            },
            {
                "id": "vmd-design-cb-005",
                "product_type": "flat-embossed-vmd",
                "category": "Color Block",
                "design_code": "AB-NC-10",
                "design_name": "AB-NC-10",
                "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-NC-10-PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-color-block/AB-NC-10-PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-NC-10-PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-NC-10-PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-NC-10-PanelC.jpg",
                ],
                "color_name": "AB-NC-10",
            },
            {
                "id": "vmd-design-cb-006",
                "product_type": "flat-embossed-vmd",
                "category": "Color Block",
                "design_code": "AB-NC-17",
                "design_name": "AB-NC-17",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-NC-17.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-color-block/AB-NC-17.jpg",
                "color_name": "AB-NC-17",
            },
            {
                "id": "vmd-design-cb-007",
                "product_type": "flat-embossed-vmd",
                "category": "Color Block",
                "design_code": "AB-NC-19",
                "design_name": "AB-NC-19",
                "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-NC-19_PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-color-block/AB-NC-19_PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-NC-19_PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-NC-19_PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-NC-19_PanelC.jpg",
                ],
                "color_name": "AB-NC-19",
            },
            {
                "id": "vmd-design-cb-008",
                "product_type": "flat-embossed-vmd",
                "category": "Color Block",
                "design_code": "AB-NE-02",
                "design_name": "AB-NE-02",
                "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-NE-02_PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-color-block/AB-NE-02_PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-NE-02_PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-NE-02_PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-NE-02_PanelC.jpg",
                ],
                "color_name": "AB-NE-02",
            },
            {
                "id": "vmd-design-cb-009",
                "product_type": "flat-embossed-vmd",
                "category": "Color Block",
                "design_code": "AB-OR-05",
                "design_name": "AB-OR-05",
                "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-OR-05_PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-color-block/AB-OR-05_PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-OR-05_PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-OR-05_PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/AB-OR-05_PanelC.jpg",
                ],
                "color_name": "AB-OR-05",
            },
            # ── Add more Color Block designs here ─────────────────────────
        ],
        "Fun & Fantasy": [
            {
                "id": "vmd-design-ff-001",
                "product_type": "flat-embossed-vmd",
                "category": "Fun & Fantasy",
                "design_code": "WP-NC-01",
                "design_name": "WP-NC-01",
                "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/WP-NC-01-PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-fun-and-fantasy/WP-NC-01-PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/WP-NC-01-PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/WP-NC-01-PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/WP-NC-01-PanelC.jpg",
                ],
                "color_name": "WP-NC-01",
            },
            {
                "id": "vmd-design-ff-002",
                "product_type": "flat-embossed-vmd",
                "category": "Fun & Fantasy",
                "design_code": "WP-NC-02",
                "design_name": "WP-NC-02",
                "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/WP-NC-02-PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-fun-and-fantasy/WP-NC-02-PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/WP-NC-02-PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/WP-NC-02-PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/WP-NC-02-PanelC.jpg",
                ],
                "color_name": "WP-NC-02",
            },
            {
                "id": "vmd-design-ff-003",
                "product_type": "flat-embossed-vmd",
                "category": "Fun & Fantasy",
                "design_code": "WP-NC-03",
                "design_name": "WP-NC-03",
                "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/WP-NC-03-PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-fun-and-fantasy/WP-NC-03-PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/WP-NC-03-PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/WP-NC-03-PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/WP-NC-03-PanelC.jpg",
                ],
                "color_name": "WP-NC-03",
            },
            # ── Add more Fun & Fantasy designs here ───────────────────────
        ],
        "Marble": [
            # {
                # "id": "vmd-design-mb-001",
                # "product_type": "flat-embossed-vmd",
                # "category": "Marble",
                # "design_code": "ST-NC-01",
                # "design_name": "ST-NC-01",
                # "texture_color": "#FFFFFF",
                # "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-01.jpg",
                # "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-01.jpg",
                # "color_name": "ST-NC-01",
                # "available_emboss": [],
            # },
            # {
                # "id": "vmd-design-mb-002",
                # "product_type": "flat-embossed-vmd",
                # "category": "Marble",
                # "design_code": "ST-NC-02",
                # "design_name": "ST-NC-02",
                # "texture_color": "#FFFFFF",
                # "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-02.jpg",
                # "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-02.jpg",
                # "color_name": "ST-NC-02",
                # "available_emboss": [],
            # },
            {
                "id": "vmd-design-mb-003",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-03",
                "design_name": "ST-NC-03",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-03.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-03.jpg",
                "color_name": "ST-NC-03",
                "available_emboss": ["flux_ribbed", "ribbed_45mm", "ribbed_60mm", "tappered"],
            },
            {
                "id": "vmd-design-mb-004",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-04",
                "design_name": "ST-NC-04",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-04.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-04.jpg",
                "color_name": "ST-NC-04",
                "available_emboss": ["flux_ribbed", "ribbed_45mm", "ribbed_60mm", "tappered"],
            },
            {
                "id": "vmd-design-mb-005",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-05",
                "design_name": "ST-NC-05",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-05.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-05.jpg",
                "color_name": "ST-NC-05",
                "available_emboss": ["flux_ribbed", "ribbed_45mm", "ribbed_60mm", "tappered"],
            },
            {
                "id": "vmd-design-mb-006",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-06",
                "design_name": "ST-NC-06",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-06.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-06.jpg",
                "color_name": "ST-NC-06",
                "available_emboss": [],
            },
            # {
                # "id": "vmd-design-mb-007",
                # "product_type": "flat-embossed-vmd",
                # "category": "Marble",
                # "design_code": "ST-NC-07",
                # "design_name": "ST-NC-07",
                # "texture_color": "#FFFFFF",
                # "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-07.jpg",
                # "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-07.jpg",
                # "color_name": "ST-NC-07",
                # "available_emboss": [],
            # },
            # {
                # "id": "vmd-design-mb-008",
                # "product_type": "flat-embossed-vmd",
                # "category": "Marble",
                # "design_code": "ST-NC-08",
                # "design_name": "ST-NC-08",
                # "texture_color": "#FFFFFF",
                # "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-08.jpg",
                # "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-08.jpg",
                # "color_name": "ST-NC-08",
                # "available_emboss": [],
            # },
            # {
                # "id": "vmd-design-mb-009",
                # "product_type": "flat-embossed-vmd",
                # "category": "Marble",
                # "design_code": "ST-NC-09",
                # "design_name": "ST-NC-09",
                # "texture_color": "#FFFFFF",
                # "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-09.jpg",
                # "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-09.jpg",
                # "color_name": "ST-NC-09",
                # "available_emboss": [],
            # },
            {
                "id": "vmd-design-mb-010",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-10",
                "design_name": "ST-NC-10",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-10.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-10.jpg",
                "color_name": "ST-NC-10",
                "available_emboss": [],
            },
            {
                "id": "vmd-design-mb-011",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-11",
                "design_name": "ST-NC-11",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-11.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-11.jpg",
                "color_name": "ST-NC-11",
                "available_emboss": [],
            },
            {
                "id": "vmd-design-mb-012",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-12",
                "design_name": "ST-NC-12",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-12.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-12.jpg",
                "color_name": "ST-NC-12",
                "available_emboss": [],
            },
            # {
                # "id": "vmd-design-mb-013",
                # "product_type": "flat-embossed-vmd",
                # "category": "Marble",
                # "design_code": "ST-NC-13",
                # "design_name": "ST-NC-13",
                # "texture_color": "#FFFFFF",
                # "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-13.jpg",
                # "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-13.jpg",
                # "color_name": "ST-NC-13",
                # "available_emboss": [],
            # },
            {
                "id": "vmd-design-mb-014",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-14",
                "design_name": "ST-NC-14",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-14.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-14.jpg",
                "color_name": "ST-NC-14",
                "available_emboss": ["flux_ribbed", "ribbed_45mm", "ribbed_60mm", "tappered"],
            },
            {
                "id": "vmd-design-mb-015",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-15",
                "design_name": "ST-NC-15",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-15.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-15.jpg",
                "color_name": "ST-NC-15",
                "available_emboss": [],
            },
            {
                "id": "vmd-design-mb-016",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-16",
                "design_name": "ST-NC-16",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-16.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-16.jpg",
                "color_name": "ST-NC-16",
                "available_emboss": [],
            },
            # {
                # "id": "vmd-design-mb-017",
                # "product_type": "flat-embossed-vmd",
                # "category": "Marble",
                # "design_code": "ST-NC-17",
                # "design_name": "ST-NC-17",
                # "texture_color": "#FFFFFF",
                # "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-17.jpg",
                # "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-17.jpg",
                # "color_name": "ST-NC-17",
                # "available_emboss": [],
            # },
            {
                "id": "vmd-design-mb-018",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-18",
                "design_name": "ST-NC-18",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-18.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-18.jpg",
                "color_name": "ST-NC-18",
                "available_emboss": [],
            },
            {
                "id": "vmd-design-mb-019",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-19",
                "design_name": "ST-NC-19",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC19.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC19.jpg",
                "color_name": "ST-NC-19",
                "available_emboss": ["flux_ribbed", "ribbed_45mm", "ribbed_60mm", "tappered"],
            },
            {
                "id": "vmd-design-mb-020",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-20",
                "design_name": "ST-NC-20",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-20.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-20.jpg",
                "color_name": "ST-NC-20",
                "available_emboss": ["flux_ribbed", "ribbed_45mm", "ribbed_60mm", "tappered"],
            },
            {
                "id": "vmd-design-mb-021",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-21",
                "design_name": "ST-NC-21",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-21.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-21.jpg",
                "color_name": "ST-NC-21",
                "available_emboss": [],
            },
            # {
                # "id": "vmd-design-mb-022",
                # "product_type": "flat-embossed-vmd",
                # "category": "Marble",
                # "design_code": "ST-NC-22",
                # "design_name": "ST-NC-22",
                # "texture_color": "#FFFFFF",
                # "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-22.jpg",
                # "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-22.jpg",
                # "color_name": "ST-NC-22",
                # "available_emboss": [],
            # },
            # {
                # "id": "vmd-design-mb-023",
                # "product_type": "flat-embossed-vmd",
                # "category": "Marble",
                # "design_code": "ST-NC-23",
                # "design_name": "ST-NC-23",
                # "texture_color": "#FFFFFF",
                # "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-23.jpg",
                # "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-23.jpg",
                # "color_name": "ST-NC-23",
                # "available_emboss": [],
            # },
            # {
                # "id": "vmd-design-mb-024",
                # "product_type": "flat-embossed-vmd",
                # "category": "Marble",
                # "design_code": "ST-NC-24",
                # "design_name": "ST-NC-24",
                # "texture_color": "#FFFFFF",
                # "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-24.jpg",
                # "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-24.jpg",
                # "color_name": "ST-NC-24",
                # "available_emboss": [],
            # },
            {
                "id": "vmd-design-mb-025",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-25",
                "design_name": "ST-NC-25",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-25.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-25.jpg",
                "color_name": "ST-NC-25",
                "available_emboss": [],
            },
            {
                "id": "vmd-design-mb-026",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-26",
                "design_name": "ST-NC-26",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-26.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-26.jpg",
                "color_name": "ST-NC-26",
                "available_emboss": [],
            },
            {
                "id": "vmd-design-mb-027",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-27",
                "design_name": "ST-NC-27",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-27.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-27.jpg",
                "color_name": "ST-NC-27",
                "available_emboss": ["flux_ribbed", "ribbed_45mm", "ribbed_60mm", "tappered"],
            },
            # {
                # "id": "vmd-design-mb-028",
                # "product_type": "flat-embossed-vmd",
                # "category": "Marble",
                # "design_code": "ST-NC-28",
                # "design_name": "ST-NC-28",
                # "texture_color": "#FFFFFF",
                # "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-28.jpg",
                # "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-28.jpg",
                # "color_name": "ST-NC-28",
                # "available_emboss": [],
            # },
            # {
                # "id": "vmd-design-mb-029",
                # "product_type": "flat-embossed-vmd",
                # "category": "Marble",
                # "design_code": "ST-NC-29",
                # "design_name": "ST-NC-29",
                # "texture_color": "#FFFFFF",
                # "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-29.jpg",
                # "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-29.jpg",
                # "color_name": "ST-NC-29",
                # "available_emboss": [],
            # },
            {
                "id": "vmd-design-mb-030",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-30",
                "design_name": "ST-NC-30",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-30.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-30.jpg",
                "color_name": "ST-NC-30",
                "available_emboss": [],
            },
            {
                "id": "vmd-design-mb-031",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-31",
                "design_name": "ST-NC-31",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-31.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-31.jpg",
                "color_name": "ST-NC-31",
                "available_emboss": ["flux_ribbed", "ribbed_45mm", "ribbed_60mm", "tappered"],
            },
            {
                "id": "vmd-design-mb-032",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-32",
                "design_name": "ST-NC-32",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-32.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-32.jpg",
                "color_name": "ST-NC-32",
                "available_emboss": ["flux_ribbed", "ribbed_45mm", "ribbed_60mm", "tappered"],
            },
            # ── Add more Marble designs here ──────────────────────────────
        ],
        "Luxury Textures": [
            {
                "id": "vmd-design-lx-001",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-39",
                "design_name": "FB-PT-39",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-39.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-39.jpg",
                "color_name": "FB-PT-39",
            },
            {
                "id": "vmd-design-lx-002",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-40",
                "design_name": "FB-PT-40",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-40.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-40.jpg",
                "color_name": "FB-PT-40",
            },
            {
                "id": "vmd-design-lx-003",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-41",
                "design_name": "FB-PT-41",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-41.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-41.jpg",
                "color_name": "FB-PT-41",
            },
            {
                "id": "vmd-design-lx-004",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-42",
                "design_name": "FB-PT-42",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-42.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-42.jpg",
                "color_name": "FB-PT-42",
            },
            {
                "id": "vmd-design-lx-005",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-69",
                "design_name": "FB-PT-69",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-69.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-69.jpg",
                "color_name": "FB-PT-69",
            },
            {
                "id": "vmd-design-lx-006",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-75",
                "design_name": "FB-PT-75",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-75.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-75.jpg",
                "color_name": "FB-PT-75",
            },
            {
                "id": "vmd-design-lx-007",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-76",
                "design_name": "FB-PT-76",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-76.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-76.jpg",
                "color_name": "FB-PT-76",
            },
            {
                "id": "vmd-design-lx-008",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-77",
                "design_name": "FB-PT-77",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-77.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-77.jpg",
                "color_name": "FB-PT-77",
            },
            {
                "id": "vmd-design-lx-009",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-78",
                "design_name": "FB-PT-78",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-78.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-78.jpg",
                "color_name": "FB-PT-78",
            },
            {
                "id": "vmd-design-lx-010",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-79",
                "design_name": "FB-PT-79",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-79.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-79.jpg",
                "color_name": "FB-PT-79",
            },
            {
                "id": "vmd-design-lx-011",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-81",
                "design_name": "FB-PT-81",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-81.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-81.jpg",
                "color_name": "FB-PT-81",
            },
            {
                "id": "vmd-design-lx-012",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-82",
                "design_name": "FB-PT-82",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-82.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-82.jpg",
                "color_name": "FB-PT-82",
            },
            {
                "id": "vmd-design-lx-013",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-83",
                "design_name": "FB-PT-83",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-83.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-83.jpg",
                "color_name": "FB-PT-83",
            },
            {
                "id": "vmd-design-lx-014",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-84",
                "design_name": "FB-PT-84",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-84.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-84.jpg",
                "color_name": "FB-PT-84",
            },
            {
                "id": "vmd-design-lx-015",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-85",
                "design_name": "FB-PT-85",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-85.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-85.jpg",
                "color_name": "FB-PT-85",
            },
            {
                "id": "vmd-design-lx-016",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-86",
                "design_name": "FB-PT-86",
                "texture_color": "#FFFFFF",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-86.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-86.jpg",
                "color_name": "FB-PT-86",
            },
        ],
        "Leather": [
            {"id":"vmd-design-lh-001", "product_type": "flat-embossed-vmd", "category": "Leather", "design_code": "LH-BR-01", "design_name": "LH-BR-01", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-BR-01.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-BR-01.jpg", "color_name": "LH-BR-01", "available_emboss": ["flux_ribbed","ribbed_45mm","ribbed_60mm","tappered","triangle","square_30","aqualine"]},
            {"id":"vmd-design-lh-002", "product_type": "flat-embossed-vmd", "category": "Leather", "design_code": "LH-BR-02", "design_name": "LH-BR-02", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-BR-02.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-BR-02.jpg", "color_name": "LH-BR-02", "available_emboss": ["flux_ribbed","ribbed_45mm","ribbed_60mm","tappered","triangle","aqualine"]},
            {"id":"vmd-design-lh-003", "product_type": "flat-embossed-vmd", "category": "Leather", "design_code": "LH-BR-03", "design_name": "LH-BR-03", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-BR-03.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-BR-03.jpg", "color_name": "LH-BR-03", "available_emboss": ["flux_ribbed","ribbed_45mm","ribbed_60mm","tappered","triangle","aqualine"]},
            {"id":"vmd-design-lh-004", "product_type": "flat-embossed-vmd", "category": "Leather", "design_code": "LH-BR-04", "design_name": "LH-BR-04", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-BR-04.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-BR-04.jpg", "color_name": "LH-BR-04", "available_emboss": ["flux_ribbed","ribbed_45mm","ribbed_60mm","tappered","triangle","aqualine"]},
            {"id":"vmd-design-lh-005", "product_type": "flat-embossed-vmd", "category": "Leather", "design_code": "LH-BR-05", "design_name": "LH-BR-05", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-BR-05.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-BR-05.jpg", "color_name": "LH-BR-05", "available_emboss": ["flux_ribbed","ribbed_45mm","ribbed_60mm","tappered","triangle","aqualine"]},
            {"id":"vmd-design-lh-006", "product_type": "flat-embossed-vmd", "category": "Leather", "design_code": "LH-BR-06", "design_name": "LH-BR-06", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-BR-06.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-BR-06.jpg", "color_name": "LH-BR-06", "available_emboss": ["flux_ribbed","ribbed_45mm","ribbed_60mm","tappered","triangle","aqualine"]},
            {"id":"vmd-design-lh-007", "product_type": "flat-embossed-vmd", "category": "Leather", "design_code": "LH-GR-01", "design_name": "LH-GR-01", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-GR-01.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-GR-01.jpg", "color_name": "LH-GR-01", "available_emboss": ["flux_ribbed","ribbed_45mm","ribbed_60mm","tappered","triangle","aqualine"]},
            {"id":"vmd-design-lh-008", "product_type": "flat-embossed-vmd", "category": "Leather", "design_code": "LH-GY-01", "design_name": "LH-GY-01", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-GY-01.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-GY-01.jpg", "color_name": "LH-GY-01", "available_emboss": ["flux_ribbed","ribbed_45mm","ribbed_60mm","tappered","triangle","aqualine"]},
            {"id":"vmd-design-lh-009", "product_type": "flat-embossed-vmd", "category": "Leather", "design_code": "LH-GY-02", "design_name": "LH-GY-02", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-GY-02.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-GY-02.jpg", "color_name": "LH-GY-02", "available_emboss": ["flux_ribbed","ribbed_45mm","ribbed_60mm","tappered","triangle","aqualine"]},
            {"id":"vmd-design-lh-010", "product_type": "flat-embossed-vmd", "category": "Leather", "design_code": "LH-NE-01", "design_name": "LH-NE-01", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-NE-01.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-NE-01.jpg", "color_name": "LH-NE-01", "available_emboss": ["flux_ribbed","ribbed_45mm","ribbed_60mm","tappered","triangle","aqualine"]},
            {"id":"vmd-design-lh-011", "product_type": "flat-embossed-vmd", "category": "Leather", "design_code": "LH-NE-02", "design_name": "LH-NE-02", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-NE-02.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-NE-02.jpg", "color_name": "LH-NE-02", "available_emboss": ["flux_ribbed","ribbed_45mm","ribbed_60mm","tappered","triangle","aqualine"]},
        ],
        "Woven Brushwork": [
            {"id": "vmd-design-wb-001", "product_type": "flat-embossed-vmd", "category": "Woven Brushwork", "design_code": "AB-BL-01", "design_name": "AB-BL-01", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-woven-brushwork/AB-BL-01.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-woven-brushwork/AB-BL-01.jpg", "color_name": "AB-BL-01"},
            {"id": "vmd-design-wb-002", "product_type": "flat-embossed-vmd", "category": "Woven Brushwork", "design_code": "AB-NC-05", "design_name": "AB-NC-05", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-woven-brushwork/AB-NC-05.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-woven-brushwork/AB-NC-05.jpg", "color_name": "AB-NC-05"},
            {"id": "vmd-design-wb-003", "product_type": "flat-embossed-vmd", "category": "Woven Brushwork", "design_code": "AB-NC-12", "design_name": "AB-NC-12", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-woven-brushwork/AB-NC-12.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-woven-brushwork/AB-NC-12.jpg", "color_name": "AB-NC-12"},
            {
                "id": "vmd-design-wb-004", "product_type": "flat-embossed-vmd", "category": "Woven Brushwork", "design_code": "SR-NC-02", "design_name": "SR-NC-02", "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-woven-brushwork/SR-NC-02-PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-woven-brushwork/SR-NC-02-PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-woven-brushwork/SR-NC-02-PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-woven-brushwork/SR-NC-02-PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-woven-brushwork/SR-NC-02-PanelA.jpg",
                ],
                "color_name": "SR-NC-02",
            },
            {"id": "vmd-design-wb-005", "product_type": "flat-embossed-vmd", "category": "Woven Brushwork", "design_code": "SR-NC-03", "design_name": "SR-NC-03", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-woven-brushwork/SR-NC-03.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-woven-brushwork/SR-NC-03.jpg", "color_name": "SR-NC-03"},
            {"id": "vmd-design-wb-006", "product_type": "flat-embossed-vmd", "category": "Woven Brushwork", "design_code": "SR-NC-04", "design_name": "SR-NC-04", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-woven-brushwork/SR-NC-04.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-woven-brushwork/SR-NC-04.jpg", "color_name": "SR-NC-04"},
            {"id": "vmd-design-wb-007", "product_type": "flat-embossed-vmd", "category": "Woven Brushwork", "design_code": "SR-NC-06", "design_name": "SR-NC-06", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-woven-brushwork/SR-NC-06.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-woven-brushwork/SR-NC-06.jpg", "color_name": "SR-NC-06"},
            {
                "id": "vmd-design-wb-008", "product_type": "flat-embossed-vmd", "category": "Woven Brushwork", "design_code": "SR-NC-13", "design_name": "SR-NC-13", "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-woven-brushwork/SR-NC-13-PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-woven-brushwork/SR-NC-13-PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-woven-brushwork/SR-NC-13-PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-woven-brushwork/SR-NC-13-PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-woven-brushwork/SR-NC-13-PanelA.jpg",
                ],
                "color_name": "SR-NC-13",
            },
            {"id": "vmd-design-wb-009", "product_type": "flat-embossed-vmd", "category": "Woven Brushwork", "design_code": "SR-NC-18", "design_name": "SR-NC-18", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-woven-brushwork/SR-NC-18.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-woven-brushwork/SR-NC-18.jpg", "color_name": "SR-NC-18"},
            {"id": "vmd-design-wb-010", "product_type": "flat-embossed-vmd", "category": "Woven Brushwork", "design_code": "WP-BR-01", "design_name": "WP-BR-01", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-woven-brushwork/WP-BR-01.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-woven-brushwork/WP-BR-01.jpg", "color_name": "WP-BR-01"},
            {"id": "vmd-design-wb-011", "product_type": "flat-embossed-vmd", "category": "Woven Brushwork", "design_code": "WP-NC-07", "design_name": "WP-NC-07", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-woven-brushwork/WP-NC-07.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-woven-brushwork/WP-NC-07.jpg", "color_name": "WP-NC-07"},
        ],
        "Nature Reimagined": [
            {
                "id": "vmd-design-nr-001", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "NA-BL-01", "design_name": "NA-BL-01", "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-BL-01-PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-BL-01-PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-BL-01-PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-BL-01-PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-BL-01-PanelC.jpg",
                ],
                "color_name": "NA-BL-01",
            },
            {
                "id": "vmd-design-nr-002", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "NA-BL-02", "design_name": "NA-BL-02", "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-BL-02-PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-BL-02-PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-BL-02-PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-BL-02-PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-BL-02-PanelC.jpg",
                ],
                "color_name": "NA-BL-02",
            },
            {"id": "vmd-design-nr-003", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "NA-BL-03", "design_name": "NA-BL-03", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-BL-03.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-BL-03.jpg", "color_name": "NA-BL-03"},
            {
                "id": "vmd-design-nr-004", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "NA-GR-01", "design_name": "NA-GR-01", "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-GR-01-PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-GR-01-PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-GR-01-PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-GR-01-PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-GR-01-PanelC.jpg",
                ],
                "color_name": "NA-GR-01",
            },
            {
                "id": "vmd-design-nr-005", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "NA-GR-02", "design_name": "NA-GR-02", "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-GR-02-PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-GR-02-PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-GR-02-PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-GR-02-PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-GR-02-PanelC.jpg",
                ],
                "color_name": "NA-GR-02",
            },
            # {"id": "vmd-design-nr-006", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "NA-GR-03", "design_name": "NA-GR-03", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-GR-03.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-GR-03.jpg", "color_name": "NA-GR-03"},
            # {"id": "vmd-design-nr-007", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "NA-GR-04", "design_name": "NA-GR-04", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-GR-04.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-GR-04.jpg", "color_name": "NA-GR-04"},
            {"id": "vmd-design-nr-008", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "NA-GR-05", "design_name": "NA-GR-05", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-GR-05.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-GR-05.jpg", "color_name": "NA-GR-05"},
            # {"id": "vmd-design-nr-009", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "NA-NC-16", "design_name": "NA-NC-16", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-NC-16.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-NC-16.jpg", "color_name": "NA-NC-16"},
            {
                "id": "vmd-design-nr-010", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "NA-NC-19", "design_name": "NA-NC-19", "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-NC-19_PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-NC-19_PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-NC-19_PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-NC-19_PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-NC-19_PanelC.jpg",
                ],
                "color_name": "NA-NC-19",
            },
            {
                "id": "vmd-design-nr-011", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "NA-NE-01", "design_name": "NA-NE-01", "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-NE-01_PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-NE-01_PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-NE-01_PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-NE-01_PanelB.jpg",
                ],
                "color_name": "NA-NE-01",
            },
            {
                "id": "vmd-design-nr-012", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "NA-NE-02", "design_name": "NA-NE-02", "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-NE-02_PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-NE-02_PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-NE-02_PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-NE-02_PanelB.jpg",
                ],
                "color_name": "NA-NE-02",
            },
            {
                "id": "vmd-design-nr-013", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "NA-RD-01", "design_name": "NA-RD-01", "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-RD-01-PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-RD-01-PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-RD-01-PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-RD-01-PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-RD-01-PanelC.jpg",
                ],
                "color_name": "NA-RD-01",
            },
            {
                "id": "vmd-design-nr-014", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "NA-RD-02", "design_name": "NA-RD-02", "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-RD-02-PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-RD-02-PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-RD-02-PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-RD-02-PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-RD-02-PanelC.jpg",
                ],
                "color_name": "NA-RD-02",
            },
            {
                "id": "vmd-design-nr-015", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "NA-YL-01", "design_name": "NA-YL-01", "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-YL-01-PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-YL-01-PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-YL-01-PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-YL-01-PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-YL-01-PanelC.jpg",
                ],
                "color_name": "NA-YL-01",
            },
            {
                "id": "vmd-design-nr-016", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "NA-YL-02", "design_name": "NA-YL-02", "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-YL-02-PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-YL-02-PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-YL-02-PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-YL-02-PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/NA-YL-02-PanelC.jpg",
                ],
                "color_name": "NA-YL-02",
            },
            # {"id": "vmd-design-nr-017", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "WP-BL-04", "design_name": "WP-BL-04", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/WP-BL-04.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/WP-BL-04.jpg", "color_name": "WP-BL-04"},
            {"id": "vmd-design-nr-018", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "WP-BR-02", "design_name": "WP-BR-02", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/WP-BR-02.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/WP-BR-02.jpg", "color_name": "WP-BR-02"},
            {
                "id": "vmd-design-nr-019", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "WP-GR-04", "design_name": "WP-GR-04", "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/WP-GR-04-PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/WP-GR-04-PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/WP-GR-04-PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/WP-GR-04-PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/WP-GR-04-PanelC.jpg",
                ],
                "color_name": "WP-GR-04",
            },
            {
                "id": "vmd-design-nr-020", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "WP-NC-04", "design_name": "WP-NC-04", "texture_color": "#FFFFFF",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/WP-NC-04-PanelA.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/WP-NC-04-PanelA.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/WP-NC-04-PanelA.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/WP-NC-04-PanelB.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/WP-NC-04-PanelC.jpg",
                ],
                "color_name": "WP-NC-04",
            },
            # {"id": "vmd-design-nr-021", "product_type": "flat-embossed-vmd", "category": "Nature Reimagined", "design_code": "WP-OR-02", "design_name": "WP-OR-02", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-nature-reimagined/WP-OR-02.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-nature-reimagined/WP-OR-02.jpg", "color_name": "WP-OR-02"},
        ],
        "Patterned Weaves": [
            {"id": "vmd-design-pw-001", "product_type": "flat-embossed-vmd", "category": "Patterned Weaves", "design_code": "FB-PT-43", "design_name": "FB-PT-43", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-43.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-43.jpg", "color_name": "FB-PT-43"},
            {"id": "vmd-design-pw-002", "product_type": "flat-embossed-vmd", "category": "Patterned Weaves", "design_code": "FB-PT-45", "design_name": "FB-PT-45", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-45.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-45.jpg", "color_name": "FB-PT-45"},
            {"id": "vmd-design-pw-003", "product_type": "flat-embossed-vmd", "category": "Patterned Weaves", "design_code": "FB-PT-47", "design_name": "FB-PT-47", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-47.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-47.jpg", "color_name": "FB-PT-47"},
            {"id": "vmd-design-pw-004", "product_type": "flat-embossed-vmd", "category": "Patterned Weaves", "design_code": "FB-PT-50", "design_name": "FB-PT-50", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-50.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-50.jpg", "color_name": "FB-PT-50"},
            {"id": "vmd-design-pw-005", "product_type": "flat-embossed-vmd", "category": "Patterned Weaves", "design_code": "FB-PT-51", "design_name": "FB-PT-51", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-51.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-51.jpg", "color_name": "FB-PT-51"},
            {"id": "vmd-design-pw-006", "product_type": "flat-embossed-vmd", "category": "Patterned Weaves", "design_code": "FB-PT-52", "design_name": "FB-PT-52", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-52.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-52.jpg", "color_name": "FB-PT-52"},
            {"id": "vmd-design-pw-007", "product_type": "flat-embossed-vmd", "category": "Patterned Weaves", "design_code": "FB-PT-54", "design_name": "FB-PT-54", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-54.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-54.jpg", "color_name": "FB-PT-54"},
            {"id": "vmd-design-pw-008", "product_type": "flat-embossed-vmd", "category": "Patterned Weaves", "design_code": "FB-PT-55", "design_name": "FB-PT-55", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-55.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-55.jpg", "color_name": "FB-PT-55"},
            {"id": "vmd-design-pw-009", "product_type": "flat-embossed-vmd", "category": "Patterned Weaves", "design_code": "FB-PT-56", "design_name": "FB-PT-56", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-56.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-56.jpg", "color_name": "FB-PT-56"},
            {"id": "vmd-design-pw-010", "product_type": "flat-embossed-vmd", "category": "Patterned Weaves", "design_code": "FB-PT-59", "design_name": "FB-PT-59", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-59.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-59.jpg", "color_name": "FB-PT-59"},
            {"id": "vmd-design-pw-011", "product_type": "flat-embossed-vmd", "category": "Patterned Weaves", "design_code": "FB-PT-60", "design_name": "FB-PT-60", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-60.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-60.jpg", "color_name": "FB-PT-60"},
            {"id": "vmd-design-pw-012", "product_type": "flat-embossed-vmd", "category": "Patterned Weaves", "design_code": "FB-PT-62", "design_name": "FB-PT-62", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-62.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-62.jpg", "color_name": "FB-PT-62"},
            {"id": "vmd-design-pw-013", "product_type": "flat-embossed-vmd", "category": "Patterned Weaves", "design_code": "FB-PT-80", "design_name": "FB-PT-80", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-80.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-patterned-weaves/FB-PT-80.jpg", "color_name": "FB-PT-80"},
            {"id": "vmd-design-pw-014", "product_type": "flat-embossed-vmd", "category": "Patterned Weaves", "design_code": "WP-GR-02", "design_name": "WP-GR-02", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-patterned-weaves/WP-GR-02.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-patterned-weaves/WP-GR-02.jpg", "color_name": "WP-GR-02"},
        ],
        "Wood Classics": [
            {"id": "vmd-design-wc-001", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-01", "design_name": "WD-NC-01", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-01.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-01.jpg", "color_name": "WD-NC-01", "available_emboss": []},
            {"id": "vmd-design-wc-002", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-02", "design_name": "WD-NC-02", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-02.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-02.jpg", "color_name": "WD-NC-02", "available_emboss": []},
            {"id": "vmd-design-wc-003", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-03", "design_name": "WD-NC-03", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-03.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-03.jpg", "color_name": "WD-NC-03", "available_emboss": []},
            {"id": "vmd-design-wc-004", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-04", "design_name": "WD-NC-04", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-04.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-04.jpg", "color_name": "WD-NC-04", "available_emboss": []},
            {"id": "vmd-design-wc-005", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-05", "design_name": "WD-NC-05", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-05.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-05.jpg", "color_name": "WD-NC-05", "available_emboss": ["flux_ribbed","ribbed_25mm", "ribbed_45mm", "ribbed_60mm"]},
            {"id": "vmd-design-wc-006", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-06", "design_name": "WD-NC-06", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-06.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-06.jpg", "color_name": "WD-NC-06", "available_emboss": []},
            {"id": "vmd-design-wc-007", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-07", "design_name": "WD-NC-07", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-07.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-07.jpg", "color_name": "WD-NC-07", "available_emboss": []},
            {"id": "vmd-design-wc-008", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-08", "design_name": "WD-NC-08", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-08.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-08.jpg", "color_name": "WD-NC-08", "available_emboss": []},
            {"id": "vmd-design-wc-009", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-09", "design_name": "WD-NC-09", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-09.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-09.jpg", "color_name": "WD-NC-09", "available_emboss": ["flux_ribbed","ribbed_25mm", "ribbed_45mm", "ribbed_60mm"]},
            {"id": "vmd-design-wc-010", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-10", "design_name": "WD-NC-10", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-10.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-10.jpg", "color_name": "WD-NC-10", "available_emboss": []},
            {"id": "vmd-design-wc-011", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-11", "design_name": "WD-NC-11", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-11.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-11.jpg", "color_name": "WD-NC-11", "available_emboss": []},
            {"id": "vmd-design-wc-012", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-12", "design_name": "WD-NC-12", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-12.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-12.jpg", "color_name": "WD-NC-12", "available_emboss": []},
            {"id": "vmd-design-wc-013", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-13", "design_name": "WD-NC-13", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-13.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-13.jpg", "color_name": "WD-NC-13", "available_emboss": ["flux_ribbed","ribbed_25mm", "ribbed_45mm", "ribbed_60mm"]},
            {"id": "vmd-design-wc-014", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-14", "design_name": "WD-NC-14", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-14.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-14.jpg", "color_name": "WD-NC-14", "available_emboss": []},
            {"id": "vmd-design-wc-015", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-15", "design_name": "WD-NC-15", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-15.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-15.jpg", "color_name": "WD-NC-15", "available_emboss": []},
            {"id": "vmd-design-wc-016", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-16", "design_name": "WD-NC-16", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-16.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-16.jpg", "color_name": "WD-NC-16", "available_emboss": []},
            {"id": "vmd-design-wc-017", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-17", "design_name": "WD-NC-17", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-17.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-17.jpg", "color_name": "WD-NC-17", "available_emboss": []},
            {"id": "vmd-design-wc-018", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-18", "design_name": "WD-NC-18", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-18.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-18.jpg", "color_name": "WD-NC-18", "available_emboss": []},
            {"id": "vmd-design-wc-019", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-19", "design_name": "WD-NC-19", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-19.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-19.jpg", "color_name": "WD-NC-19", "available_emboss": []},
            {"id": "vmd-design-wc-020", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-20", "design_name": "WD-NC-20", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-20.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-20.jpg", "color_name": "WD-NC-20", "available_emboss": []},
            {"id": "vmd-design-wc-021", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-21", "design_name": "WD-NC-21", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-21.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-21.jpg", "color_name": "WD-NC-21", "available_emboss": ["flux_ribbed","ribbed_25mm", "ribbed_45mm", "ribbed_60mm"]},
            {"id": "vmd-design-wc-022", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-22", "design_name": "WD-NC-22", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-22.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-22.jpg", "color_name": "WD-NC-22", "available_emboss": []},
            {"id": "vmd-design-wc-023", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-23", "design_name": "WD-NC-23", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-23.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-23.jpg", "color_name": "WD-NC-23", "available_emboss": ["flux_ribbed","ribbed_25mm", "ribbed_45mm", "ribbed_60mm"]},
            {"id": "vmd-design-wc-024", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-24", "design_name": "WD-NC-24", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-24.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-24.jpg", "color_name": "WD-NC-24", "available_emboss": ["flux_ribbed","ribbed_25mm", "ribbed_45mm", "ribbed_60mm"]},
            {"id": "vmd-design-wc-025", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-25", "design_name": "WD-NC-25", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-25.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-25.jpg", "color_name": "WD-NC-25", "available_emboss": []},
            {"id": "vmd-design-wc-026", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-26", "design_name": "WD-NC-26", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-26.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-26.jpg", "color_name": "WD-NC-26", "available_emboss": []},
            {"id": "vmd-design-wc-027", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-27", "design_name": "WD-NC-27", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-27.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-27.jpg", "color_name": "WD-NC-27", "available_emboss": []},
            {"id": "vmd-design-wc-028", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-28", "design_name": "WD-NC-28", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-28.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-28.jpg", "color_name": "WD-NC-28", "available_emboss": []},
            {"id": "vmd-design-wc-029", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-29", "design_name": "WD-NC-29", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-29.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-29.jpg", "color_name": "WD-NC-29", "available_emboss": []},
            {"id": "vmd-design-wc-030", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-30", "design_name": "WD-NC-30", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-30.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-30.jpg", "color_name": "WD-NC-30", "available_emboss": []},
            {"id": "vmd-design-wc-031", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-31", "design_name": "WD-NC-31", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-31.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-31.jpg", "color_name": "WD-NC-31", "available_emboss": []},
            {"id": "vmd-design-wc-032", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-32", "design_name": "WD-NC-32", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-32.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-32.jpg", "color_name": "WD-NC-32", "available_emboss": []},
            {"id": "vmd-design-wc-033", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-33", "design_name": "WD-NC-33", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-33.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-33.jpg", "color_name": "WD-NC-33", "available_emboss": ["flux_ribbed","ribbed_25mm", "ribbed_45mm", "ribbed_60mm"]},
            {"id": "vmd-design-wc-034", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-34", "design_name": "WD-NC-34", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-34.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-34.jpg", "color_name": "WD-NC-34", "available_emboss": ["flux_ribbed","ribbed_25mm", "ribbed_45mm", "ribbed_60mm"]},
            {"id": "vmd-design-wc-035", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-35", "design_name": "WD-NC-35", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-35.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-35.jpg", "color_name": "WD-NC-35", "available_emboss": []},
            {"id": "vmd-design-wc-036", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-36", "design_name": "WD-NC-36", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-36.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-36.jpg", "color_name": "WD-NC-36", "available_emboss": []},
            {"id": "vmd-design-wc-037", "product_type": "wood", "category": "Wood Classics", "design_code": "WD-NC-37", "design_name": "WD-NC-37", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-37.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-wood-classics/WD-NC-37.jpg", "color_name": "WD-NC-37", "available_emboss": []},
        ],
        "Modern Corporate": [
            {"id": "vmd-design-mc-001", "product_type": "flat-embossed-vmd", "category": "Modern Corporate", "design_code": "FB-PT-44", "design_name": "FB-PT-44", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-44.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-44.jpg", "color_name": "FB-PT-44"},
            {"id": "vmd-design-mc-002", "product_type": "flat-embossed-vmd", "category": "Modern Corporate", "design_code": "FB-PT-46", "design_name": "FB-PT-46", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-46.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-46.jpg", "color_name": "FB-PT-46"},
            {"id": "vmd-design-mc-003", "product_type": "flat-embossed-vmd", "category": "Modern Corporate", "design_code": "FB-PT-48", "design_name": "FB-PT-48", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-48.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-48.jpg", "color_name": "FB-PT-48"},
            {"id": "vmd-design-mc-004", "product_type": "flat-embossed-vmd", "category": "Modern Corporate", "design_code": "FB-PT-49", "design_name": "FB-PT-49", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-49.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-49.jpg", "color_name": "FB-PT-49"},
            {"id": "vmd-design-mc-005", "product_type": "flat-embossed-vmd", "category": "Modern Corporate", "design_code": "FB-PT-53", "design_name": "FB-PT-53", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-53.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-53.jpg", "color_name": "FB-PT-53"},
            {"id": "vmd-design-mc-006", "product_type": "flat-embossed-vmd", "category": "Modern Corporate", "design_code": "FB-PT-57", "design_name": "FB-PT-57", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-57.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-57.jpg", "color_name": "FB-PT-57"},
            {"id": "vmd-design-mc-007", "product_type": "flat-embossed-vmd", "category": "Modern Corporate", "design_code": "FB-PT-58", "design_name": "FB-PT-58", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-58.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-58.jpg", "color_name": "FB-PT-58"},
            {"id": "vmd-design-mc-008", "product_type": "flat-embossed-vmd", "category": "Modern Corporate", "design_code": "FB-PT-61", "design_name": "FB-PT-61", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-61.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-61.jpg", "color_name": "FB-PT-61"},
            {"id": "vmd-design-mc-009", "product_type": "flat-embossed-vmd", "category": "Modern Corporate", "design_code": "FB-PT-63", "design_name": "FB-PT-63", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-63.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-63.jpg", "color_name": "FB-PT-63"},
            {"id": "vmd-design-mc-010", "product_type": "flat-embossed-vmd", "category": "Modern Corporate", "design_code": "FB-PT-64", "design_name": "FB-PT-64", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-64.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-64.jpg", "color_name": "FB-PT-64"},
            {"id": "vmd-design-mc-011", "product_type": "flat-embossed-vmd", "category": "Modern Corporate", "design_code": "FB-PT-65", "design_name": "FB-PT-65", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-65.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-65.jpg", "color_name": "FB-PT-65"},
            {"id": "vmd-design-mc-012", "product_type": "flat-embossed-vmd", "category": "Modern Corporate", "design_code": "FB-PT-87", "design_name": "FB-PT-87", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-87.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-modern-corporate/FB-PT-87.jpg", "color_name": "FB-PT-87"},
        ],
        "Soft Texture": [
            {"id": "vmd-design-st-001", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-BL-01", "design_name": "TP-BL-01", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-BL-01.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-BL-01.jpg", "color_name": "TP-BL-01"},
            {"id": "vmd-design-st-002", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-BL-02", "design_name": "TP-BL-02", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-BL-02.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-BL-02.jpg", "color_name": "TP-BL-02"},
            {"id": "vmd-design-st-003", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-BL-03", "design_name": "TP-BL-03", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-BL-03.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-BL-03.jpg", "color_name": "TP-BL-03"},
            {"id": "vmd-design-st-004", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-GR-01", "design_name": "TP-GR-01", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-GR-01.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-GR-01.jpg", "color_name": "TP-GR-01"},
            {"id": "vmd-design-st-005", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-GR-02", "design_name": "TP-GR-02", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-GR-02.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-GR-02.jpg", "color_name": "TP-GR-02"},
            {"id": "vmd-design-st-006", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-GR-03", "design_name": "TP-GR-03", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-GR-03.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-GR-03.jpg", "color_name": "TP-GR-03"},
            {"id": "vmd-design-st-007", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-GY-01", "design_name": "TP-GY-01", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-GY-01.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-GY-01.jpg", "color_name": "TP-GY-01"},
            {"id": "vmd-design-st-008", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-GY-02", "design_name": "TP-GY-02", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-GY-02.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-GY-02.jpg", "color_name": "TP-GY-02"},
            {"id": "vmd-design-st-009", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-GY-03", "design_name": "TP-GY-03", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-GY-03.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-GY-03.jpg", "color_name": "TP-GY-03"},
            {"id": "vmd-design-st-010", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-NE-01", "design_name": "TP-NE-01", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-01.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-01.jpg", "color_name": "TP-NE-01"},
            {"id": "vmd-design-st-011", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-NE-02", "design_name": "TP-NE-02", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-02.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-02.jpg", "color_name": "TP-NE-02"},
            {"id": "vmd-design-st-012", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-NE-03", "design_name": "TP-NE-03", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-03.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-03.jpg", "color_name": "TP-NE-03"},
            {"id": "vmd-design-st-013", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-NE-04", "design_name": "TP-NE-04", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-04.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-04.jpg", "color_name": "TP-NE-04"},
            {"id": "vmd-design-st-014", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-NE-05", "design_name": "TP-NE-05", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-05.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-05.jpg", "color_name": "TP-NE-05"},
            {"id": "vmd-design-st-015", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-NE-06", "design_name": "TP-NE-06", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-06.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-06.jpg", "color_name": "TP-NE-06"},
            {"id": "vmd-design-st-016", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-NE-07", "design_name": "TP-NE-07", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-07.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-07.jpg", "color_name": "TP-NE-07"},
            {"id": "vmd-design-st-017", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-NE-08", "design_name": "TP-NE-08", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-08.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-08.jpg", "color_name": "TP-NE-08"},
            {"id": "vmd-design-st-018", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-NE-09", "design_name": "TP-NE-09", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-09.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-09.jpg", "color_name": "TP-NE-09"},
            {"id": "vmd-design-st-019", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-NE-10", "design_name": "TP-NE-10", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-10.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-10.jpg", "color_name": "TP-NE-10"},
            {"id": "vmd-design-st-020", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-NE-11", "design_name": "TP-NE-11", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-11.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-11.jpg", "color_name": "TP-NE-11"},
            {"id": "vmd-design-st-021", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-NE-12", "design_name": "TP-NE-12", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-12.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-12.jpg", "color_name": "TP-NE-12"},
            {"id": "vmd-design-st-022", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-NE-13", "design_name": "TP-NE-13", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-13.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-13.jpg", "color_name": "TP-NE-13"},
            {"id": "vmd-design-st-023", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-NE-14", "design_name": "TP-NE-14", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-14.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-NE-14.jpg", "color_name": "TP-NE-14"},
            {"id": "vmd-design-st-024", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-PK-01", "design_name": "TP-PK-01", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-PK-01.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-PK-01.jpg", "color_name": "TP-PK-01"},
            {"id": "vmd-design-st-025", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-PK-02", "design_name": "TP-PK-02", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-PK-02.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-PK-02.jpg", "color_name": "TP-PK-02"},
            {"id": "vmd-design-st-026", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-PK-03", "design_name": "TP-PK-03", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-PK-03.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-PK-03.jpg", "color_name": "TP-PK-03"},
            {"id": "vmd-design-st-027", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-PK-04", "design_name": "TP-PK-04", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-PK-04.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-PK-04.jpg", "color_name": "TP-PK-04"},
            {"id": "vmd-design-st-028", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-PK-05", "design_name": "TP-PK-05", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-PK-05.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-PK-05.jpg", "color_name": "TP-PK-05"},
            {"id": "vmd-design-st-029", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-PU-01", "design_name": "TP-PU-01", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-PU-01.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-PU-01.jpg", "color_name": "TP-PU-01"},
            {"id": "vmd-design-st-030", "product_type": "flat-embossed-vmd", "category": "Soft Texture", "design_code": "TP-PU-02", "design_name": "TP-PU-02", "texture_color": "#FFFFFF", "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-soft-texture/TP-PU-02.jpg", "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-soft-texture/TP-PU-02.jpg", "color_name": "TP-PU-02"},
        ],
        "Wood Perforations": [
            {"id": "wood-pf-001", "product_type": "wood", "category": "Wood Perforations", "design_code": "WD-NC-05", "design_name": "WD-NC-05", "texture_color": "#886840", "texture_url": "/static/images/wood/panels/wood-perfocations/WD-NC-05.jpg", "thumbnail_url": "/thumb/wood/panels/wood-perfocations/WD-NC-05.jpg", "color_name": "WD-NC-05"},
            {"id": "wood-pf-002", "product_type": "wood", "category": "Wood Perforations", "design_code": "WD-NC-21", "design_name": "WD-NC-21", "texture_color": "#C8A060", "texture_url": "/static/images/wood/panels/wood-perfocations/WD-NC-21.jpg", "thumbnail_url": "/thumb/wood/panels/wood-perfocations/WD-NC-21.jpg", "color_name": "WD-NC-21"},
            {"id": "wood-pf-003", "product_type": "wood", "category": "Wood Perforations", "design_code": "WD-NC-24", "design_name": "WD-NC-24", "texture_color": "#C0A878", "texture_url": "/static/images/wood/panels/wood-perfocations/WD-NC-24.jpg", "thumbnail_url": "/thumb/wood/panels/wood-perfocations/WD-NC-24.jpg", "color_name": "WD-NC-24"},
            {"id": "wood-pf-004", "product_type": "wood", "category": "Wood Perforations", "design_code": "WD-NC-33", "design_name": "WD-NC-33", "texture_color": "#B8A080", "texture_url": "/static/images/wood/panels/wood-perfocations/WD-NC-33.jpg", "thumbnail_url": "/thumb/wood/panels/wood-perfocations/WD-NC-33.jpg", "color_name": "WD-NC-33"},
            {"id": "wood-pf-005", "product_type": "wood", "category": "Wood Perforations", "design_code": "WD-NC-34", "design_name": "WD-NC-34", "texture_color": "#A89070", "texture_url": "/static/images/wood/panels/wood-perfocations/WD-NC-34.jpg", "thumbnail_url": "/thumb/wood/panels/wood-perfocations/WD-NC-34.jpg", "color_name": "WD-NC-34"},
        ],
        "Classic Parquet": [
            {"id": "wood-cp-002", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-01", "design_name": "PR-NC-01", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-01.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-01.jpg", "color_name": "PR-NC-01"},
            {"id": "wood-cp-003", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-02", "design_name": "PR-NC-02", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-02.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-02.jpg", "color_name": "PR-NC-02"},
            {"id": "wood-cp-004", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-05", "design_name": "PR-NC-05", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-05.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-05.jpg", "color_name": "PR-NC-05"},
            {"id": "wood-cp-005", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-06", "design_name": "PR-NC-06", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-06.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-06.jpg", "color_name": "PR-NC-06"},
            {"id": "wood-cp-006", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-07", "design_name": "PR-NC-07", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-07.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-07.jpg", "color_name": "PR-NC-07"},
            {"id": "wood-cp-007", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-08", "design_name": "PR-NC-08", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-08.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-08.jpg", "color_name": "PR-NC-08"},
            {"id": "wood-cp-008", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-09", "design_name": "PR-NC-09", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-09.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-09.jpg", "color_name": "PR-NC-09"},
            {"id": "wood-cp-009", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-10", "design_name": "PR-NC-10", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-10.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-10.jpg", "color_name": "PR-NC-10"},
            {"id": "wood-cp-010", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-11", "design_name": "PR-NC-11", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-11.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-11.jpg", "color_name": "PR-NC-11"},
            {"id": "wood-cp-011", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-12", "design_name": "PR-NC-12", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-12.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-12.jpg", "color_name": "PR-NC-12"},
            {"id": "wood-cp-012", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-13", "design_name": "PR-NC-13", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-13.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-13.jpg", "color_name": "PR-NC-13"},
            {"id": "wood-cp-013", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-14", "design_name": "PR-NC-14", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-14.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-14.jpg", "color_name": "PR-NC-14"},
            {"id": "wood-cp-014", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-15", "design_name": "PR-NC-15", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-15.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-15.jpg", "color_name": "PR-NC-15"},
            {"id": "wood-cp-015", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-16", "design_name": "PR-NC-16", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-16.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-16.jpg", "color_name": "PR-NC-16"},
            {"id": "wood-cp-016", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-17", "design_name": "PR-NC-17", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-17.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-17.jpg", "color_name": "PR-NC-17"},
            {"id": "wood-cp-017", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-18", "design_name": "PR-NC-18", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-18.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-18.jpg", "color_name": "PR-NC-18"},
            {"id": "wood-cp-018", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-19", "design_name": "PR-NC-19", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-19.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-19.jpg", "color_name": "PR-NC-19"},
            {"id": "wood-cp-019", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-20", "design_name": "PR-NC-20", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-20.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-20.jpg", "color_name": "PR-NC-20"},
            {"id": "wood-cp-020", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-21", "design_name": "PR-NC-21", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-21.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-21.jpg", "color_name": "PR-NC-21"},
            {"id": "wood-cp-021", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-22", "design_name": "PR-NC-22", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-22.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-22.jpg", "color_name": "PR-NC-22"},
            {"id": "wood-cp-022", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-23", "design_name": "PR-NC-23", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-23.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-23.jpg", "color_name": "PR-NC-23"},
            {"id": "wood-cp-023", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-24", "design_name": "PR-NC-24", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-24.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-24.jpg", "color_name": "PR-NC-24"},
            {"id": "wood-cp-024", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-25", "design_name": "PR-NC-25", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-25.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-25.jpg", "color_name": "PR-NC-25"},
            {"id": "wood-cp-025", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-26", "design_name": "PR-NC-26", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-26.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-26.jpg", "color_name": "PR-NC-26"},
            {"id": "wood-cp-026", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-27", "design_name": "PR-NC-27", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-27.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-27.jpg", "color_name": "PR-NC-27"},
            {"id": "wood-cp-027", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-28", "design_name": "PR-NC-28", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-28.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-28.jpg", "color_name": "PR-NC-28"},
            {"id": "wood-cp-028", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-29", "design_name": "PR-NC-29", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-29.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-29.jpg", "color_name": "PR-NC-29"},
            {"id": "wood-cp-029", "product_type": "wood", "category": "Classic Parquet", "design_code": "PR-NC-30", "design_name": "PR-NC-30", "texture_color": "#FFFFFF", "texture_url": "/static/images/wood/panels/classic_parquet/PR-NC-30.jpg", "thumbnail_url": "/thumb/wood/panels/classic_parquet/PR-NC-30.jpg", "color_name": "PR-NC-30"},
        ],
    }

    design_counter = 1
    for cat in vmd_categories_non_emboss:
        cat_id = f"vmd-{cat.lower().replace(' ', '-').replace('&', 'and')}"
        category = {
            "id": cat_id,
            "name": cat,
            "product_type": "flat-embossed-vmd",
            "emboss_available": False,
            "designs": []
        }
        if cat in EXPLICIT_CATEGORY_DESIGNS:
            # Use hand-crafted design list with real image paths
            category["designs"] = EXPLICIT_CATEGORY_DESIGNS[cat]
        else:
            # Auto-generate placeholder designs for categories without assets yet
            for i in range(4):
                color = solid_colors[(design_counter - 1) % len(solid_colors)]
                category["designs"].append({
                    "id": f"vmd-design-{design_counter}",
                    "product_type": "flat-embossed-vmd",
                    "category": cat,
                    "design_code": f"VMD-{design_counter:04d}",
                    "design_name": f"{cat} Design {i+1}",
                    "texture_color": color,
                    "texture_url": None,
                    "thumbnail_url": None,
                    "color_name": ["Warm Tan", "Espresso", "Sienna", "Desert Sand", "Natural Oak", "Rose Clay", "Wheat", "Sandy", "Mocha", "Olive"][i % 10],
                })
                design_counter += 1
        vmd_panel["categories"].append(category)
    
    for cat in vmd_categories_emboss:
        category = {
            "id": f"vmd-{cat.lower().replace(' ', '-')}",
            "name": cat,
            "product_type": "flat-embossed-vmd",
            "emboss_available": True,
            "flat_available": True,
            "designs": []
        }
        # If there are explicit designs provided for this category, use them
        if cat in EXPLICIT_CATEGORY_DESIGNS:
            category["designs"] = EXPLICIT_CATEGORY_DESIGNS[cat]
        else:
            for i in range(4):
                color = solid_colors[(design_counter - 1) % len(solid_colors)]
                category["designs"].append({
                    "id": f"vmd-design-{design_counter}",
                    "product_type": "flat-embossed-vmd",
                    "category": cat,
                    "design_code": f"VMD-{design_counter:04d}",
                    "design_name": f"{cat} Design {i+1}",
                    "texture_color": color,
                    "texture_url": None,
                    "thumbnail_url": None,
                    "color_name": ["Carrara White", "Noir", "Walnut", "Charcoal"][i % 4],
                    "emboss": False,
                })
                design_counter += 1
        vmd_panel["categories"].append(category)
    
    products.append(vmd_panel)
    
    # 2. Wood Panels
    wood_product = {
        "id": "wood",
        "name": "Wood",
        "active": True,
        "sizes": ["1200x2400", "1200x2800"],
        "densities": [],
        "patterns": [],
        "colors": [],
        "thicknesses": ["12mm (PET Panel)", "20mm (PET Panel)", "25mm (PET Wool)"],
        "categories": []
    }
    # Wood Classics category — designs drawn from the shared EXPLICIT_CATEGORY_DESIGNS dict
    wood_classics_category = {
        "id": "wood-wood-classics",
        "name": "Wood Classics",
        "product_type": "wood",
        "emboss_available": True,
        "designs": EXPLICIT_CATEGORY_DESIGNS.get("Wood Classics", []),
    }
    wood_product["categories"].append(wood_classics_category)
    classic_parquet_category = {
        "id": "wood-classic-parquet",
        "name": "Classic Parquet",
        "product_type": "wood",
        "emboss_available": False,
        "designs": EXPLICIT_CATEGORY_DESIGNS.get("Classic Parquet", []),
    }
    wood_product["categories"].append(classic_parquet_category)
    wood_perforations_category = {
        "id": "wood-perforations",
        "name": "Wood Perforations",
        "product_type": "wood",
        "emboss_available": False,
        "designs": EXPLICIT_CATEGORY_DESIGNS.get("Wood Perforations", []),
    }
    wood_product["categories"].append(wood_perforations_category)
    products.append(wood_product)
    
    # 3. Fabrics
    fabrics_product = {
        "id": "fabrics",
        "name": "Fabrics",
        "active": True,
        "sizes": ["1200x2400", "1200x2800"],
        "densities": [],
        "patterns": [],
        "colors": [],
        "thicknesses": ["12mm (PET Panel)", "20mm (PET Panel)", "25mm (PET Wool)"],
        "categories": []
    }
    modern_corporate_category = {
        "id": "fabrics-modern-corporate",
        "name": "Modern Corporate",
        "product_type": "fabrics",
        "emboss_available": False,
        "designs": EXPLICIT_CATEGORY_DESIGNS.get("Modern Corporate", []),
    }
    fabrics_product["categories"].append(modern_corporate_category)
    color_core_category = {
        "id": "fabrics-color-core",
        "name": "Color Core",
        "product_type": "fabrics",
        "emboss_available": True,
        "designs": [],
    }
    fabrics_product["categories"].append(color_core_category)
    designer_textile_category = {
        "id": "fabrics-designer-textile",
        "name": "Designer Textile",
        "product_type": "fabrics",
        "emboss_available": True,
        "designs": [],
    }
    fabrics_product["categories"].append(designer_textile_category)
    products.append(fabrics_product)
    
    # 4. Ombre Panels — Color Core Ombre
    ombre_panel = {
        "id": "ombre",
        "name": "Ombre",
        "active": True,
        "sizes": ["1200x2800", "1200x2400"],
        "densities": [],
        "patterns": [],
        "colors": [],
        "thicknesses": ["12mm (PET Panel)", "25mm (PET Panel)", "PET Wool"],
        "categories": []
    }

    color_core_ombre_category = {
        "id": "ombre-color-core-ombre",
        "name": "Color Core Ombre",
        "product_type": "ombre",
        "emboss_available": False,
        "designs": [],
    }
    ombre_panel["categories"].append(color_core_ombre_category)

    signature_ombre_category = {
        "id": "signature-ombre",
        "name": "Signature Ombre",
        "product_type": "ombre",
        "emboss_available": False,
        "designs": [],
    }
    ombre_panel["categories"].append(signature_ombre_category)

    products.append(ombre_panel)
    
    # 5. Univic Strip Panels
    vicstrip_colors = [
        "#FFFFFF", "#F5F5F5", "#E0E0E0", "#BDBDBD",
        "#8D6E63", "#795548", "#5D4037", "#3E2723",
        "#212121", "#37474F", "#455A64", "#546E7A",
        "#1565C0", "#1976D2", "#2196F3", "#42A5F5"
    ]
    
    vicstrip_panel = {
        "id": "vicstrip",
        "name": "Univic Strip",
        "active": True,
        "sizes": ["600x600", "600x2400"],
        "densities": [],
        "patterns": ["Single Groove", "Double Groove", "Square", "Double Square"],
        "colors": vicstrip_colors,
        "thicknesses": ["12mm (PET Panel)", "25mm (PET Panel)"],
        "categories": []
    }
    
    vicstrip_color_names = [
        "Pure White", "Cloud", "Silver", "Pewter",
        "Latte", "Walnut", "Espresso", "Chocolate",
        "Charcoal", "Slate", "Storm", "Graphite",
        "Ocean", "Azure", "Sky", "Cerulean"
    ]
    
    # VicStrip has pattern-based designs instead of categories
    for pattern in vicstrip_panel["patterns"]:
        category = {
            "id": f"vicstrip-{pattern.lower().replace(' ', '-')}",
            "name": pattern,
            "product_type": "vicstrip",
            "emboss_available": False,
            "designs": []
        }
        for i, color in enumerate(vicstrip_colors):
            # design_code is 1-based PER pattern so it lines up with the disk
            # filenames at static/images/vicstrip/thumbnails/{pattern}_vcs{####}.png
            # which are numbered 1..16 inside each pattern folder.
            # `id` keeps the global counter so it stays unique across patterns.
            category["designs"].append({
                "id": f"vicstrip-design-{design_counter}",
                "product_type": "vicstrip",
                "category": pattern,
                "design_code": f"VCS-{i + 1:04d}",
                "design_name": f"{pattern} - {vicstrip_color_names[i]}",
                "texture_color": color,
                "texture_url": None,
                "thumbnail_url": None,
                "pattern": pattern,
                "color": color,
                "color_name": vicstrip_color_names[i],
            })
            design_counter += 1
        vicstrip_panel["categories"].append(category)
    
    products.append(vicstrip_panel)
    
    return products


MOCK_PRODUCTS = generate_mock_products()


# API Routes
@api_router.get("/")
async def root():
    return {"message": "UniVicoustic Product Configurator API"}

@api_router.get("/products", response_model=List[dict])
async def get_products():
    """Get all product types with their configurations"""
    return MOCK_PRODUCTS

@api_router.get("/products/{product_id}")
async def get_product(product_id: str):
    """Get a specific product type by ID"""
    for product in MOCK_PRODUCTS:
        if product["id"] == product_id:
            return product
    return {"error": "Product not found"}

@api_router.get("/products/{product_id}/categories")
async def get_product_categories(product_id: str):
    """Get categories for a specific product type"""
    for product in MOCK_PRODUCTS:
        if product["id"] == product_id:
            return product.get("categories", [])
    return []

@api_router.get("/products/{product_id}/categories/{category_id}/designs")
async def get_category_designs(product_id: str, category_id: str):
    """Get designs for a specific category"""
    for product in MOCK_PRODUCTS:
        if product["id"] == product_id:
            for category in product.get("categories", []):
                if category["id"] == category_id:
                    return category.get("designs", [])
    return []

@api_router.get("/products/{product_id}/specs")
async def get_product_specs(product_id: str):
    """Get technical specifications for a product type"""
    return TECH_SPECS.get(product_id, {})

# ── Chat endpoint ────────────────────────────────────────────────────────────

# Pricing for claude-haiku-4-5-20251001 — verify at https://www.anthropic.com/pricing
_PRICE_INPUT_PER_MTOK  = 0.80   # USD per 1M input tokens
_PRICE_OUTPUT_PER_MTOK = 4.00   # USD per 1M output tokens

class ChatMessage(BaseModel):
    role: str
    content: str = Field(max_length=2000)

class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(max_items=20)

# Simple in-memory rate limiter (20 requests / 60 seconds per IP)
_rate_store: dict = defaultdict(list)
_RATE_LIMIT = 20
_RATE_WINDOW = 60

def _check_rate_limit(client_ip: str) -> bool:
    now = time.time()
    _rate_store[client_ip] = [t for t in _rate_store[client_ip] if now - t < _RATE_WINDOW]
    if len(_rate_store[client_ip]) >= _RATE_LIMIT:
        return False
    _rate_store[client_ip].append(now)
    return True

# ── Wall Visualizer endpoint ────────────────────────────────────────────────
# Powers the standalone /visualizer page (frontend src/visualizer/).
# Takes a room photo, asks Claude vision to find the wall quadrilaterals,
# returns structured JSON the frontend uses to drive a homography-based
# panel composite.
#
# Why a new endpoint instead of reusing /chat: the chat endpoint expects
# text-only messages and a small token budget; vision needs base64 image
# input plus a tighter prompt that returns strict JSON.

# Pricing constants for the vision-capable model — verify at
# https://www.anthropic.com/pricing.  Sonnet costs more than Haiku per
# token but is a step-up in spatial reasoning, which matters when the
# task is "where exactly are the wall corners."
_VIS_PRICE_INPUT_PER_MTOK  = 3.00
_VIS_PRICE_OUTPUT_PER_MTOK = 15.00

# Strict prompt — ask Claude to return ONLY JSON.  Each wall is described
# by four corner points (in pixel coordinates of the original photo) plus
# metadata the frontend uses for compositing decisions.
_WALL_VISION_PROMPT = """You are an expert in interior photography and 2D room geometry.  Your only job is to find the precise pixel boundary of each VERTICAL WALL surface in the photo so we can paste a wall-panel texture onto it.

Look at the photo.  For each VERTICAL WALL identify the four corner pixel coordinates of just the bare wall surface (the vertical plane where panels would be installed).  Use the original image's pixel coordinate system (origin at top-left, x → right, y → down).

CRITICAL — what counts as the wall:
  • ONLY the vertical wall plane itself.  The wall ENDS at the floor line, the ceiling line, and at any adjacent wall's corner.
  • DO NOT include the floor, ceiling, baseboards, crown moulding, or skirting.
  • DO NOT include windows, doors, mirrors, artwork, decorations, or any opening cut into the wall.
  • DO NOT include furniture in front of the wall.  If a couch or shelf hides part of the wall, return the wall's full quadrilateral as if the obstruction wasn't there — the user masks furniture later.
  • The four corners must trace the actual visible vertical-plane edges, NOT the photo's outer corners.  If the wall doesn't reach the edge of the photo, neither should your corners.

Return ONE quadrilateral per distinct wall plane.  Two walls that meet at a corner give TWO entries (the back wall and the left/right wall), each with their own quadrilateral that ends at the shared vertical seam between them.

Corners must be in this order: top-left, top-right, bottom-right, bottom-left of THAT wall as it appears in the photo (so for a side wall in perspective, top-left is the corner that's higher and farther from the viewer, etc.).

Return STRICT JSON in this exact shape, no prose, no markdown fence:

{
  "image_size": { "w": <int>, "h": <int> },
  "walls": [
    {
      "id": "wall-1",
      "type": "back" | "left" | "right" | "other",
      "corners": [
        { "x": <int>, "y": <int> },
        { "x": <int>, "y": <int> },
        { "x": <int>, "y": <int> },
        { "x": <int>, "y": <int> }
      ],
      "lighting_direction": "from-left" | "from-right" | "from-top" | "from-front" | "ambient",
      "confidence": 0.0..1.0,
      "notes": "<short human-readable note about this specific wall>"
    }
  ]
}

DO NOT include ceiling as a wall type — we don't apply panels to ceilings.  If no clear walls are visible, return an empty walls array.  Do not invent walls that aren't there.  Maximum 3 walls (back + 2 sides).
"""


class VisualizeWallsRequest(BaseModel):
    """Body for /api/visualize-walls.  Image is base64 PNG/JPEG bytes —
    `data:image/...;base64,` prefix accepted but stripped server-side."""
    image_base64: str
    image_mime: str = "image/jpeg"  # caller hint; stripped if image_base64 has data: prefix


@api_router.post("/visualize-walls")
async def visualize_walls(payload: VisualizeWallsRequest, req: Request):
    client_ip = req.client.host if req.client else "unknown"
    if not _check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests — please wait a moment.")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Wall visualizer is not configured (missing ANTHROPIC_API_KEY).")

    # Strip data: URL prefix if the caller sent one, then validate the base64
    # is non-empty and not absurdly large (10 MB cap, matches the frontend
    # PhotoUpload component's check).
    raw_b64 = payload.image_base64
    detected_mime = payload.image_mime or "image/jpeg"
    if raw_b64.startswith("data:"):
        # data:image/png;base64,iVBOR...
        try:
            header, raw_b64 = raw_b64.split(",", 1)
            detected_mime = header.split(";", 1)[0].replace("data:", "") or detected_mime
        except ValueError:
            raise HTTPException(status_code=400, detail="Malformed data URL.")
    if not raw_b64:
        raise HTTPException(status_code=400, detail="image_base64 is empty.")
    # 4/3 base64 ratio → 10 MB image ≈ 13.3 MB base64 string
    if len(raw_b64) > 14 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large — keep it under 10 MB.")

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)

        _t0 = time.time()
        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",  # vision-capable model with strong spatial reasoning
            max_tokens=1500,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": detected_mime,
                                "data": raw_b64,
                            },
                        },
                        {"type": "text", "text": _WALL_VISION_PROMPT},
                    ],
                }
            ],
        )
        duration_ms = int((time.time() - _t0) * 1000)

        usage = response.usage
        cost_usd = (
            usage.input_tokens * _VIS_PRICE_INPUT_PER_MTOK
            + usage.output_tokens * _VIS_PRICE_OUTPUT_PER_MTOK
        ) / 1_000_000

        # Claude was instructed to return strict JSON.  Pull out the JSON
        # from the first text content block, then defend against any
        # accidental markdown fence or leading prose.
        raw_text = response.content[0].text.strip()
        if raw_text.startswith("```"):
            # Strip markdown fence:  ```json ... ```  →  ...
            raw_text = raw_text.strip("`")
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]
            raw_text = raw_text.strip()
        try:
            parsed = json.loads(raw_text)
        except json.JSONDecodeError as je:
            logger.error(f"visualize-walls: Claude returned non-JSON. First 500 chars: {raw_text[:500]!r}")
            raise HTTPException(status_code=502, detail="Vision model returned malformed JSON; try again.") from je

        # Log usage to the same daily file used by /chat for consistency.
        log_entry = {
            "ts":            datetime.now(timezone.utc).isoformat(),
            "endpoint":      "visualize-walls",
            "model":         "claude-sonnet-4-5-20250929",
            "input_tokens":  usage.input_tokens,
            "output_tokens": usage.output_tokens,
            "cost_usd":      round(cost_usd, 6),
            "duration_ms":   duration_ms,
            "walls_found":   len(parsed.get("walls", [])),
            "ip_hash":       hashlib.sha256(client_ip.encode()).hexdigest()[:12],
        }
        log_file = CHAT_LOGS_DIR / datetime.now(timezone.utc).strftime("%Y-%m-%d.jsonl")
        with open(log_file, "a", encoding="utf-8") as _lf:
            _lf.write(json.dumps(log_entry) + "\n")

        logger.info(
            f"VisWalls | in={usage.input_tokens} out={usage.output_tokens} "
            f"cost=${cost_usd:.6f} walls={len(parsed.get('walls', []))} duration={duration_ms}ms"
        )
        return parsed
    except HTTPException:
        raise
    except Exception as e:
        err_str = str(e)
        logger.error(f"visualize-walls error: {e}")
        if "429" in err_str or "rate_limit" in err_str.lower() or "overloaded" in err_str.lower():
            raise HTTPException(status_code=429, detail="Vision service is busy — please try again in a moment.")
        raise HTTPException(status_code=500, detail="Vision service error — please try again.")


@api_router.post("/chat")
async def chat(request: ChatRequest, req: Request):
    client_ip = req.client.host if req.client else "unknown"
    if not _check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests — please wait a moment.")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Chat assistant is not configured.")

    if not request.messages:
        raise HTTPException(status_code=400, detail="No messages provided.")

    # Only allow role values of 'user' or 'assistant' to prevent prompt injection via role field
    for msg in request.messages:
        if msg.role not in ("user", "assistant"):
            raise HTTPException(status_code=400, detail="Invalid message role.")

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)

        messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]
        _t0 = time.time()
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=messages,
        )
        duration_ms = int((time.time() - _t0) * 1000)

        usage = response.usage
        input_tok  = usage.input_tokens
        output_tok = usage.output_tokens
        cost_usd   = (input_tok * _PRICE_INPUT_PER_MTOK + output_tok * _PRICE_OUTPUT_PER_MTOK) / 1_000_000

        log_entry = {
            "ts":            datetime.now(timezone.utc).isoformat(),
            "model":         "claude-haiku-4-5-20251001",
            "input_tokens":  input_tok,
            "output_tokens": output_tok,
            "cost_usd":      round(cost_usd, 6),
            "duration_ms":   duration_ms,
            "ip_hash":       hashlib.sha256(client_ip.encode()).hexdigest()[:12],
        }
        log_file = CHAT_LOGS_DIR / datetime.now(timezone.utc).strftime("%Y-%m-%d.jsonl")
        with open(log_file, "a", encoding="utf-8") as _lf:
            _lf.write(json.dumps(log_entry) + "\n")

        logger.info(
            f"Chat | in={input_tok} out={output_tok} "
            f"cost=${cost_usd:.6f} duration={duration_ms}ms"
        )
        return {"reply": response.content[0].text}
    except Exception as e:
        err_str = str(e)
        logger.error(f"Anthropic chat error: {e}")
        if "429" in err_str or "rate_limit" in err_str.lower() or "overloaded" in err_str.lower():
            raise HTTPException(status_code=429, detail="The assistant is busy — please try again in a moment.")
        raise HTTPException(status_code=500, detail="Chat service error — please try again.")


# Include the router in the main app
app.include_router(api_router)

# ── Auth router (frontend-only OTP register + email-only login). See auth.py
# for the full description of the flow and security caveats. The router
# carries its own /api/auth prefix so it doesn't double up on api_router's. ──
from auth import router as auth_router  # noqa: E402  (defined after app for clarity)
app.include_router(auth_router)

cors_origins = [
    origin.strip()
    for origin in os.environ.get(
        'CORS_ORIGINS',
        'http://localhost:3000,http://localhost:8000'
    ).split(',')
    if origin.strip()
]
cors_origin_regex = os.environ.get('CORS_ORIGIN_REGEX')

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_origin_regex=cors_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Main entry point
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=True)
