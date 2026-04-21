-- Production Add-ons Migration SQL
-- Run this in your production database to copy add-ons from development

-- Clear existing data (optional - uncomment if you want to start fresh)
-- DELETE FROM addon_variants;
-- DELETE FROM addon_groups;
-- DELETE FROM addon_option_sets;

-- Insert Option Sets
INSERT INTO addon_option_sets (id, name, description, allowed_countries, allowed_product_ids, display_order, is_active, created_at, updated_at) VALUES
('db3f6f8b-f43e-4195-a17a-ae6afe7104de', 'Box Frame Option Set', 'Box Frame and Paper Upgrade options for UK, EU, and US', ARRAY['GB','US','DE','FR','BE','NL','SE','NO','PT','PL','HU','RO','FI','IE','ES','AT','IT','DK','GR','HR','SK','SI','LT','LV','EE','BG','CZ','MT','IS']::text[], NULL, 1, true, NOW(), NOW()),
('60a109e5-9c68-4278-8941-3b3c795400b2', 'Box Frame Option Set - AU + NZ Only', 'Box Frame and Paper Upgrade options for Australia and New Zealand', ARRAY['AU','NZ']::text[], NULL, 2, true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  allowed_countries = EXCLUDED.allowed_countries,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Insert Groups (UK/EU/US)
INSERT INTO addon_groups (id, option_set_id, name, slug, description, image_url, shopify_product_id, shopify_product_handle, display_conditions, condition_logic, display_order, is_active, created_at, updated_at) VALUES
('d34ae73e-3573-467e-9b72-c8b1826026d0', 'db3f6f8b-f43e-4195-a17a-ae6afe7104de', 'Black Box Frame', 'black-box-frame', 'Our most luxurious frame. Milled from solid Ash and hand-stained.', '/objects/440d67dd-1c2c-4d3c-84f3-250f5a41264f-addon-group-d34ae73e-3573-467e-9b72-c8b1826026d0-1769944545594.jpg', '15079516209529', 'option-set-1180177-buttons-1', '[{"field": "shopify_variant", "value": "Black Frame", "operator": "contains"}, {"field": "shopify_variant", "value": "Unframed", "operator": "not_contains"}]', 'all', 1, true, NOW(), NOW()),
('4e9fa149-429e-4918-8d51-59478a28bb99', 'db3f6f8b-f43e-4195-a17a-ae6afe7104de', 'White Box Frame', 'white-box-frame', 'Our most luxurious frame. Milled from solid Ash and hand-stained.', '/objects/f5119f62-9283-4cfa-9872-21951b2ed0fd-addon-group-4e9fa149-429e-4918-8d51-59478a28bb99-1769944563380.jpg', '15079516209529', 'option-set-1180177-buttons-1', '[{"field": "shopify_variant", "value": "White Frame", "operator": "contains"}, {"field": "shopify_variant", "value": "Unframed", "operator": "not_contains"}]', 'all', 2, true, NOW(), NOW()),
('30297dee-7d27-4d13-bf74-8df15c7691a2', 'db3f6f8b-f43e-4195-a17a-ae6afe7104de', 'Natural Box Frame', 'natural-box-frame', 'Our most luxurious frame. Milled from solid Ash and hand-stained.', '/objects/b9d0f13e-4e9f-4fa6-a7de-7abe47492565-addon-group-30297dee-7d27-4d13-bf74-8df15c7691a2-1769944577078.jpg', '15079516209529', 'option-set-1180177-buttons-1', '[{"field": "shopify_variant", "value": "Natural Frame", "operator": "contains"}, {"field": "shopify_variant", "value": "Unframed", "operator": "not_contains"}]', 'all', 3, true, NOW(), NOW()),
('98a73976-875a-42e3-aad8-271495e0b69f', 'db3f6f8b-f43e-4195-a17a-ae6afe7104de', 'Hahnemühle German Etching Paper', 'paper-upgrade-row', 'Luxurious, 310gsm textured paper.', '/objects/6e3dadc6-498f-4814-9159-a12d3310a7d4-addon-group-98a73976-875a-42e3-aad8-271495e0b69f-1769944603128.jpg', '15081129247097', 'paper-upgrade', '[{"field": "shopify_variant", "value": "Unframed", "operator": "contains"}]', 'all', 4, true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  image_url = EXCLUDED.image_url,
  shopify_product_id = EXCLUDED.shopify_product_id,
  shopify_product_handle = EXCLUDED.shopify_product_handle,
  display_conditions = EXCLUDED.display_conditions,
  condition_logic = EXCLUDED.condition_logic,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Insert Groups (AU/NZ)
INSERT INTO addon_groups (id, option_set_id, name, slug, description, image_url, shopify_product_id, shopify_product_handle, display_conditions, condition_logic, display_order, is_active, created_at, updated_at) VALUES
('646c06dc-195f-4f3e-8da5-fb11793f76bb', '60a109e5-9c68-4278-8941-3b3c795400b2', 'Black Box Frame', 'black-box-frame-au', 'Our most luxurious frame. Milled from solid Ash and hand-stained.', '/objects/8418295d-0bdf-4ff5-8fc1-661f6ddf0776-addon-group-646c06dc-195f-4f3e-8da5-fb11793f76bb-1769947484642.jpg', '15079516209529', 'option-set-1180177-buttons-1', '[{"field": "shopify_variant", "value": "Black Frame", "operator": "contains"}, {"field": "shopify_variant", "value": "Unframed", "operator": "not_contains"}]', 'all', 1, true, NOW(), NOW()),
('75e12c39-8c08-459b-a511-e0e73afa724c', '60a109e5-9c68-4278-8941-3b3c795400b2', 'White Box Frame', 'white-box-frame-au', 'Our most luxurious frame. Milled from solid Ash and hand-stained.', '/objects/605cf63f-f382-42da-9df8-246a2ffaa754-addon-group-75e12c39-8c08-459b-a511-e0e73afa724c-1769947510884.jpg', '15079516209529', 'option-set-1180177-buttons-1', '[{"field": "shopify_variant", "value": "White Frame", "operator": "contains"}, {"field": "shopify_variant", "value": "Unframed", "operator": "not_contains"}]', 'all', 2, true, NOW(), NOW()),
('1ad0ba51-f0d7-494a-9b8f-bd3fe4be094b', '60a109e5-9c68-4278-8941-3b3c795400b2', 'Natural Box Frame', 'natural-box-frame-au', 'Our most luxurious frame. Milled from solid Ash and hand-stained.', '/objects/8e9a6f6e-9560-4b13-94c2-51e6e7e702a0-addon-group-1ad0ba51-f0d7-494a-9b8f-bd3fe4be094b-1769947522168.jpg', '15079516209529', 'option-set-1180177-buttons-1', '[{"field": "shopify_variant", "value": "Natural Frame", "operator": "contains"}, {"field": "shopify_variant", "value": "Unframed", "operator": "not_contains"}]', 'all', 3, true, NOW(), NOW()),
('33d67d17-c273-47e6-a452-d8ee33678cef', '60a109e5-9c68-4278-8941-3b3c795400b2', 'Hahnemühle German Etching Paper', 'paper-upgrade-au-group', 'Luxurious, 310gsm textured paper.', '/objects/d6757c77-3196-4d43-8121-dc2da852e914-addon-group-33d67d17-c273-47e6-a452-d8ee33678cef-1769947537840.jpg', '15081129247097', 'paper-upgrade', '[{"field": "shopify_variant", "value": "Unframed", "operator": "contains"}]', 'all', 4, true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  image_url = EXCLUDED.image_url,
  shopify_product_id = EXCLUDED.shopify_product_id,
  shopify_product_handle = EXCLUDED.shopify_product_handle,
  display_conditions = EXCLUDED.display_conditions,
  condition_logic = EXCLUDED.condition_logic,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Insert Variants (UK/EU/US - Black Box Frame)
INSERT INTO addon_variants (id, group_id, name, shopify_variant_id, price, currency, size_patterns, display_order, is_active, created_at, updated_at) VALUES
('a1000001-0001-0001-0001-000000000001', 'd34ae73e-3573-467e-9b72-c8b1826026d0', 'A4, 8" x 12", 8" x 10", 6" x 8"', '55597339967865', 40.00, 'GBP', ARRAY['A4','8" x 12"','8" x 10"','6" x 8"','8x12','8x10','6x8']::text[], 1, true, NOW(), NOW()),
('78593e8f-4dee-4030-96d2-002917437465', 'd34ae73e-3573-467e-9b72-c8b1826026d0', 'A3, 12" x 16", 12" x 12", 12" x 18", 16" x 16"', '55602886672761', 65.00, 'GBP', ARRAY['A3','12" x 16"','12" x 12"','12" x 18"','16" x 16"','12x16','12x12','12x18','16x16']::text[], 2, true, NOW(), NOW()),
('58444265-ec50-4c69-86cd-63bc3410482b', 'd34ae73e-3573-467e-9b72-c8b1826026d0', 'A2, 16" x 20", 18" x 24", 20" x 20"', '55602886705529', 80.00, 'GBP', ARRAY['A2','16" x 20"','18" x 24"','20" x 20"','16x20','18x24','20x20']::text[], 3, true, NOW(), NOW()),
('d8870a57-4c5d-4b54-a373-3ea2addac97e', 'd34ae73e-3573-467e-9b72-c8b1826026d0', 'A1, 20" x 30", 24" x 32", 20" x 28"', '55602886738297', 90.00, 'GBP', ARRAY['A1','20" x 30"','24" x 32"','20" x 28"','20x30','24x32','20x28']::text[], 4, true, NOW(), NOW()),
('5561fb83-b570-42b9-aaca-e14e074f9366', 'd34ae73e-3573-467e-9b72-c8b1826026d0', '24" x 36", 30" x 30"', '55602886771065', 100.00, 'GBP', ARRAY['24" x 36"','30" x 30"','24x36','30x30']::text[], 5, true, NOW(), NOW()),
('85ea75e4-5464-4f3f-9139-b72f8a8ea152', 'd34ae73e-3573-467e-9b72-c8b1826026d0', 'A0, 28" x 40"', '55602886836601', 120.00, 'GBP', ARRAY['A0','28" x 40"','28x40']::text[], 7, true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  shopify_variant_id = EXCLUDED.shopify_variant_id,
  price = EXCLUDED.price,
  currency = EXCLUDED.currency,
  size_patterns = EXCLUDED.size_patterns,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Insert Variants (UK/EU/US - White Box Frame) - Same Shopify variant IDs as Black
INSERT INTO addon_variants (id, group_id, name, shopify_variant_id, price, currency, size_patterns, display_order, is_active, created_at, updated_at) VALUES
('a2000001-0001-0001-0001-000000000001', '4e9fa149-429e-4918-8d51-59478a28bb99', 'A4, 8" x 12", 8" x 10", 6" x 8"', '55597339967865', 40.00, 'GBP', ARRAY['A4','8" x 12"','8" x 10"','6" x 8"','8x12','8x10','6x8']::text[], 1, true, NOW(), NOW()),
('a2000002-0001-0001-0001-000000000002', '4e9fa149-429e-4918-8d51-59478a28bb99', 'A3, 12" x 16", 12" x 12", 12" x 18", 16" x 16"', '55602886672761', 65.00, 'GBP', ARRAY['A3','12" x 16"','12" x 12"','12" x 18"','16" x 16"','12x16','12x12','12x18','16x16']::text[], 2, true, NOW(), NOW()),
('a2000003-0001-0001-0001-000000000003', '4e9fa149-429e-4918-8d51-59478a28bb99', 'A2, 16" x 20", 18" x 24", 20" x 20"', '55602886705529', 80.00, 'GBP', ARRAY['A2','16" x 20"','18" x 24"','20" x 20"','16x20','18x24','20x20']::text[], 3, true, NOW(), NOW()),
('a2000004-0001-0001-0001-000000000004', '4e9fa149-429e-4918-8d51-59478a28bb99', 'A1, 20" x 30", 24" x 32", 20" x 28"', '55602886738297', 90.00, 'GBP', ARRAY['A1','20" x 30"','24" x 32"','20" x 28"','20x30','24x32','20x28']::text[], 4, true, NOW(), NOW()),
('a2000005-0001-0001-0001-000000000005', '4e9fa149-429e-4918-8d51-59478a28bb99', '24" x 36", 30" x 30"', '55602886771065', 100.00, 'GBP', ARRAY['24" x 36"','30" x 30"','24x36','30x30']::text[], 5, true, NOW(), NOW()),
('a2000006-0001-0001-0001-000000000006', '4e9fa149-429e-4918-8d51-59478a28bb99', 'A0, 28" x 40"', '55602886836601', 120.00, 'GBP', ARRAY['A0','28" x 40"','28x40']::text[], 7, true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  shopify_variant_id = EXCLUDED.shopify_variant_id,
  price = EXCLUDED.price,
  currency = EXCLUDED.currency,
  size_patterns = EXCLUDED.size_patterns,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Insert Variants (UK/EU/US - Natural Box Frame) - Same Shopify variant IDs as Black
INSERT INTO addon_variants (id, group_id, name, shopify_variant_id, price, currency, size_patterns, display_order, is_active, created_at, updated_at) VALUES
('a3000001-0001-0001-0001-000000000001', '30297dee-7d27-4d13-bf74-8df15c7691a2', 'A4, 8" x 12", 8" x 10", 6" x 8"', '55597339967865', 40.00, 'GBP', ARRAY['A4','8" x 12"','8" x 10"','6" x 8"','8x12','8x10','6x8']::text[], 1, true, NOW(), NOW()),
('a3000002-0001-0001-0001-000000000002', '30297dee-7d27-4d13-bf74-8df15c7691a2', 'A3, 12" x 16", 12" x 12", 12" x 18", 16" x 16"', '55602886672761', 65.00, 'GBP', ARRAY['A3','12" x 16"','12" x 12"','12" x 18"','16" x 16"','12x16','12x12','12x18','16x16']::text[], 2, true, NOW(), NOW()),
('a3000003-0001-0001-0001-000000000003', '30297dee-7d27-4d13-bf74-8df15c7691a2', 'A2, 16" x 20", 18" x 24", 20" x 20"', '55602886705529', 80.00, 'GBP', ARRAY['A2','16" x 20"','18" x 24"','20" x 20"','16x20','18x24','20x20']::text[], 3, true, NOW(), NOW()),
('a3000004-0001-0001-0001-000000000004', '30297dee-7d27-4d13-bf74-8df15c7691a2', 'A1, 20" x 30", 24" x 32", 20" x 28"', '55602886738297', 90.00, 'GBP', ARRAY['A1','20" x 30"','24" x 32"','20" x 28"','20x30','24x32','20x28']::text[], 4, true, NOW(), NOW()),
('a3000005-0001-0001-0001-000000000005', '30297dee-7d27-4d13-bf74-8df15c7691a2', '24" x 36", 30" x 30"', '55602886771065', 100.00, 'GBP', ARRAY['24" x 36"','30" x 30"','24x36','30x30']::text[], 5, true, NOW(), NOW()),
('a3000006-0001-0001-0001-000000000006', '30297dee-7d27-4d13-bf74-8df15c7691a2', 'A0, 28" x 40"', '55602886836601', 120.00, 'GBP', ARRAY['A0','28" x 40"','28x40']::text[], 7, true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  shopify_variant_id = EXCLUDED.shopify_variant_id,
  price = EXCLUDED.price,
  currency = EXCLUDED.currency,
  size_patterns = EXCLUDED.size_patterns,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Insert Variants (UK/EU/US - Paper Upgrade)
INSERT INTO addon_variants (id, group_id, name, shopify_variant_id, price, currency, size_patterns, display_order, is_active, created_at, updated_at) VALUES
('a4000001-0001-0001-0001-000000000001', '98a73976-875a-42e3-aad8-271495e0b69f', 'Paper Upgrade - Small', '55603412337017', 15.00, 'GBP', ARRAY['A4','8" x 12"','8" x 10"','11" x 14"','6" x 8"','8x12','8x10','11x14','6x8']::text[], 1, true, NOW(), NOW()),
('93ab2e66-7482-40fc-81fb-2fae61c7e255', '98a73976-875a-42e3-aad8-271495e0b69f', 'Paper Upgrade - Medium', '55603412369785', 23.00, 'GBP', ARRAY['A3','12" x 16"','12" x 12"','12" x 18"','16" x 16"','12x16','12x12','12x18','16x16']::text[], 2, true, NOW(), NOW()),
('ee29d819-c461-4dce-99f7-828e06a0f325', '98a73976-875a-42e3-aad8-271495e0b69f', 'Paper Upgrade - A2', '55603412402553', 39.00, 'GBP', ARRAY['A2','16" x 20"','18" x 24"','20" x 20"','16x20','18x24','20x20']::text[], 3, true, NOW(), NOW()),
('b11f206c-ceb0-4665-9963-609389d5a90e', '98a73976-875a-42e3-aad8-271495e0b69f', 'Paper Upgrade - A1', '55603412435321', 65.00, 'GBP', ARRAY['A1','20" x 30"','24" x 36"','30" x 30"','24" x 32"','20" x 28"','20x30','24x36','30x30','24x32','20x28']::text[], 4, true, NOW(), NOW()),
('630a1aee-490c-418d-9c99-6aba0464c725', '98a73976-875a-42e3-aad8-271495e0b69f', 'Paper Upgrade - A0', '55603579748729', 100.00, 'GBP', ARRAY['A0','30" x 40"','28" x 40"','30x40','28x40']::text[], 5, true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  shopify_variant_id = EXCLUDED.shopify_variant_id,
  price = EXCLUDED.price,
  currency = EXCLUDED.currency,
  size_patterns = EXCLUDED.size_patterns,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Insert Variants (AU/NZ - Black Box Frame)
INSERT INTO addon_variants (id, group_id, name, shopify_variant_id, price, currency, size_patterns, display_order, is_active, created_at, updated_at) VALUES
('81eeb651-5205-4122-b44c-e53e38ab9b74', '646c06dc-195f-4f3e-8da5-fb11793f76bb', 'A4, 8" x 12", 8" x 10", 6" x 8"', '55597339967865', 40.00, 'AUD', ARRAY['A4','8" x 12"','8" x 10"','6" x 8"','8x12','8x10','6x8']::text[], 1, true, NOW(), NOW()),
('1d5166cd-24f0-4e55-8801-2cbd73203f9f', '646c06dc-195f-4f3e-8da5-fb11793f76bb', 'A3, 12" x 16", 12" x 12", 12" x 18"', '55602886672761', 65.00, 'AUD', ARRAY['A3','12" x 16"','12" x 12"','12" x 18"','12x16','12x12','12x18']::text[], 2, true, NOW(), NOW()),
('fa85443d-a0ea-40e1-833b-5e0d02e7887d', '646c06dc-195f-4f3e-8da5-fb11793f76bb', 'A2, 16" x 20", 18" x 24", 20" x 20"', '55602886705529', 80.00, 'AUD', ARRAY['A2','16" x 20"','18" x 24"','20" x 20"','16x20','18x24','20x20']::text[], 3, true, NOW(), NOW()),
('5601e79c-3ef3-4c08-a8d4-983753f49403', '646c06dc-195f-4f3e-8da5-fb11793f76bb', 'A1, 20" x 28"', '55602886738297', 90.00, 'AUD', ARRAY['A1','20" x 28"','20x28']::text[], 4, true, NOW(), NOW()),
('cd16a651-1340-4339-af7a-2d13f431e71c', '646c06dc-195f-4f3e-8da5-fb11793f76bb', '24" x 36", 30" x 30"', '55602886803833', 110.00, 'AUD', ARRAY['24" x 36"','30" x 30"','24x36','30x30']::text[], 5, true, NOW(), NOW()),
('f2a0ff38-cccc-4615-84ab-db600d430f43', '646c06dc-195f-4f3e-8da5-fb11793f76bb', 'A0, 28" x 40", 30" x 40"', '55602886836601', 120.00, 'AUD', ARRAY['A0','28" x 40"','30" x 40"','28x40','30x40']::text[], 6, true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  shopify_variant_id = EXCLUDED.shopify_variant_id,
  price = EXCLUDED.price,
  currency = EXCLUDED.currency,
  size_patterns = EXCLUDED.size_patterns,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Insert Variants (AU/NZ - White Box Frame)
INSERT INTO addon_variants (id, group_id, name, shopify_variant_id, price, currency, size_patterns, display_order, is_active, created_at, updated_at) VALUES
('4d40fceb-1c45-420b-a5f9-7fd524b8af56', '75e12c39-8c08-459b-a511-e0e73afa724c', 'A4, 8" x 12", 8" x 10", 6" x 8"', '55597339967865', 40.00, 'AUD', ARRAY['A4','8" x 12"','8" x 10"','6" x 8"','8x12','8x10','6x8']::text[], 1, true, NOW(), NOW()),
('9920504d-4102-4a6e-b115-a0c6ee3a72c0', '75e12c39-8c08-459b-a511-e0e73afa724c', 'A3, 12" x 16", 12" x 12", 12" x 18"', '55602886672761', 65.00, 'AUD', ARRAY['A3','12" x 16"','12" x 12"','12" x 18"','12x16','12x12','12x18']::text[], 2, true, NOW(), NOW()),
('cdac10c2-5155-49b4-ba12-7dbc02891041', '75e12c39-8c08-459b-a511-e0e73afa724c', 'A2, 16" x 20", 18" x 24", 20" x 20"', '55602886705529', 80.00, 'AUD', ARRAY['A2','16" x 20"','18" x 24"','20" x 20"','16x20','18x24','20x20']::text[], 3, true, NOW(), NOW()),
('d5ee804a-8d47-474e-a574-38181918a2b1', '75e12c39-8c08-459b-a511-e0e73afa724c', 'A1, 20" x 28"', '55602886738297', 90.00, 'AUD', ARRAY['A1','20" x 28"','20x28']::text[], 4, true, NOW(), NOW()),
('3daa3c77-f045-482f-ac9a-e08937537ecf', '75e12c39-8c08-459b-a511-e0e73afa724c', '24" x 36", 30" x 30"', '55602886803833', 110.00, 'AUD', ARRAY['24" x 36"','30" x 30"','24x36','30x30']::text[], 5, true, NOW(), NOW()),
('c7cd9796-c638-4def-85cc-c8b0182e1340', '75e12c39-8c08-459b-a511-e0e73afa724c', 'A0, 28" x 40", 30" x 40"', '55602886836601', 120.00, 'AUD', ARRAY['A0','28" x 40"','30" x 40"','28x40','30x40']::text[], 6, true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  shopify_variant_id = EXCLUDED.shopify_variant_id,
  price = EXCLUDED.price,
  currency = EXCLUDED.currency,
  size_patterns = EXCLUDED.size_patterns,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Insert Variants (AU/NZ - Natural Box Frame)
INSERT INTO addon_variants (id, group_id, name, shopify_variant_id, price, currency, size_patterns, display_order, is_active, created_at, updated_at) VALUES
('2906a4de-e477-4d58-b22c-5b483ca36ff0', '1ad0ba51-f0d7-494a-9b8f-bd3fe4be094b', 'A4, 8" x 12", 8" x 10", 6" x 8"', '55597339967865', 40.00, 'AUD', ARRAY['A4','8" x 12"','8" x 10"','6" x 8"','8x12','8x10','6x8']::text[], 1, true, NOW(), NOW()),
('908f6c78-41db-49dc-b297-32439a96e520', '1ad0ba51-f0d7-494a-9b8f-bd3fe4be094b', 'A3, 12" x 16", 12" x 12", 12" x 18"', '55602886672761', 65.00, 'AUD', ARRAY['A3','12" x 16"','12" x 12"','12" x 18"','12x16','12x12','12x18']::text[], 2, true, NOW(), NOW()),
('7958669c-b283-4645-8d91-c6f8a233302b', '1ad0ba51-f0d7-494a-9b8f-bd3fe4be094b', 'A2, 16" x 20", 18" x 24", 20" x 20"', '55602886705529', 80.00, 'AUD', ARRAY['A2','16" x 20"','18" x 24"','20" x 20"','16x20','18x24','20x20']::text[], 3, true, NOW(), NOW()),
('cf82a1f8-9244-4bc0-a648-27da12ccc1a1', '1ad0ba51-f0d7-494a-9b8f-bd3fe4be094b', 'A1, 20" x 28"', '55602886738297', 90.00, 'AUD', ARRAY['A1','20" x 28"','20x28']::text[], 4, true, NOW(), NOW()),
('d49db045-0d39-4519-8bdf-452fa84fea03', '1ad0ba51-f0d7-494a-9b8f-bd3fe4be094b', '24" x 36", 30" x 30"', '55602886803833', 110.00, 'AUD', ARRAY['24" x 36"','30" x 30"','24x36','30x30']::text[], 5, true, NOW(), NOW()),
('bd999b8c-356e-4624-92e9-d34d8bae3841', '1ad0ba51-f0d7-494a-9b8f-bd3fe4be094b', 'A0, 28" x 40", 30" x 40"', '55602886836601', 120.00, 'AUD', ARRAY['A0','28" x 40"','30" x 40"','28x40','30x40']::text[], 6, true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  shopify_variant_id = EXCLUDED.shopify_variant_id,
  price = EXCLUDED.price,
  currency = EXCLUDED.currency,
  size_patterns = EXCLUDED.size_patterns,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Insert Variants (AU/NZ - Paper Upgrade)
INSERT INTO addon_variants (id, group_id, name, shopify_variant_id, price, currency, size_patterns, display_order, is_active, created_at, updated_at) VALUES
('b5000001-0001-0001-0001-000000000001', '33d67d17-c273-47e6-a452-d8ee33678cef', 'Paper Upgrade - Small', '55603412337017', 25.00, 'AUD', ARRAY['A4','8" x 12"','8" x 10"','11" x 14"','6" x 8"','8x12','8x10','11x14','6x8']::text[], 1, true, NOW(), NOW()),
('b5000002-0001-0001-0001-000000000002', '33d67d17-c273-47e6-a452-d8ee33678cef', 'Paper Upgrade - Medium', '55603412369785', 40.00, 'AUD', ARRAY['A3','12" x 16"','12" x 12"','12" x 18"','16" x 16"','12x16','12x12','12x18','16x16']::text[], 2, true, NOW(), NOW()),
('b5000003-0001-0001-0001-000000000003', '33d67d17-c273-47e6-a452-d8ee33678cef', 'Paper Upgrade - A2', '55603412402553', 80.00, 'AUD', ARRAY['A2','16" x 20"','18" x 24"','20" x 20"','16x20','18x24','20x20']::text[], 3, true, NOW(), NOW()),
('b5000004-0001-0001-0001-000000000004', '33d67d17-c273-47e6-a452-d8ee33678cef', 'Paper Upgrade - A1', '55603412435321', 60.00, 'AUD', ARRAY['A1','20" x 30"','24" x 36"','30" x 30"','24" x 32"','20" x 28"','20x30','24x36','30x30','24x32','20x28']::text[], 4, true, NOW(), NOW()),
('b5000005-0001-0001-0001-000000000005', '33d67d17-c273-47e6-a452-d8ee33678cef', 'Paper Upgrade - A0', '55603579748729', 100.00, 'AUD', ARRAY['A0','30" x 40"','28" x 40"','30x40','28x40']::text[], 5, true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  shopify_variant_id = EXCLUDED.shopify_variant_id,
  price = EXCLUDED.price,
  currency = EXCLUDED.currency,
  size_patterns = EXCLUDED.size_patterns,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Verify the migration
SELECT 'Option Sets' as type, COUNT(*) as count FROM addon_option_sets
UNION ALL
SELECT 'Groups' as type, COUNT(*) as count FROM addon_groups
UNION ALL
SELECT 'Variants' as type, COUNT(*) as count FROM addon_variants WHERE group_id IS NOT NULL;
