from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

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


# Mock Product Data
def generate_mock_products():
    """Generate mock product data for all product types"""
    
    # Base texture URLs (placeholder patterns)
    texture_patterns = [
        "https://images.unsplash.com/photo-1543242274-d5c24731d725?w=400",
        "https://images.unsplash.com/photo-1546179297-f40bd5098d4b?w=400",
        "https://images.unsplash.com/photo-1624547612881-3dd00b4fddf5?w=400",
        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400",
        "https://images.unsplash.com/photo-1534312527009-56c7016453e6?w=400",
        "https://images.unsplash.com/photo-1557683316-973673baf926?w=400",
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
        "name": "Flat / Embossed VMD Panels",
        "active": True,
        "sizes": ["600x600", "1200x600", "1200x1200", "1200x2800"],
        "densities": ["HD (High Density)", "LD (Low Density)"],
        "patterns": [],
        "colors": [],
        "thicknesses": [],
        "categories": []
    }
    
    design_counter = 1
    for cat in vmd_categories_non_emboss:
        category = {
            "id": f"vmd-{cat.lower().replace(' ', '-').replace('&', 'and')}",
            "name": cat,
            "product_type": "flat-embossed-vmd",
            "emboss_available": False,
            "designs": []
        }
        for i in range(4):
            category["designs"].append({
                "id": f"vmd-design-{design_counter}",
                "product_type": "flat-embossed-vmd",
                "category": cat,
                "design_code": f"VMD-{design_counter:04d}",
                "design_name": f"{cat} Design {i+1}",
                "texture_url": texture_patterns[i % len(texture_patterns)],
                "thumbnail_url": texture_patterns[i % len(texture_patterns)],
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
            category["designs"].append({
                "id": f"vmd-design-{design_counter}",
                "product_type": "flat-embossed-vmd",
                "category": cat,
                "design_code": f"VMD-{design_counter:04d}",
                "design_name": f"{cat} Design {i+1}",
                "texture_url": texture_patterns[i % len(texture_patterns)],
                "thumbnail_url": texture_patterns[i % len(texture_patterns)],
                "emboss": False,
            })
            design_counter += 1
        vmd_panel["categories"].append(category)
    
    products.append(vmd_panel)
    
    # 2. Colored HD VMD Panels (INACTIVE)
    colored_vmd = {
        "id": "colored-hd-vmd",
        "name": "Colored HD VMD Panels",
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
    
    for cat in ombre_categories:
        category = {
            "id": f"ombre-{cat.lower().replace(' ', '-')}",
            "name": cat,
            "product_type": "colored-hd-ombre",
            "emboss_available": False,
            "designs": []
        }
        for i in range(3):
            category["designs"].append({
                "id": f"ombre-design-{design_counter}",
                "product_type": "colored-hd-ombre",
                "category": cat,
                "design_code": f"OMB-{design_counter:04d}",
                "design_name": f"{cat} Gradient {i+1}",
                "texture_url": texture_patterns[(i+2) % len(texture_patterns)],
                "thumbnail_url": texture_patterns[(i+2) % len(texture_patterns)],
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
                "design_name": f"{pattern} - Color {i+1}",
                "texture_url": texture_patterns[0],
                "thumbnail_url": texture_patterns[0],
                "pattern": pattern,
                "color": color,
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

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    
    return status_checks

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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
