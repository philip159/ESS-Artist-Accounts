# Design Guidelines: Art Submission & Product Management Platform

## Design Approach

**System Selection**: Material Design principles with Linear-inspired minimalism for clean, professional aesthetics
- Justification: Information-dense application requiring clear hierarchy, systematic organization, and professional credibility
- Balance: Artist-facing forms should feel welcoming; admin interfaces prioritize efficiency

## Core Design Principles

1. **Dual Personality**: Warm, approachable submission experience / Precise, data-focused admin interface
2. **Visual Hierarchy**: Clear distinction between primary actions, metadata, and system feedback
3. **Workflow Clarity**: Progress indicators and state changes must be immediately apparent
4. **Data Density**: Efficient information display without overwhelming users

## Typography System

**Font Families**:
- Headings: Montserrat (via Google Fonts) - H1-H4, page titles, section headers
- Body: Montserrat (via Google Fonts) - All body text, labels, paragraphs, UI elements

**Type Scale**:
- H1 (page titles, hero): text-4xl to text-5xl, font-bold, font-display
- H2 (section headers): text-2xl to text-3xl, font-semibold, font-display
- H3 (card headers): text-xl, font-medium, font-display
- H4 (subsection headers): text-lg, font-medium, font-display
- Body Large: text-base, font-normal, font-sans
- Body: text-sm, font-normal, font-sans
- Small (metadata labels): text-sm, font-medium, font-sans
- Caption (DPI info, file specs): text-xs, font-normal, font-sans

## Layout System

**Spacing Primitives**: Use Tailwind units of 2, 4, 6, 8, 12, 16, 20
- Component padding: p-4, p-6, p-8
- Section spacing: py-12, py-16, py-20
- Card gaps: gap-4, gap-6
- Form field spacing: space-y-4

**Grid System**:
- Admin dashboard: 12-column grid with gap-6
- Artist submission: Single column max-w-4xl centered
- Template gallery: 3-4 column grid (grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4)
- Mockup preview: 2-column layout (grid-cols-1 lg:grid-cols-2)

## Component Library

### Artist Submission Form
- **Hero Section**: Centered brand title "EAST SIDE STUDIO", clean white background, minimal styling
- **Form Layout**: Single column, max-w-3xl centered, clean white background
- **Form Fields**: Bold labels with asterisk for required fields, gray helper text below inputs
- **Upload Zone**: Clean file input with rounded borders
- **File Preview Cards**: Thumbnail with editable title field, DPI badge, ratio indicator, max size display
- **Submit Button**: Vibrant blue (primary color), rounded, full width
- **No Gradients**: Clean, minimal design throughout

### Admin Dashboard
- **Page Layout**: AdminLayout provides `p-6` padding automatically - do NOT add padding to individual pages
- **Page Container**: Use `<div className="space-y-6">` as the outer wrapper (no padding needed)
- **Top Navigation**: Fixed header with logo, search, notifications, profile
- **Sidebar**: Collapsible navigation (w-64 expanded, w-16 collapsed) with icon + label pattern
- **Stats Cards**: Grid of metric cards (grid-cols-4) showing submissions, processing queue, completed
- **Data Tables**: Sortable columns with fixed header, row actions, pagination
- **Template Configurator**: Canvas workspace with corner-point marker interface

### Mockup Management
- **Template Gallery**: Cards with template preview, edit button, frame count badge
- **Frame Mapper**: Full-screen canvas with clickable corner points, zoom controls, coordinate display
- **Preview Panel**: Side-by-side comparison (original artwork | generated mockup)
- **Batch Queue**: List view with artwork thumbnail, template assignments, progress bars

### Shared Components
- **Buttons**: 
  - Primary: px-6 py-3, rounded-lg, font-medium
  - Secondary: px-4 py-2, rounded-md, border
  - Icon buttons: p-2, rounded-full
- **Cards**: rounded-xl, overflow-hidden, with distinct header/body sections
- **Badges**: Pill-shaped (rounded-full px-3 py-1 text-xs) for status, DPI levels, ratios
- **Form Fields**: 
  - Input: h-12, px-4, rounded-lg, border
  - Label: text-sm font-medium mb-2 block
  - Helper text: text-xs mt-1
- **Modals**: max-w-2xl, rounded-2xl, with backdrop blur

## Icons
**Library**: Heroicons (via CDN)
- Upload: arrow-up-tray
- Image: photo
- Settings: cog-6-tooth  
- Templates: square-3-stack-3d
- Success: check-circle
- Warning: exclamation-triangle

## Images

### Artist Submission Page
- **Hero Image**: Inspirational art gallery or artist workspace photo (h-64, object-cover)
- **Empty State**: Illustration or photo when no uploads present

### Admin Dashboard  
- **Template Thumbnails**: Preview images of each mockup template
- **Artwork Thumbnails**: Low-res versions in data tables and cards
- **Mockup Previews**: Generated perspective-transformed mockups

### Specific Image Placements
- Hero: Full-width at top of submission form
- Template cards: Aspect-ratio-preserved thumbnails (aspect-video or aspect-square)
- File preview: Square thumbnails (w-24 h-24) with object-cover
- Mockup comparisons: Responsive images maintaining aspect ratio

## Accessibility
- Consistent focus states across all interactive elements
- ARIA labels for icon-only buttons
- Keyboard navigation for template configurator
- Error messages with both visual and text indicators
- Color-independent status indicators (use icons + text)

## Responsive Behavior
- Mobile (base): Single column, stacked navigation, simplified tables
- Tablet (md): 2-column grids, collapsible sidebar
- Desktop (lg+): Full multi-column layouts, expanded sidebar, side-by-side previews

## Key Interactions
- Drag-and-drop with visual feedback (border highlight, upload icon animation)
- Real-time DPI calculation display as images load
- Toast notifications for processing status (top-right, auto-dismiss)
- Inline editing for artwork titles (click to edit pattern)
- Template corner-point selection with visual markers and coordinate display