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
        "Nature Reimagined", "Color Block", "Fun & Fantasy", "Marble", "Leather"
    ]
    vmd_categories_emboss = ["Wood Classics", "Soft Texture"]
    
    vmd_panel = {
        "id": "flat-embossed-vmd",
        "name": "Bespoke Graphics",
        "active": True,
        "sizes": ["1200x2400", "1200x2800"],
        "densities": [],
        "patterns": [],
        "colors": [],
        "thicknesses": ["12mm (PET Panel)", "20mm (PET Panel)", "25mm (PET Wool)"],
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
                "emboss": True,  # TEMP: embossable for testing
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
                "emboss": True,  # TEMP: embossable for testing
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
                "emboss": True,  # TEMP: embossable for testing
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
        "Indian Modern": [
            {
                "id": "vmd-design-im-001",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "VMD-IM-001",
                "design_name": "Indian Modern Design 1",
                "texture_color": "#C8A882",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/VMD-IM-001.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/VMD-IM-001.jpg",
                "color_name": "Heritage Ivory",
            },
            {
                "id": "vmd-design-im-002",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "VMD-IM-002",
                "design_name": "Indian Modern Design 2",
                "texture_color": "#B09070",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/VMD-IM-002.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/VMD-IM-002.jpg",
                "color_name": "Saffron Stone",
            },
            {
                "id": "vmd-design-im-003",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "VMD-IM-003",
                "design_name": "Indian Modern Design 3",
                "texture_color": "#A08060",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/VMD-IM-003.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/VMD-IM-003.jpg",
                "color_name": "Terracotta Dusk",
            },
            {
                # Pair — stacked ABA: Panel1 (A) · Panel2 (B) · Panel1 (A)
                "id": "vmd-design-im-004",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "VMD-IM-004",
                "design_name": "Indian Modern Design 4",
                "texture_color": "#C0A882",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/VMD-IM-004-A.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/VMD-IM-004-A.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/VMD-IM-004-A.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/VMD-IM-004-B.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/VMD-IM-004-A.jpg",
                ],
                "color_name": "Jali Pair",
            },
            {
                "id": "vmd-design-im-005",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "VMD-IM-005",
                "design_name": "Indian Modern Design 5",
                "texture_color": "#9E8060",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/VMD-IM-005.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/VMD-IM-005.jpg",
                "color_name": "Mughal Clay",
            },
            {
                "id": "vmd-design-im-006",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "VMD-IM-006",
                "design_name": "Indian Modern Design 6",
                "texture_color": "#B87050",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/VMD-IM-006.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/VMD-IM-006.jpg",
                "color_name": "Rajput Red",
            },
            {
                "id": "vmd-design-im-007",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "VMD-IM-007",
                "design_name": "Indian Modern Design 7",
                "texture_color": "#789060",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/VMD-IM-007.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/VMD-IM-007.jpg",
                "color_name": "Patina Sage",
            },
            {
                "id": "vmd-design-im-008",
                "product_type": "flat-embossed-vmd",
                "category": "Indian Modern",
                "design_code": "VMD-IM-008",
                "design_name": "Indian Modern Design 8",
                "texture_color": "#D4B890",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-indian-modern/VMD-IM-008.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-indian-modern/VMD-IM-008.jpg",
                "color_name": "Sandstone Beige",
            },
            # ── Add more Indian Modern designs here ───────────────────────
        ],
        "Color Block": [
            {
                # Pair — stacked ABA: Panel A · Panel B · Panel A
                "id": "vmd-design-cb-001",
                "product_type": "flat-embossed-vmd",
                "category": "Color Block",
                "design_code": "VMD-CB-001",
                "design_name": "Color Block Design 1",
                "texture_color": "#A08070",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-001-A.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-001-A.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-001-A.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-001-B.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-001-A.jpg",
                ],
                "color_name": "Block Pair",
            },
            {
                "id": "vmd-design-cb-002",
                "product_type": "flat-embossed-vmd",
                "category": "Color Block",
                "design_code": "VMD-CB-002",
                "design_name": "Color Block Design 2",
                "texture_color": "#B09080",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-002-A.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-002-A.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-002-A.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-002-B.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-002-C.jpg",
                ],
                "color_name": "Continuous Pattern",
            },
            {
                "id": "vmd-design-cb-003",
                "product_type": "flat-embossed-vmd",
                "category": "Color Block",
                "design_code": "VMD-CB-003",
                "design_name": "Color Block Design 3",
                "texture_color": "#C0A890",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-003-A.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-003-A.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-003-A.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-003-B.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-003-C.jpg",
                ],
                "color_name": "Continuous Pattern",
            },
            {
                # Pair — stacked ABA: Panel A · Panel B · Panel A
                "id": "vmd-design-cb-004",
                "product_type": "flat-embossed-vmd",
                "category": "Color Block",
                "design_code": "VMD-CB-004",
                "design_name": "Color Block Design 4",
                "texture_color": "#987860",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-004-A.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-004-A.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-004-A.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-004-B.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-004-A.jpg",
                ],
                "color_name": "Block Pair",
            },
            {
                "id": "vmd-design-cb-005",
                "product_type": "flat-embossed-vmd",
                "category": "Color Block",
                "design_code": "VMD-CB-005",
                "design_name": "Color Block Design 5",
                "texture_color": "#D4B090",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-005-A.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-005-A.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-005-A.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-005-B.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-005-C.jpg",
                ],
                "color_name": "Continuous Pattern",
            },
            {
                "id": "vmd-design-cb-006",
                "product_type": "flat-embossed-vmd",
                "category": "Color Block",
                "design_code": "VMD-CB-006",
                "design_name": "Color Block Design 6",
                "texture_color": "#8090A0",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-006.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-006.jpg",
                "color_name": "Solid Block",
            },
            {
                "id": "vmd-design-cb-007",
                "product_type": "flat-embossed-vmd",
                "category": "Color Block",
                "design_code": "VMD-CB-007",
                "design_name": "Color Block Design 7",
                "texture_color": "#B8C0A8",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-007-A.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-007-A.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-007-A.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-007-B.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-007-C.jpg",
                ],
                "color_name": "Continuous Pattern",
            },
            {
                "id": "vmd-design-cb-008",
                "product_type": "flat-embossed-vmd",
                "category": "Color Block",
                "design_code": "VMD-CB-008",
                "design_name": "Color Block Design 8",
                "texture_color": "#C8B0A0",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-008-A.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-008-A.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-008-A.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-008-B.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-008-C.jpg",
                ],
                "color_name": "Continuous Pattern",
            },
            {
                "id": "vmd-design-cb-009",
                "product_type": "flat-embossed-vmd",
                "category": "Color Block",
                "design_code": "VMD-CB-009",
                "design_name": "Color Block Design 9",
                "texture_color": "#E0A870",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-009-A.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-009-A.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-009-A.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-009-B.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-color-block/VMD-CB-009-C.jpg",
                ],
                "color_name": "Continuous Pattern",
            },
            # ── Add more Color Block designs here ─────────────────────────
        ],
        "Fun & Fantasy": [
            {
                "id": "vmd-design-ff-001",
                "product_type": "flat-embossed-vmd",
                "category": "Fun & Fantasy",
                "design_code": "VMD-FF-001",
                "design_name": "Fun & Fantasy Design 1",
                "texture_color": "#C0A882",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/VMD-FF-001-A.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-fun-and-fantasy/VMD-FF-001-A.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/VMD-FF-001-A.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/VMD-FF-001-B.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/VMD-FF-001-C.jpg",
                ],
                "color_name": "Continuous Pattern",
            },
            {
                "id": "vmd-design-ff-002",
                "product_type": "flat-embossed-vmd",
                "category": "Fun & Fantasy",
                "design_code": "VMD-FF-002",
                "design_name": "Fun & Fantasy Design 2",
                "texture_color": "#B09070",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/VMD-FF-002-A.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-fun-and-fantasy/VMD-FF-002-A.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/VMD-FF-002-A.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/VMD-FF-002-B.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/VMD-FF-002-C.jpg",
                ],
                "color_name": "Continuous Pattern",
            },
            {
                "id": "vmd-design-ff-003",
                "product_type": "flat-embossed-vmd",
                "category": "Fun & Fantasy",
                "design_code": "VMD-FF-003",
                "design_name": "Fun & Fantasy Design 3",
                "texture_color": "#A88060",
                "panel_variant": "continuous",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/VMD-FF-003-A.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-fun-and-fantasy/VMD-FF-003-A.jpg",
                "texture_urls": [
                    "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/VMD-FF-003-A.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/VMD-FF-003-B.jpg",
                    "/static/images/flat-embossed-vmt/panels/vmd-fun-and-fantasy/VMD-FF-003-C.jpg",
                ],
                "color_name": "Continuous Pattern",
            },
            # ── Add more Fun & Fantasy designs here ───────────────────────
        ],
        "Marble": [
            {
                "id": "vmd-design-mb-001",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-01",
                "design_name": "Marble Design 1",
                "texture_color": "#E8E0D0",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-01-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-01-1200x2800.jpg",
                "color_name": "Marble 01",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-002",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-02",
                "design_name": "Marble Design 2",
                "texture_color": "#D8D0C0",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-02-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-02-1200x2800.jpg",
                "color_name": "Marble 02",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-003",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-03",
                "design_name": "Marble Design 3",
                "texture_color": "#C8C0B0",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-03-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-03-1200x2800.jpg",
                "color_name": "Marble 03",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-004",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-04",
                "design_name": "Marble Design 4",
                "texture_color": "#B8B0A0",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-04-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-04-1200x2800.jpg",
                "color_name": "Marble 04",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-005",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-05",
                "design_name": "Marble Design 5",
                "texture_color": "#A8A090",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-05-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-05-1200x2800.jpg",
                "color_name": "Marble 05",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-006",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-06",
                "design_name": "Marble Design 6",
                "texture_color": "#989080",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-06-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-06-1200x2800.jpg",
                "color_name": "Marble 06",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-007",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-07",
                "design_name": "Marble Design 7",
                "texture_color": "#888070",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-07-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-07-1200x2800.jpg",
                "color_name": "Marble 07",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-008",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-08",
                "design_name": "Marble Design 8",
                "texture_color": "#787060",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-08-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-08-1200x2800.jpg",
                "color_name": "Marble 08",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-009",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-09",
                "design_name": "Marble Design 9",
                "texture_color": "#686050",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-09-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-09-1200x2800.jpg",
                "color_name": "Marble 09",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-010",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-10",
                "design_name": "Marble Design 10",
                "texture_color": "#585040",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-10-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-10-1200x2800.jpg",
                "color_name": "Marble 10",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-011",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-11",
                "design_name": "Marble Design 11",
                "texture_color": "#F0E8D8",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-11-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-11-1200x2800.jpg",
                "color_name": "Marble 11",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-012",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-12",
                "design_name": "Marble Design 12",
                "texture_color": "#E0D8C8",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-12-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-12-1200x2800.jpg",
                "color_name": "Marble 12",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-013",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-13",
                "design_name": "Marble Design 13",
                "texture_color": "#D0C8B8",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-13-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-13-1200x2800.jpg",
                "color_name": "Marble 13",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-014",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-14",
                "design_name": "Marble Design 14",
                "texture_color": "#C0B8A8",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-14-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-14-1200x2800.jpg",
                "color_name": "Marble 14",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-015",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-15",
                "design_name": "Marble Design 15",
                "texture_color": "#B0A898",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-15-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-15-1200x2800.jpg",
                "color_name": "Marble 15",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-016",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-16",
                "design_name": "Marble Design 16",
                "texture_color": "#A09888",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-16-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-16-1200x2800.jpg",
                "color_name": "Marble 16",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-017",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-17",
                "design_name": "Marble Design 17",
                "texture_color": "#908878",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-17-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-17-1200x2800.jpg",
                "color_name": "Marble 17",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-018",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-18",
                "design_name": "Marble Design 18",
                "texture_color": "#808068",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-18-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-18-1200x2800.jpg",
                "color_name": "Marble 18",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-019",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-19",
                "design_name": "Calcatta Cremo",
                "texture_color": "#F5ECD7",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC19-1200x2800(CalcattaCremo).jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC19-1200x2800(CalcattaCremo).jpg",
                "color_name": "Calcatta Cremo",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-020",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-20",
                "design_name": "Calacatta Carrara",
                "texture_color": "#F0E8D8",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-20-1200x2800(CalacattaCarrara).jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-20-1200x2800(CalacattaCarrara).jpg",
                "color_name": "Calacatta Carrara",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-021",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-21",
                "design_name": "Emperador Dark",
                "texture_color": "#4A3728",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-21-1200x2800(EmperadorDark).jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-21-1200x2800(EmperadorDark).jpg",
                "color_name": "Emperador Dark",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-022",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-22",
                "design_name": "Fusion Wow",
                "texture_color": "#8B7D6B",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-22-1200x2800(FusionWow).jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-22-1200x2800(FusionWow).jpg",
                "color_name": "Fusion Wow",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-023",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-23",
                "design_name": "Grey Stone",
                "texture_color": "#8A8A8A",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-23-1200x2800(GreyStone).jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-23-1200x2800(GreyStone).jpg",
                "color_name": "Grey Stone",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-024",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-24",
                "design_name": "Hematite Black",
                "texture_color": "#2C2C2C",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-24-1200x2800(HematiteBlack).jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-24-1200x2800(HematiteBlack).jpg",
                "color_name": "Hematite Black",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-025",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-25",
                "design_name": "Invisible Grey",
                "texture_color": "#A0A0A0",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-25-1200x2800(InvisibleGrey-).jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-25-1200x2800(InvisibleGrey-).jpg",
                "color_name": "Invisible Grey",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-026",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-26",
                "design_name": "Magic Brown",
                "texture_color": "#6B5040",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-26_1200x2800(MagicBrown).jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-26_1200x2800(MagicBrown).jpg",
                "color_name": "Magic Brown",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-027",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-27",
                "design_name": "Marble Design 27",
                "texture_color": "#C0B0A0",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-27-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-27-1200x2800.jpg",
                "color_name": "Marble 27",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-028",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-28",
                "design_name": "Patagonia",
                "texture_color": "#B8A898",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-28_1200x2800(Patagonia).jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-28_1200x2800(Patagonia).jpg",
                "color_name": "Patagonia",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-029",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-29",
                "design_name": "Port Black",
                "texture_color": "#1A1A1A",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-29_1200x2800(PortBlack).jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-29_1200x2800(PortBlack).jpg",
                "color_name": "Port Black",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-030",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-30",
                "design_name": "Travetino Classico",
                "texture_color": "#D4C4A8",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-30_1200x2800(TravetinoClassico).jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-30_1200x2800(TravetinoClassico).jpg",
                "color_name": "Travetino Classico",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-031",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-31",
                "design_name": "Concrete 1",
                "texture_color": "#9A9A9A",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-31_1200x2800(Concrete 1).jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-31_1200x2800(Concrete 1).jpg",
                "color_name": "Concrete 1",
                "emboss": False,
            },
            {
                "id": "vmd-design-mb-032",
                "product_type": "flat-embossed-vmd",
                "category": "Marble",
                "design_code": "ST-NC-32",
                "design_name": "Concrete 3",
                "texture_color": "#7A7A7A",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-marble/ST-NC-32_1200x2800(Concrete 3).jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-marble/ST-NC-32_1200x2800(Concrete 3).jpg",
                "color_name": "Concrete 3",
                "emboss": False,
            },
            # ── Add more Marble designs here ──────────────────────────────
        ],
        "Luxury Textures": [
            {
                "id": "vmd-design-lx-001",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-39",
                "design_name": "Luxury Textures Design 1",
                "texture_color": "#D4C8B8",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-39-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-39-1200x2800.jpg",
                "color_name": "Luxury 39",
            },
            {
                "id": "vmd-design-lx-002",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-40",
                "design_name": "Luxury Textures Design 2",
                "texture_color": "#C8B8A8",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-40-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-40-1200x2800.jpg",
                "color_name": "Luxury 40",
            },
            {
                "id": "vmd-design-lx-003",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-41",
                "design_name": "Luxury Textures Design 3",
                "texture_color": "#B8A898",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-41-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-41-1200x2800.jpg",
                "color_name": "Luxury 41",
            },
            {
                "id": "vmd-design-lx-004",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-42",
                "design_name": "Luxury Textures Design 4",
                "texture_color": "#A89888",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-42-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-42-1200x2800.jpg",
                "color_name": "Luxury 42",
            },
            {
                "id": "vmd-design-lx-005",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-69",
                "design_name": "Luxury Textures Design 5",
                "texture_color": "#988878",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-69-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-69-1200x2800.jpg",
                "color_name": "Luxury 69",
            },
            {
                "id": "vmd-design-lx-006",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-75",
                "design_name": "Luxury Textures Design 6",
                "texture_color": "#887868",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-75-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-75-1200x2800.jpg",
                "color_name": "Luxury 75",
            },
            {
                "id": "vmd-design-lx-007",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-76",
                "design_name": "Luxury Textures Design 7",
                "texture_color": "#786858",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-76-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-76-1200x2800.jpg",
                "color_name": "Luxury 76",
            },
            {
                "id": "vmd-design-lx-008",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-77",
                "design_name": "Luxury Textures Design 8",
                "texture_color": "#685848",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-77-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-77-1200x2800.jpg",
                "color_name": "Luxury 77",
            },
            {
                "id": "vmd-design-lx-009",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-78",
                "design_name": "Luxury Textures Design 9",
                "texture_color": "#584838",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-78-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-78-1200x2800.jpg",
                "color_name": "Luxury 78",
            },
            {
                "id": "vmd-design-lx-010",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-79",
                "design_name": "Luxury Textures Design 10",
                "texture_color": "#E0D0C0",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-79-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-79-1200x2800.jpg",
                "color_name": "Luxury 79",
            },
            {
                "id": "vmd-design-lx-011",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-81",
                "design_name": "Luxury Textures Design 11",
                "texture_color": "#D0C0B0",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-81-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-81-1200x2800.jpg",
                "color_name": "Luxury 81",
            },
            {
                "id": "vmd-design-lx-012",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-82",
                "design_name": "Luxury Textures Design 12",
                "texture_color": "#C0B0A0",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-82-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-82-1200x2800.jpg",
                "color_name": "Luxury 82",
            },
            {
                "id": "vmd-design-lx-013",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-83",
                "design_name": "Luxury Textures Design 13",
                "texture_color": "#B0A090",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-83-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-83-1200x2800.jpg",
                "color_name": "Luxury 83",
            },
            {
                "id": "vmd-design-lx-014",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-84",
                "design_name": "Luxury Textures Design 14",
                "texture_color": "#A09080",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-84-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-84-1200x2800.jpg",
                "color_name": "Luxury 84",
            },
            {
                "id": "vmd-design-lx-015",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-85",
                "design_name": "Luxury Textures Design 15",
                "texture_color": "#908070",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-85-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-85-1200x2800.jpg",
                "color_name": "Luxury 85",
            },
            {
                "id": "vmd-design-lx-016",
                "product_type": "flat-embossed-vmd",
                "category": "Luxury Textures",
                "design_code": "FB-PT-86",
                "design_name": "Luxury Textures Design 16",
                "texture_color": "#807060",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-86-1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-luxury-textures/FB-PT-86-1200x2800.jpg",
                "color_name": "Luxury 86",
            },
            # ── Add more Luxury Textures designs here ─────────────────────
        ],
        "Leather": [
            {
                "id": "vmd-design-lh-001",
                "product_type": "flat-embossed-vmd",
                "category": "Leather",
                "design_code": "LH-BR-01",
                "design_name": "Leather Brown 1",
                "texture_color": "#8B5A2B",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-BR-01_1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-BR-01_1200x2800.jpg",
                "color_name": "Brown 1",
                "emboss": False,
            },
            {
                "id": "vmd-design-lh-002",
                "product_type": "flat-embossed-vmd",
                "category": "Leather",
                "design_code": "LH-BR-02",
                "design_name": "Leather Brown 2",
                "texture_color": "#7A4A20",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-BR-02_1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-BR-02_1200x2800.jpg",
                "color_name": "Brown 2",
                "emboss": False,
            },
            {
                "id": "vmd-design-lh-003",
                "product_type": "flat-embossed-vmd",
                "category": "Leather",
                "design_code": "LH-BR-03",
                "design_name": "Leather Brown 3",
                "texture_color": "#6A3A15",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-BR-03_1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-BR-03_1200x2800.jpg",
                "color_name": "Brown 3",
                "emboss": False,
            },
            {
                "id": "vmd-design-lh-004",
                "product_type": "flat-embossed-vmd",
                "category": "Leather",
                "design_code": "LH-BR-04",
                "design_name": "Leather Brown 4",
                "texture_color": "#5A2A0A",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-BR-04_1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-BR-04_1200x2800.jpg",
                "color_name": "Brown 4",
                "emboss": False,
            },
            {
                "id": "vmd-design-lh-005",
                "product_type": "flat-embossed-vmd",
                "category": "Leather",
                "design_code": "LH-BR-05",
                "design_name": "Leather Brown 5",
                "texture_color": "#9B6A3B",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-BR-05_1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-BR-05_1200x2800.jpg",
                "color_name": "Brown 5",
                "emboss": False,
            },
            {
                "id": "vmd-design-lh-006",
                "product_type": "flat-embossed-vmd",
                "category": "Leather",
                "design_code": "LH-BR-06",
                "design_name": "Leather Brown 6",
                "texture_color": "#AB7A4B",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-BR-06_1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-BR-06_1200x2800.jpg",
                "color_name": "Brown 6",
                "emboss": False,
            },
            {
                "id": "vmd-design-lh-007",
                "product_type": "flat-embossed-vmd",
                "category": "Leather",
                "design_code": "LH-GR-01",
                "design_name": "Leather Green 1",
                "texture_color": "#4A6B4A",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-GR-01_1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-GR-01_1200x2800.jpg",
                "color_name": "Green 1",
                "emboss": False,
            },
            {
                "id": "vmd-design-lh-008",
                "product_type": "flat-embossed-vmd",
                "category": "Leather",
                "design_code": "LH-GY-01",
                "design_name": "Leather Grey 1",
                "texture_color": "#8A8A8A",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-GY-01_1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-GY-01_1200x2800.jpg",
                "color_name": "Grey 1",
                "emboss": False,
            },
            {
                "id": "vmd-design-lh-009",
                "product_type": "flat-embossed-vmd",
                "category": "Leather",
                "design_code": "LH-GY-02",
                "design_name": "Leather Grey 2",
                "texture_color": "#6A6A6A",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-GY-02_1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-GY-02_1200x2800.jpg",
                "color_name": "Grey 2",
                "emboss": False,
            },
            {
                "id": "vmd-design-lh-010",
                "product_type": "flat-embossed-vmd",
                "category": "Leather",
                "design_code": "LH-NE-01",
                "design_name": "Leather Neutral 1",
                "texture_color": "#C8B8A0",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-NE-01_1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-NE-01_1200x2800.jpg",
                "color_name": "Neutral 1",
                "emboss": False,
            },
            {
                "id": "vmd-design-lh-011",
                "product_type": "flat-embossed-vmd",
                "category": "Leather",
                "design_code": "LH-NE-02",
                "design_name": "Leather Neutral 2",
                "texture_color": "#B8A890",
                "texture_url": "/static/images/flat-embossed-vmt/panels/vmd-leather/LH-NE-02_1200x2800.jpg",
                "thumbnail_url": "/thumb/flat-embossed-vmt/panels/vmd-leather/LH-NE-02_1200x2800.jpg",
                "color_name": "Neutral 2",
                "emboss": False,
            },
            # ── Add more Leather designs here ─────────────────────────────
        ],
    }

    # TODO: move to vmd_categories_emboss once emboss assets are fully ready
    TEMP_EMBOSS_ENABLED = {"Rhythm & Repeat", "Marble", "Leather"}

    design_counter = 1
    for cat in vmd_categories_non_emboss:
        cat_id = f"vmd-{cat.lower().replace(' ', '-').replace('&', 'and')}"
        category = {
            "id": cat_id,
            "name": cat,
            "product_type": "flat-embossed-vmd",
            "emboss_available": cat in TEMP_EMBOSS_ENABLED,
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
