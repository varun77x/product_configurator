from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional

try:
    from PIL import Image, ImageOps
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    logging.warning("Pillow not installed — /thumb/ endpoint will serve originals. Run: pip install Pillow")


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Create the main app without a prefix
app = FastAPI()

# Serve static assets (images) from backend/static/
app.mount("/static", StaticFiles(directory=ROOT_DIR / "static"), name="static")

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
            # Convert to RGB so JPEG save never fails on RGBA/palette images
            img = img.convert("RGB")
            # Center-crop + resize to exact square — mirrors CSS background-size:cover
            thumb = ImageOps.fit(img, THUMB_SIZE, Image.LANCZOS)
            thumb.save(cached, format="JPEG", quality=82, optimize=True)

    return FileResponse(cached, media_type="image/jpeg")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

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
        "Line & Texture", "Rhythm & Repeat", "Woven Brushwork", "Patterned Weaves",
        "Indian Modern", "Luxury Textures", "Modern Corporate", "Quiet Bloom",
        "Nature Reimagined", "Color Block", "Fun & Fantasy"
    ]
    vmd_categories_emboss = ["Marble", "Wood Classics", "Soft Texture", "Leather"]
    
    vmd_panel = {
        "id": "flat-embossed-vmd",
        "name": "Flat / Embossed VMT Panels",
        "active": True,
        "sizes": ["600x600", "1200x600", "1200x1200", "1200x2800"],
        "densities": ["HD (High Density)", "LD (Low Density)"],
        "patterns": [],
        "colors": [],
        "thicknesses": [],
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
                "design_code": "VMD-LT-001",
                "design_name": "Line & Texture Design 1",
                "texture_color": "#D4A574",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-001.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-001.jpg",
                "color_name": "Warm Sand",
            },
            {
                "id": "vmd-design-lt-002",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-002",
                "design_name": "Line & Texture Design 2",
                "texture_color": "#8B7355",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-002.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-002.jpg",
                "color_name": "Espresso",
            },
            {
                "id": "vmd-design-lt-003",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-003",
                "design_name": "Line & Texture Design 3",
                "texture_color": "#A0522D",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-003.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-003.jpg",
                "color_name": "Sienna",
            },
            {
                "id": "vmd-design-lt-004",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-004",
                "design_name": "Line & Texture Design 4",
                "texture_color": "#CD853F",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-004.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-004.jpg",
                "color_name": "Desert Sand",
            },
            {
                "id": "vmd-design-lt-005",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-005",
                "design_name": "Line & Texture Design 5",
                "texture_color": "#6B8E6B",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-005.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-005.jpg",
                "color_name": "Sage Green",
            },
            {
                "id": "vmd-design-lt-006",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-006",
                "design_name": "Line & Texture Design 6",
                "texture_color": "#4A7260",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-006.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-006.jpg",
                "color_name": "Forest Green",
            },
            {
                "id": "vmd-design-lt-007",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-007",
                "design_name": "Line & Texture Design 7",
                "texture_color": "#7A9E7E",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-007.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-007.jpg",
                "color_name": "Fern Green",
            },
            {
                "id": "vmd-design-lt-008",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-008",
                "design_name": "Line & Texture Design 8",
                "texture_color": "#9E9E9E",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-008.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-008.jpg",
                "color_name": "Stone Grey",
            },
            {
                "id": "vmd-design-lt-009",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-009",
                "design_name": "Line & Texture Design 9",
                "texture_color": "#757575",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-009.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-009.jpg",
                "color_name": "Slate Grey",
            },
            {
                "id": "vmd-design-lt-010",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-010",
                "design_name": "Line & Texture Design 10",
                "texture_color": "#BDBDBD",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-010.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-010.jpg",
                "color_name": "Silver Grey",
            },
            {
                "id": "vmd-design-lt-011",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-011",
                "design_name": "Line & Texture Design 11",
                "texture_color": "#C2956C",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-011.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-011.jpg",
                "color_name": "Natural Clay",
            },
            {
                "id": "vmd-design-lt-012",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-012",
                "design_name": "Line & Texture Design 12",
                "texture_color": "#B5895A",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-012.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-012.jpg",
                "color_name": "Rustic Clay",
            },
            {
                "id": "vmd-design-lt-013",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-013",
                "design_name": "Line & Texture Design 13",
                "texture_color": "#C8A882",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-013.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-013.jpg",
                "color_name": "Fossil Beige",
            },
            {
                "id": "vmd-design-lt-014",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-014",
                "design_name": "Line & Texture Design 14",
                "texture_color": "#B09070",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-014.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-014.jpg",
                "color_name": "Fossil Tan",
            },
            {
                "id": "vmd-design-lt-015",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-015",
                "design_name": "Line & Texture Design 15",
                "texture_color": "#D4B896",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-015.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-015.jpg",
                "color_name": "Fossil Sand",
            },
            {
                "id": "vmd-design-lt-016",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-016",
                "design_name": "Line & Texture Design 16",
                "texture_color": "#A89070",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-016.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-016.jpg",
                "color_name": "Stone Natural",
            },
            {
                "id": "vmd-design-lt-017",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-017",
                "design_name": "Line & Texture Design 17",
                "texture_color": "#B8A080",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-017.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-017.jpg",
                "color_name": "Parchment",
            },
            {
                "id": "vmd-design-lt-018",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-018",
                "design_name": "Line & Texture Design 18",
                "texture_color": "#C0A882",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-018.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-018.jpg",
                "color_name": "Hemp",
            },
            {
                "id": "vmd-design-lt-019",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-019",
                "design_name": "Line & Texture Design 19",
                "texture_color": "#9A8060",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-019.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-019.jpg",
                "color_name": "Linen",
            },
            {
                "id": "vmd-design-lt-020",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-020",
                "design_name": "Line & Texture Design 20",
                "texture_color": "#C8B090",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-020.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-020.jpg",
                "color_name": "Oatmeal",
            },
            {
                "id": "vmd-design-lt-021",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-021",
                "design_name": "Line & Texture Design 21",
                "texture_color": "#D0B898",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-021.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-021.jpg",
                "color_name": "Sand Stone",
            },
            {
                "id": "vmd-design-lt-022",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-022",
                "design_name": "Line & Texture Design 22",
                "texture_color": "#BFA882",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-022.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-022.jpg",
                "color_name": "Driftwood",
            },
            {
                "id": "vmd-design-lt-023",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-023",
                "design_name": "Line & Texture Design 23",
                "texture_color": "#D4C8A8",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-023.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-023.jpg",
                "color_name": "Bleached Wood",
            },
            {
                "id": "vmd-design-lt-024",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-024",
                "design_name": "Line & Texture Design 24",
                "texture_color": "#C0A882",
                # panel_variant = "continuous": each column uses a different slice
                # so the three panels together form one seamless pattern.
                "panel_variant": "continuous",
                # thumbnail shown in the sidebar — use the left slice as the preview
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-024-1.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-024-1.jpg",
                # one URL per column, left → centre → right
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-024-1.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-024-2.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-024-3.jpg",
                ],
                "color_name": "Continuous Pattern",
            },
            {
                "id": "vmd-design-lt-025",
                "product_type": "flat-embossed-vmd",
                "category": "Line & Texture",
                "design_code": "VMD-LT-025",
                "design_name": "Line & Texture Design 25",
                "texture_color": "#C0A882",
                # panel_variant = "continuous": each column uses a different slice
                # so the three panels together form one seamless pattern.
                "panel_variant": "continuous",
                # thumbnail shown in the sidebar — use the left slice as the preview
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-025-1.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-025-1.jpg",
                # one URL per column, left → centre → right
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-025-1.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-025-2.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-line-and-texture/VMD-LT-025-3.jpg"
                ],
                "color_name": "Continuous Pattern",
            },
            # ── Add more Line & Texture designs here ──────────────────────
        ],
        "Rhythm & Repeat": [
            {
                "id": "vmd-design-rr-001",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-001",
                "design_name": "Rhythm & Repeat Design 1",
                "texture_color": "#DEB887",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-001.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-001.jpg",
                "color_name": "Burlywood",
            },
            {
                "id": "vmd-design-rr-002",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-002",
                "design_name": "Rhythm & Repeat Design 2",
                "texture_color": "#BC8F8F",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-002.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-002.jpg",
                "color_name": "Rosy Brown",
            },
            {
                "id": "vmd-design-rr-003",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-003",
                "design_name": "Rhythm & Repeat Design 3",
                "texture_color": "#F5DEB3",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-003.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-003.jpg",
                "color_name": "Wheat",
            },
            {
                "id": "vmd-design-rr-004",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-004",
                "design_name": "Rhythm & Repeat Design 4",
                "texture_color": "#D2B48C",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-004.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-004.jpg",
                "color_name": "Sandy",
            },
            {
                "id": "vmd-design-rr-005",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-005",
                "design_name": "Rhythm & Repeat Design 5",
                "texture_color": "#6B8E6B",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-005.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-005.jpg",
                "color_name": "Sage Green",
            },
            {
                "id": "vmd-design-rr-006",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-006",
                "design_name": "Rhythm & Repeat Design 6",
                "texture_color": "#4A7260",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-006.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-006.jpg",
                "color_name": "Forest Green",
            },
            {
                "id": "vmd-design-rr-007",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-007",
                "design_name": "Rhythm & Repeat Design 7",
                "texture_color": "#7A9E7E",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-007.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-007.jpg",
                "color_name": "Fern Green",
            },
            {
                "id": "vmd-design-rr-008",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-008",
                "design_name": "Rhythm & Repeat Design 8",
                "texture_color": "#9E9E9E",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-008.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-008.jpg",
                "color_name": "Stone Grey",
            },
            {
                "id": "vmd-design-rr-009",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-009",
                "design_name": "Rhythm & Repeat Design 9",
                "texture_color": "#757575",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-009.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-009.jpg",
                "color_name": "Slate Grey",
            },
            {
                "id": "vmd-design-rr-010",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-010",
                "design_name": "Rhythm & Repeat Design 10",
                "texture_color": "#BDBDBD",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-010.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-010.jpg",
                "color_name": "Silver Grey",
            },
            {
                "id": "vmd-design-rr-011",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-011",
                "design_name": "Rhythm & Repeat Design 11",
                "texture_color": "#C2956C",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-011.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-011.jpg",
                "color_name": "Natural Clay",
            },
            {
                "id": "vmd-design-rr-012",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-012",
                "design_name": "Rhythm & Repeat Design 12",
                "texture_color": "#D4A876",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-012.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-012.jpg",
                "color_name": "Warm Clay",
            },
            {
                "id": "vmd-design-rr-013",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-013",
                "design_name": "Rhythm & Repeat Design 13",
                "texture_color": "#B5895A",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-013.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-013.jpg",
                "color_name": "Rustic Clay",
            },
            {
                "id": "vmd-design-rr-014",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-014",
                "design_name": "Rhythm & Repeat Design 14",
                "texture_color": "#A0856B",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-014.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-014.jpg",
                "color_name": "Earth Brown",
            },
            {
                "id": "vmd-design-rr-015",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-015",
                "design_name": "Rhythm & Repeat Design 15",
                "texture_color": "#E07B39",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-015.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-015.jpg",
                "color_name": "Burnt Orange",
            },
            {
                "id": "vmd-design-rr-016",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-016",
                "design_name": "Rhythm & Repeat Design 16",
                "texture_color": "#D4651A",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-016.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-016.jpg",
                "color_name": "Deep Orange",
            },
            {
                "id": "vmd-design-rr-017",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-017",
                "design_name": "Rhythm & Repeat Design 17",
                "texture_color": "#F4A55A",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-017.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-017.jpg",
                "color_name": "Amber Orange",
            },
            {
                "id": "vmd-design-rr-018",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-018",
                "design_name": "Rhythm & Repeat Design 18",
                "texture_color": "#8B7BA8",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-018.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-018.jpg",
                "color_name": "Dusty Lavender",
            },
            {
                "id": "vmd-design-rr-019",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-019",
                "design_name": "Rhythm & Repeat Design 19",
                "texture_color": "#5A7A5A",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-019.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-019.jpg",
                "color_name": "Olive Green",
            },
            {
                "id": "vmd-design-rr-020",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-020",
                "design_name": "Rhythm & Repeat Design 20",
                "texture_color": "#BFA882",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-020.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-020.jpg",
                "color_name": "Driftwood",
            },
            {
                "id": "vmd-design-rr-021",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-021",
                "design_name": "Rhythm & Repeat Design 21",
                "texture_color": "#CC7722",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-021.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-021.jpg",
                "color_name": "Golden Oak",
            },
            {
                "id": "vmd-design-rr-022",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-022",
                "design_name": "Rhythm & Repeat Design 22",
                "texture_color": "#D4A0A0",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-022.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-022.jpg",
                "color_name": "Blush",
            },
            {
                "id": "vmd-design-rr-023",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-023",
                "design_name": "Rhythm & Repeat Design 23",
                "texture_color": "#8B3A3A",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-023.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-023.jpg",
                "color_name": "Crimson",
            },
            {
                "id": "vmd-design-rr-024",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-024",
                "design_name": "Rhythm & Repeat Design 24",
                "texture_color": "#A0522D",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-024.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-024.jpg",
                "color_name": "Rust Red",
            },
            {
                "id": "vmd-design-rr-025",
                "product_type": "flat-embossed-vmd",
                "category": "Rhythm & Repeat",
                "design_code": "VMD-RR-025",
                "design_name": "Rhythm & Repeat Design 25",
                "texture_color": "#D4C26A",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-025.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-025.jpg",
                "color_name": "Harvest Gold",
            },
            # ── Add more Rhythm & Repeat designs here ─────────────────────
        ],
        "Quiet Bloom": [
            {
                "id": "vmd-design-qb-001",
                "product_type": "flat-embossed-vmd",
                "category": "Quiet Bloom",
                "design_code": "VMD-QB-001",
                "design_name": "Quiet Bloom Design 1",
                "texture_color": "#C8D8B8",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-quiet-bloom/VMD-QB-001.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-quiet-bloom/VMD-QB-001.jpg",
                "color_name": "Soft Sage",
            },
            {
                "id": "vmd-design-qb-002",
                "product_type": "flat-embossed-vmd",
                "category": "Quiet Bloom",
                "design_code": "VMD-QB-002",
                "design_name": "Quiet Bloom Design 2",
                "texture_color": "#D4C8B0",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-quiet-bloom/VMD-QB-002.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-quiet-bloom/VMD-QB-002.jpg",
                "color_name": "Petal Ivory",
            },
            {
                "id": "vmd-design-qb-003",
                "product_type": "flat-embossed-vmd",
                "category": "Quiet Bloom",
                "design_code": "VMD-QB-003",
                "design_name": "Quiet Bloom Design 3",
                "texture_color": "#C0B8A8",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-quiet-bloom/VMD-QB-003.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-quiet-bloom/VMD-QB-003.jpg",
                "color_name": "Mist Grey",
            },
            {
                "id": "vmd-design-qb-004",
                "product_type": "flat-embossed-vmd",
                "category": "Quiet Bloom",
                "design_code": "VMD-QB-004",
                "design_name": "Quiet Bloom Design 4",
                "texture_color": "#D8C0B0",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-quiet-bloom/VMD-QB-004.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-quiet-bloom/VMD-QB-004.jpg",
                "color_name": "Blush Cream",
            },
            {
                "id": "vmd-design-qb-005",
                "product_type": "flat-embossed-vmd",
                "category": "Quiet Bloom",
                "design_code": "VMD-QB-005",
                "design_name": "Quiet Bloom Design 5",
                "texture_color": "#B8C8C0",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-quiet-bloom/VMD-QB-005.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-quiet-bloom/VMD-QB-005.jpg",
                "color_name": "Sea Mist",
            },
            {
                "id": "vmd-design-qb-006",
                "product_type": "flat-embossed-vmd",
                "category": "Quiet Bloom",
                "design_code": "VMD-QB-006",
                "design_name": "Quiet Bloom Design 6",
                "texture_color": "#C8B8C8",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-quiet-bloom/VMD-QB-006.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-quiet-bloom/VMD-QB-006.jpg",
                "color_name": "Lilac Mist",
            },
            {
                "id": "vmd-design-qb-007",
                "product_type": "flat-embossed-vmd",
                "category": "Quiet Bloom",
                "design_code": "VMD-QB-007",
                "design_name": "Quiet Bloom Design 7",
                "texture_color": "#D0C8B8",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-quiet-bloom/VMD-QB-007.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-quiet-bloom/VMD-QB-007.jpg",
                "color_name": "Warm Parchment",
            },
            {
                "id": "vmd-design-qb-008",
                "product_type": "flat-embossed-vmd",
                "category": "Quiet Bloom",
                "design_code": "VMD-QB-008",
                "design_name": "Quiet Bloom Design 8",
                "texture_color": "#B8C0C8",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-quiet-bloom/VMD-QB-008.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-quiet-bloom/VMD-QB-008.jpg",
                "color_name": "Frost Blue",
            },
            {
                "id": "vmd-design-qb-009",
                "product_type": "flat-embossed-vmd",
                "category": "Quiet Bloom",
                "design_code": "VMD-QB-009",
                "design_name": "Quiet Bloom Design 9",
                "texture_color": "#C0D0C0",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-quiet-bloom/VMD-QB-009.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-quiet-bloom/VMD-QB-009.jpg",
                "color_name": "Meadow Mist",
            },
            # ── Add more Quiet Bloom designs here ─────────────────────────
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
            "designs": []
        }
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
    
    # 2. Colored HD VMD Panels (INACTIVE)
    colored_vmd = {
        "id": "colored-hd-vmd",
        "name": "Colored HD VMT Panels",
        "active": False,
        "sizes": [],
        "densities": [],
        "patterns": [],
        "colors": [],
        "thicknesses": [],
        "categories": []
    }
    products.append(colored_vmd)
    
    # 3. Colored HD Ombre Panels
    ombre_categories = ["Coral Haze", "Apricot Gleam", "Blue Fox", "Pearl Oat", "Birch Mushroom", "Glacier"]
    
    ombre_panel = {
        "id": "colored-hd-ombre",
        "name": "Colored HD Ombre Panels",
        "active": True,
        "sizes": ["600x600", "1200x600", "1200x1200"],
        "densities": [],
        "patterns": [],
        "colors": [],
        "thicknesses": [],
        "categories": []
    }
    
    # Ombre gradient colors
    ombre_colors = {
        "Coral Haze": ["#FF6B6B", "#FF8E8E", "#FFB4B4"],
        "Apricot Gleam": ["#FFB347", "#FFCC80", "#FFE4B5"],
        "Blue Fox": ["#4A90D9", "#7CB3E8", "#A8D4F5"],
        "Pearl Oat": ["#F5F5DC", "#FFFFF0", "#FAF0E6"],
        "Birch Mushroom": ["#8B7355", "#A0937D", "#C4B7A6"],
        "Glacier": ["#E0FFFF", "#B0E0E6", "#87CEEB"],
    }
    
    for cat in ombre_categories:
        category = {
            "id": f"ombre-{cat.lower().replace(' ', '-')}",
            "name": cat,
            "product_type": "colored-hd-ombre",
            "emboss_available": False,
            "designs": []
        }
        colors = ombre_colors.get(cat, ["#CCCCCC", "#DDDDDD", "#EEEEEE"])
        for i in range(3):
            category["designs"].append({
                "id": f"ombre-design-{design_counter}",
                "product_type": "colored-hd-ombre",
                "category": cat,
                "design_code": f"OMB-{design_counter:04d}",
                "design_name": f"{cat} Gradient {i+1}",
                "texture_color": colors[i],
                "texture_url": None,
                "thumbnail_url": None,
                "color_name": f"{cat} Shade {i+1}",
            })
            design_counter += 1
        ombre_panel["categories"].append(category)
    
    products.append(ombre_panel)
    
    # 4. VicStrip Panels
    vicstrip_colors = [
        "#FFFFFF", "#F5F5F5", "#E0E0E0", "#BDBDBD",
        "#8D6E63", "#795548", "#5D4037", "#3E2723",
        "#212121", "#37474F", "#455A64", "#546E7A",
        "#1565C0", "#1976D2", "#2196F3", "#42A5F5"
    ]
    
    vicstrip_panel = {
        "id": "vicstrip",
        "name": "VicStrip Panels",
        "active": True,
        "sizes": ["600x600", "600x2400"],
        "densities": [],
        "patterns": ["Single Groove", "Double Groove", "Square", "Double Square"],
        "colors": vicstrip_colors,
        "thicknesses": ["12 mm", "25 mm"],
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
        for i, color in enumerate(vicstrip_colors[:4]):
            category["designs"].append({
                "id": f"vicstrip-design-{design_counter}",
                "product_type": "vicstrip",
                "category": pattern,
                "design_code": f"VCS-{design_counter:04d}",
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

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
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
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
