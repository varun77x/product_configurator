# UniVicoustic 2D Product Configurator - PRD

## Original Problem Statement
Build a web-based MVP 2D product configurator for an acoustic wall panel company called UniVicoustic. The configurator should allow users to visualize wall panels applied to a wall inside a room scene. Focus on speed, scalability, and modular product data.

## User Personas
1. **Interior Designers** - Need to visualize panel options for client presentations
2. **Architects** - Require quick configuration for acoustic panel specifications
3. **Commercial Buyers** - Want to preview panels before bulk ordering

## Core Requirements (Static)
- 4 Product Types: VMD Panels (active), Colored HD VMD (inactive), Ombre Panels (active), VicStrip Panels (active)
- Dynamic configuration based on product type
- Real-time wall preview
- Save/load favorite configurations
- Download rendered images
- Scalable architecture for 1000+ SKUs

## What's Been Implemented (Jan 13, 2026)

### Backend (FastAPI)
- `/api/products` - Returns all product types with configurations
- `/api/products/{id}` - Get specific product
- `/api/products/{id}/categories` - Get categories
- Mock data generator for 4 product types with ~80 designs
- CORS enabled

### Frontend (React + Tailwind)
- Split-screen layout: Sidebar controls + Canvas preview
- Product type dropdown (inactive items show "Coming Soon")
- Dynamic sections based on product type:
  - **VMD Panels**: Category, Size, Density, Designs + Emboss toggle for Marble/Wood/Soft Texture/Leather
  - **Ombre Panels**: Category, Size, Designs
  - **VicStrip**: Pattern, Size, Thickness, 16 Color Swatches, Designs
- Thumbnail grid for design selection
- Canvas-based 2D wall texture rendering
- Save/Load favorites (localStorage)
- Download PNG functionality
- Reset configuration
- Toast notifications (sonner)
- Responsive design

### Styling
- Light/minimal corporate theme
- Brand colors: Blue (#3d4f5f) + Orange (#f97316)
- Fonts: Manrope (headings) + Inter (body)

## P0/P1/P2 Features Remaining

### P0 (Critical)
- None - MVP complete

### P1 (Important)
- Add real texture images (currently using Unsplash placeholders)
- Improve canvas rendering with actual interior background
- Add panel tiling grid lines overlay

### P2 (Nice to Have)
- User accounts for cloud-synced favorites
- Multiple room scenes/backgrounds
- Zoom/pan on canvas preview
- Price calculator integration
- Export to PDF/quote generator
- Share configuration via URL

## Next Tasks
1. Replace placeholder textures with actual panel images
2. Add more interior background options
3. Implement panel grid overlay visualization
4. Add mobile-optimized layout

## Technical Notes
- Product data is mock/static JSON (not from database)
- localStorage used for favorites persistence
- Canvas uses HTML5 Canvas API for rendering
- Texture tiling scales based on selected panel size
