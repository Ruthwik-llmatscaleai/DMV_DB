---
name: figma-to-code
description: Convert Figma designs into React + Tailwind CSS code. Use when the user pastes a Figma URL or asks to convert a Figma design to code.
---

# Figma to Code Conversion

## How It Works

When a user pastes a Figma file URL, the system:
1. Extracts the file key from the URL
2. Fetches the design data via Figma REST API
3. Simplifies the node tree into layout, colors, typography, and hierarchy
4. Passes the design context to the LLM for code generation

## Supported Figma URLs

- `https://www.figma.com/design/FILEKEY/FileName`
- `https://www.figma.com/file/FILEKEY/FileName`
- `https://www.figma.com/design/FILEKEY/FileName?node-id=1:234` (specific frame)

## Code Generation Guidelines

When converting Figma designs to code:

### Layout
- Map Figma Auto Layout → Tailwind flex/grid
- `HORIZONTAL` layout → `flex flex-row`
- `VERTICAL` layout → `flex flex-col`
- Use `gap-{n}` for itemSpacing
- Use `p-{n}` for padding

### Colors
- Extract fill colors and map to Tailwind color classes or custom values
- Use `bg-[#hex]` for custom colors not in Tailwind palette
- Preserve opacity with `opacity-{n}` or `bg-opacity-{n}`

### Typography
- Map font sizes to Tailwind: 12→text-xs, 14→text-sm, 16→text-base, 18→text-lg, 20→text-xl, 24→text-2xl, 30→text-3xl, 36→text-4xl
- Map font weights: 400→font-normal, 500→font-medium, 600→font-semibold, 700→font-bold
- Use Google Fonts for non-system fonts

### Components
- Map Figma components to React components
- Preserve naming from Figma layers
- Create separate files for reusable components

### Images
- Use placeholder images (via picsum.photos or placeholder divs)
- Add descriptive alt text based on layer names

## Authentication

Requires a Figma Personal Access Token:
1. Figma → Settings → Personal Access Tokens
2. Generate token with "File content (Read)" scope
3. Set as `FIGMA_API_KEY` environment variable
