-- Sync Shopify Variant IDs from Development to Production
-- This updates existing production variants to use the correct Shopify variant IDs

-- ============================================
-- UK/EU/US Box Frames (black-box-frame)
-- ============================================
UPDATE addon_variants SET shopify_variant_id = '55597339967865', updated_at = NOW() 
WHERE id = 'e3b1f4aa-1193-45b8-9f44-45a8fc25eea2'; -- A4

UPDATE addon_variants SET shopify_variant_id = '55602886672761', updated_at = NOW() 
WHERE id = '78593e8f-4dee-4030-96d2-002917437465'; -- A3

UPDATE addon_variants SET shopify_variant_id = '55602886705529', updated_at = NOW() 
WHERE id = '58444265-ec50-4c69-86cd-63bc3410482b'; -- A2

UPDATE addon_variants SET shopify_variant_id = '55602886738297', updated_at = NOW() 
WHERE id = 'd8870a57-4c5d-4b54-a373-3ea2addac97e'; -- A1

UPDATE addon_variants SET shopify_variant_id = '55602886771065', updated_at = NOW() 
WHERE id = '5561fb83-b570-42b9-aaca-e14e074f9366'; -- 24x36, 30x30

UPDATE addon_variants SET shopify_variant_id = '55602886836601', updated_at = NOW() 
WHERE id = '85ea75e4-5464-4f3f-9139-b72f8a8ea152'; -- A0

-- ============================================
-- UK/EU/US Box Frames (white-box-frame)
-- ============================================
UPDATE addon_variants SET shopify_variant_id = '55597339967865', updated_at = NOW() 
WHERE id = '14304ac3-1978-424e-8103-5ab54e43f66b'; -- A4

UPDATE addon_variants SET shopify_variant_id = '55602886672761', updated_at = NOW() 
WHERE id = 'f58302dd-07b2-4c47-9552-4eb07088b284'; -- A3

UPDATE addon_variants SET shopify_variant_id = '55602886705529', updated_at = NOW() 
WHERE id = '04e58fd7-d6ab-4130-9cfc-8c4f40f78564'; -- A2

UPDATE addon_variants SET shopify_variant_id = '55602886738297', updated_at = NOW() 
WHERE id = '0748bd1e-e24d-4d0f-8af2-f89f5dbc2e8f'; -- A1

UPDATE addon_variants SET shopify_variant_id = '55602886771065', updated_at = NOW() 
WHERE id = 'fdf1c5fa-8006-4e27-a826-1a74c0256bed'; -- 24x36, 30x30

UPDATE addon_variants SET shopify_variant_id = '55602886836601', updated_at = NOW() 
WHERE id = '8b774816-7bf8-49ee-b532-e93f6946d914'; -- A0

-- ============================================
-- UK/EU/US Box Frames (natural-box-frame)
-- ============================================
UPDATE addon_variants SET shopify_variant_id = '55597339967865', updated_at = NOW() 
WHERE id = 'ba78bcdc-9ac2-4b14-bee2-fe33172cc123'; -- A4

UPDATE addon_variants SET shopify_variant_id = '55602886672761', updated_at = NOW() 
WHERE id = '8ee6e44c-9be1-45ac-ae15-0fe9105732c3'; -- A3

UPDATE addon_variants SET shopify_variant_id = '55602886705529', updated_at = NOW() 
WHERE id = '4b6fcf44-0adc-4067-aee2-b0b61ee990f8'; -- A2

UPDATE addon_variants SET shopify_variant_id = '55602886738297', updated_at = NOW() 
WHERE id = '7b9ad1c3-3269-4ad5-be85-5c5ec4c4fe32'; -- A1

UPDATE addon_variants SET shopify_variant_id = '55602886771065', updated_at = NOW() 
WHERE id = 'c36837d1-4aaf-4198-822d-6ebf55ea1a3e'; -- 24x36, 30x30

UPDATE addon_variants SET shopify_variant_id = '55602886836601', updated_at = NOW() 
WHERE id = '85b1d4a6-4f8f-4401-923e-71fd157a392e'; -- A0

-- ============================================
-- UK/EU/US Paper Upgrade (paper-upgrade-row)
-- Already have correct IDs, but including for completeness
-- ============================================
UPDATE addon_variants SET shopify_variant_id = '55603412337017', updated_at = NOW() 
WHERE id = '26fcaa14-4284-4f2b-b906-7c833c20ee53'; -- Small

UPDATE addon_variants SET shopify_variant_id = '55603412369785', updated_at = NOW() 
WHERE id = '93ab2e66-7482-40fc-81fb-2fae61c7e255'; -- Medium

UPDATE addon_variants SET shopify_variant_id = '55603412402553', updated_at = NOW() 
WHERE id = 'ee29d819-c461-4dce-99f7-828e06a0f325'; -- A2

UPDATE addon_variants SET shopify_variant_id = '55603412435321', updated_at = NOW() 
WHERE id = 'b11f206c-ceb0-4665-9963-609389d5a90e'; -- A1

UPDATE addon_variants SET shopify_variant_id = '55603579748729', updated_at = NOW() 
WHERE id = '630a1aee-490c-418d-9c99-6aba0464c725'; -- A0

-- ============================================
-- AU/NZ variants already have correct IDs from development
-- No changes needed for: black-box-frame-au, white-box-frame-au, 
-- natural-box-frame-au, paper-upgrade-au-group
-- ============================================

-- Verify the updates
SELECT 
  g.slug as group_slug,
  v.name,
  v.shopify_variant_id
FROM addon_variants v
JOIN addon_groups g ON v.group_id = g.id
WHERE g.slug IN ('black-box-frame', 'white-box-frame', 'natural-box-frame', 'paper-upgrade-row')
ORDER BY g.slug, v.display_order;
