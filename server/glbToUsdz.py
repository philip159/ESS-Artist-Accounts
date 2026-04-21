#!/usr/bin/env python3
"""
GLB to USDZ converter using Blender
Run with: blender --background --python glbToUsdz.py -- input.glb output.usdz
"""

import sys
import bpy

def convert_glb_to_usdz(input_path, output_path):
    # Clear existing objects
    bpy.ops.wm.read_factory_settings(use_empty=True)
    
    # Import GLB
    bpy.ops.import_scene.gltf(filepath=input_path)
    
    # Force all materials to be double-sided for iOS Quick Look compatibility
    # This fixes chamfer faces appearing transparent on iOS
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            for slot in obj.material_slots:
                if slot.material:
                    slot.material.use_backface_culling = False
    
    # Export as USDZ
    bpy.ops.wm.usd_export(
        filepath=output_path,
        export_textures=True,
        generate_preview_surface=True,
        export_materials=True,
    )
    
    print(f"Converted {input_path} to {output_path}")

if __name__ == "__main__":
    # Parse arguments after "--"
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []
    
    if len(argv) < 2:
        print("Usage: blender --background --python glbToUsdz.py -- input.glb output.usdz")
        sys.exit(1)
    
    input_glb = argv[0]
    output_usdz = argv[1]
    
    convert_glb_to_usdz(input_glb, output_usdz)
