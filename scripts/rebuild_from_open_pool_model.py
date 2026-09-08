"""Rebuild the game table from dpapavas' GPL 3.0 tournament-spec Blend.

The source supplies the complete rounded frame, six real pocket mouths,
continuous jaws, cushion cross-sections and tournament dimensions. This script
isolates the pool table, removes its legs, normalizes it to the game's
1100 x 640 coordinate system, replaces the materials, adds the rail sights and
regulation head string, and exports an isolated candidate.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE_BLEND = ROOT / "qa/2026-09-07-open-model-rebuild/sources/billiards_0.blend"
SOURCE_PAGE = "https://opengameart.org/content/billiard-tables"
TEXTURE_DIR = ROOT / "qa/2026-09-07-open-model-rebuild/textures"
OUTPUT_DIR = Path(sys.argv[sys.argv.index("--") + 1]).resolve() if "--" in sys.argv else ROOT / "qa/2026-09-07-open-model-rebuild/candidate-16"

TABLE_W = 1100.0
TABLE_H = 640.0
RAIL = 98.0
MIDDLE_OFFSET = 22.0
SURFACE_Z = 38.0
BALL_RADIUS = 15.0
POCKETS = [
    (RAIL - BALL_RADIUS, RAIL - BALL_RADIUS, True),
    (TABLE_W / 2, RAIL - MIDDLE_OFFSET, False),
    (TABLE_W - RAIL + BALL_RADIUS, RAIL - BALL_RADIUS, True),
    (RAIL - BALL_RADIUS, TABLE_H - RAIL + BALL_RADIUS, True),
    (TABLE_W / 2, TABLE_H - RAIL + MIDDLE_OFFSET, False),
    (TABLE_W - RAIL + BALL_RADIUS, TABLE_H - RAIL + BALL_RADIUS, True),
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.world = bpy.data.worlds.new("Pool table world")
    bpy.context.scene.world.color = (0.008, 0.012, 0.02)


def isolate_gpl_table() -> list[bpy.types.Object]:
    keep = {"pooltable", "poolcloth", "pockets", "panels"}
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or obj.name.lower() not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if {obj.name.lower() for obj in objects} != keep:
        raise RuntimeError("GPL source does not contain the expected four table meshes")
    if bpy.context.scene.world is None:
        bpy.context.scene.world = bpy.data.worlds.new("Pool table world")
    bpy.context.scene.world.color = (0.008, 0.012, 0.02)
    return objects


def mesh_face_components(obj: bpy.types.Object) -> list[set[int]]:
    remaining = set(range(len(obj.data.polygons)))
    vertex_faces: dict[int, set[int]] = {}
    for polygon in obj.data.polygons:
        for vertex_index in polygon.vertices:
            vertex_faces.setdefault(vertex_index, set()).add(polygon.index)
    components: list[set[int]] = []
    while remaining:
        component = {remaining.pop()}
        pending = list(component)
        while pending:
            polygon_index = pending.pop()
            for vertex_index in obj.data.polygons[polygon_index].vertices:
                linked = vertex_faces.get(vertex_index, set()) & remaining
                remaining -= linked
                component |= linked
                pending.extend(linked)
        components.append(component)
    return sorted(components, key=len, reverse=True)


def retain_source_tabletop(obj: bpy.types.Object) -> None:
    components = mesh_face_components(obj)
    if obj.name.lower() == "pooltable":
        keep_faces = components[0]
    elif obj.name.lower() == "panels":
        keep_faces = {
            face_index
            for component in components
            if max(obj.data.vertices[index].co.z for face_index in component for index in obj.data.polygons[face_index].vertices) > -0.5
            for face_index in component
        }
    else:
        return
    editable = bmesh.new()
    editable.from_mesh(obj.data)
    editable.faces.ensure_lookup_table()
    bmesh.ops.delete(editable, geom=[face for face in editable.faces if face.index not in keep_faces], context="FACES")
    editable.to_mesh(obj.data)
    editable.free()
    obj.data.update()


def normalize_gpl_object(obj: bpy.types.Object) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)
    for vertex in obj.data.vertices:
        source_z = vertex.co.z
        vertex.co.x = TABLE_W / 2 + vertex.co.x * 324.0
        vertex.co.y = TABLE_H / 2 + (vertex.co.y + 3.1) * 313.0
        vertex.co.z = SURFACE_Z + source_z * (300.0 if source_z >= 0 else 120.0)
    obj.data.update()


def assign_gpl_materials(objects: list[bpy.types.Object]) -> None:
    felt = make_material(
        "GPL model | blue felt surface",
        (1.0, 1.0, 1.0, 1),
        0.92,
        texture=TEXTURE_DIR / "reference-blue-cloth-fullsurface.png",
        texture_tint=0.0,
        texture_extension="EXTEND",
    )
    cushion = make_material("GPL model | cyan cushion face", (0.035, 0.34, 0.54, 1), 0.56, texture=TEXTURE_DIR / "reference-blue-cloth-tile.png", texture_tint=0.96)
    frame = make_material("GPL model | dark red mahogany frame", (0.24, 0.022, 0.009, 1), 0.31, texture=TEXTURE_DIR / "reference-mahogany-tile.png", coat=0.28, texture_tint=0.34)
    panels = make_material("GPL model | lacquered red mahogany panels", (0.58, 0.055, 0.018, 1), 0.24, texture=TEXTURE_DIR / "reference-mahogany-tile.png", coat=0.5, texture_tint=0.25)
    pocket = make_material("GPL model | burgundy pocket lining", (0.075, 0.002, 0.006, 1), 0.78, coat=0.08)
    by_name = {obj.name.lower(): obj for obj in objects}
    for name, material in (("pooltable", frame), ("panels", panels), ("pockets", pocket)):
        obj = by_name[name]
        obj.data.materials.clear()
        obj.data.materials.append(material)
    cloth_obj = by_name["poolcloth"]
    components = mesh_face_components(cloth_obj)
    surface_faces = components[0]
    cloth_obj.data.materials.clear()
    cloth_obj.data.materials.append(felt)
    cloth_obj.data.materials.append(cushion)
    for polygon in cloth_obj.data.polygons:
        polygon.material_index = 0 if polygon.index in surface_faces else 1
    if cloth_obj.data.uv_layers.active is None:
        cloth_obj.data.uv_layers.new(name="Reference planar UV")
    uv_layer = cloth_obj.data.uv_layers.active
    for polygon in cloth_obj.data.polygons:
        for loop_index in polygon.loop_indices:
            coordinate = cloth_obj.data.vertices[cloth_obj.data.loops[loop_index].vertex_index].co
            if polygon.material_index == 0:
                uv_layer.data[loop_index].uv = (
                    max(0.0, min(1.0, (coordinate.x - RAIL) / (TABLE_W - RAIL * 2))),
                    max(0.0, min(1.0, 1.0 - (coordinate.y - RAIL) / (TABLE_H - RAIL * 2))),
                )
            else:
                uv_layer.data[loop_index].uv = (coordinate.x / 170.0, coordinate.y / 120.0)


def make_material(name: str, color: tuple[float, float, float, float], roughness: float, metallic: float = 0.0, texture: Path | None = None, coat: float = 0.0, texture_tint: float = 0.2, texture_extension: str = "REPEAT") -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in shader.inputs:
        shader.inputs["Coat Weight"].default_value = coat
        shader.inputs["Coat Roughness"].default_value = max(0.08, roughness * 0.55)
    if texture:
        image = bpy.data.images.load(str(texture), check_existing=True)
        image.colorspace_settings.name = "sRGB"
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        tex.extension = texture_extension
        tex.interpolation = "Linear"
        tint = nodes.new("ShaderNodeMixRGB")
        tint.blend_type = "MULTIPLY"
        tint.inputs[0].default_value = texture_tint
        tint.inputs[2].default_value = color
        links.new(tex.outputs["Color"], tint.inputs[1])
        links.new(tint.outputs["Color"], shader.inputs["Base Color"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    material.diffuse_color = color
    return material


def remove_material_faces(obj: bpy.types.Object, material_name: str) -> None:
    remove_index = next(index for index, slot in enumerate(obj.material_slots) if slot.material and slot.material.name == material_name)
    mesh = obj.data
    editable = bmesh.new()
    editable.from_mesh(mesh)
    bmesh.ops.delete(editable, geom=[face for face in editable.faces if face.material_index == remove_index], context="FACES")
    editable.to_mesh(mesh)
    editable.free()
    mesh.update()


def deform_pockets_to_game_centers(obj: bpy.types.Object) -> None:
    measured = [(104.2, 101.1), (549.84, 91.8), (995.7, 101.1), (104.3, 538.9), (549.92, 548.2), (995.6, 539.2)]
    for vertex in obj.data.vertices:
        original = vertex.co.copy()
        offset = Vector((0.0, 0.0, 0.0))
        total_weight = 0.0
        for (source_x, source_y), (target_x, target_y, _) in zip(measured, POCKETS):
            distance = math.hypot(original.x - source_x, original.y - source_y)
            if distance >= 60.0:
                continue
            weight = 1.0 if distance <= 34.0 else 1.0 - (distance - 34.0) / 26.0
            weight = weight * weight * (3.0 - 2.0 * weight)
            offset.x += (target_x - source_x) * weight
            offset.y += (target_y - source_y) * weight
            total_weight += weight
        if total_weight:
            vertex.co.x += offset.x
            vertex.co.y += offset.y
    obj.data.update()


def expand_pocket_mouths(obj: bpy.types.Object) -> None:
    for vertex in obj.data.vertices:
        point = vertex.co
        closest = min(POCKETS, key=lambda pocket: math.hypot(point.x - pocket[0], point.y - pocket[1]))
        dx = point.x - closest[0]
        dy = point.y - closest[1]
        distance = math.hypot(dx, dy)
        if distance >= 55.0 or distance < 0.001:
            continue
        strength = 1.0 if distance <= 35.0 else 1.0 - (distance - 35.0) / 20.0
        strength = strength * strength * (3.0 - 2.0 * strength)
        factor = 1.0 + 0.34 * strength
        point.x = closest[0] + dx * factor
        point.y = closest[1] + dy * factor
    obj.data.update()


def remove_pocket_caps(obj: bpy.types.Object) -> None:
    pocket_index = next(index for index, slot in enumerate(obj.material_slots) if slot.material and slot.material.name == "Open model | burgundy pocket lining")
    editable = bmesh.new()
    editable.from_mesh(obj.data)
    caps = [
        face for face in editable.faces
        if face.material_index == pocket_index and face.calc_center_median().z < 27.0
    ]
    bmesh.ops.delete(editable, geom=caps, context="FACES")
    editable.to_mesh(obj.data)
    editable.free()
    obj.data.update()


def assign_source_materials(obj: bpy.types.Object) -> None:
    cloth = make_material(
        "Open model | blue felt surface",
        (1.0, 1.0, 1.0, 1),
        0.92,
        texture=TEXTURE_DIR / "reference-blue-cloth-fullsurface.png",
        texture_tint=0.0,
        texture_extension="EXTEND",
    )
    cloth_side = make_material("Open model | dark blue felt side", (0.02, 0.20, 0.32, 1), 0.86, texture=TEXTURE_DIR / "reference-blue-cloth-tile.png", texture_tint=0.99)
    cushion = make_material("Open model | cyan cushion face", (0.055, 0.42, 0.62, 1), 0.48, texture=TEXTURE_DIR / "reference-blue-cloth-tile.png", coat=0.08, texture_tint=0.97)
    wood = make_material("Open model | red mahogany frame", (0.50, 0.075, 0.025, 1), 0.27, texture=TEXTURE_DIR / "reference-mahogany-tile.png", coat=0.34)
    pocket = make_material("Open model | burgundy pocket lining", (0.16, 0.006, 0.012, 1), 0.58, coat=0.12)
    black = make_material("Open model | black pocket depth", (0.002, 0.003, 0.005, 1), 0.96)
    line = make_material("Open model | head string", (0.66, 0.88, 0.96, 1), 0.62)
    mapping = {
        "Beize": cloth,
        "BeizeSides": cloth_side,
        "BeizeCushions": cushion,
        "TableWood": wood,
        "PocketBlack": pocket,
        "Black": black,
        "DlinePool": line,
    }
    for slot in obj.material_slots:
        if slot.material and slot.material.name in mapping:
            slot.material = mapping[slot.material.name]


def prepare_felt_uvs(obj: bpy.types.Object) -> None:
    uv_layer = obj.data.uv_layers.active
    if uv_layer is None:
        return
    surface_indices = {
        index for index, slot in enumerate(obj.material_slots)
        if slot.material and slot.material.name == "Open model | blue felt surface"
    }
    tiled_indices = {
        index for index, slot in enumerate(obj.material_slots)
        if slot.material
        and slot.material.name != "Open model | blue felt surface"
        and ("felt" in slot.material.name.lower() or "cushion" in slot.material.name.lower())
    }
    for polygon in obj.data.polygons:
        if polygon.material_index in surface_indices:
            for loop_index in polygon.loop_indices:
                coordinate = obj.data.vertices[obj.data.loops[loop_index].vertex_index].co
                uv_layer.data[loop_index].uv = (
                    max(0.0, min(1.0, (coordinate.x - RAIL) / (TABLE_W - RAIL * 2))),
                    max(0.0, min(1.0, 1.0 - (coordinate.y - RAIL) / (TABLE_H - RAIL * 2))),
                )
        elif polygon.material_index in tiled_indices:
            for loop_index in polygon.loop_indices:
                uv_layer.data[loop_index].uv *= 6.0


def add_flat_disc(name: str, x: float, y: float, z: float, radius: float, depth: float, material: bpy.types.Material, vertices: int = 48) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=(x, y, z))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    return obj


def add_head_string(material: bpy.types.Material) -> bpy.types.Object:
    playable_width = TABLE_W - RAIL * 2
    playable_height = TABLE_H - RAIL * 2
    head_string_x = RAIL + playable_width * 0.25
    bpy.ops.mesh.primitive_cube_add(location=(head_string_x, TABLE_H / 2, SURFACE_Z + 0.14))
    obj = bpy.context.object
    obj.name = "GPL model | regulation head string"
    obj.dimensions = (1.35, playable_height - 2.0, 0.18)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    bevel = obj.modifiers.new("Soft painted line edge", "BEVEL")
    bevel.width = 0.65
    bevel.segments = 4
    bevel.limit_method = "ANGLE"
    return obj


def add_annular_sector(name: str, center: tuple[float, float], start: float, end: float, inner: float, outer: float, z: float, depth: float, material: bpy.types.Material, segments: int = 22) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for level in (-depth / 2, depth / 2):
        for index in range(segments + 1):
            angle = start + (end - start) * index / segments
            for radius in (inner, outer):
                vertices.append((center[0] + math.cos(angle) * radius, center[1] + math.sin(angle) * radius, z + level))
    stride = (segments + 1) * 2
    for index in range(segments):
        a = index * 2
        faces.append((a, a + 2, a + 3, a + 1))
        b = stride + a
        faces.append((b + 1, b + 3, b + 2, b))
        faces.append((a, b, b + 2, a + 2))
        faces.append((a + 1, a + 3, b + 3, b + 1))
    faces.extend(((0, 1, stride + 1, stride), (segments * 2, stride + segments * 2, stride + segments * 2 + 1, segments * 2 + 1)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    bevel = obj.modifiers.new("Soft guard bevel", "BEVEL")
    bevel.width = 1.4
    bevel.segments = 2
    return obj


def rounded_rect_points(width: float, height: float, radius: float, segments: int = 18) -> list[tuple[float, float]]:
    points = []
    centers = [
        (TABLE_W / 2 + width / 2 - radius, TABLE_H / 2 + height / 2 - radius, 0.0),
        (TABLE_W / 2 - width / 2 + radius, TABLE_H / 2 + height / 2 - radius, math.pi / 2),
        (TABLE_W / 2 - width / 2 + radius, TABLE_H / 2 - height / 2 + radius, math.pi),
        (TABLE_W / 2 + width / 2 - radius, TABLE_H / 2 - height / 2 + radius, math.pi * 1.5),
    ]
    for cx, cy, start in centers:
        for index in range(segments):
            angle = start + index * (math.pi / 2) / segments
            points.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
    return points


def add_rounded_ring(name: str, outer_size: tuple[float, float], inner_size: tuple[float, float], outer_radius: float, inner_radius: float, bottom: float, top: float, material: bpy.types.Material) -> bpy.types.Object:
    outer = rounded_rect_points(outer_size[0], outer_size[1], outer_radius)
    inner = rounded_rect_points(inner_size[0], inner_size[1], inner_radius)
    count = len(outer)
    vertices = [(x, y, z) for z in (bottom, top) for contour in (outer, inner) for x, y in contour]
    faces = []
    for index in range(count):
        nxt = (index + 1) % count
        lower_outer, lower_inner = index, count + index
        upper_outer, upper_inner = count * 2 + index, count * 3 + index
        faces.append((upper_outer, count * 2 + nxt, count * 3 + nxt, upper_inner))
        faces.append((lower_inner, count + nxt, nxt, lower_outer))
        faces.append((lower_outer, nxt, count * 2 + nxt, upper_outer))
        faces.append((lower_inner, upper_inner, count * 3 + nxt, count + nxt))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="Wood UV")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            coordinate = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            uv_layer.data[loop_index].uv = (coordinate.x / 260.0, coordinate.y / 180.0)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    bevel = obj.modifiers.new("Rounded lacquer edge", "BEVEL")
    bevel.width = 3.2
    bevel.segments = 3
    bevel.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj


def cut_pockets(obj: bpy.types.Object) -> None:
    for index, (x, y, corner) in enumerate(POCKETS, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=38.0 if corner else 33.0, depth=80.0, location=(x, y, 35.0))
        cutter = bpy.context.object
        cutter.name = f"Pocket {index} wood cutter"
        modifier = obj.modifiers.new(cutter.name, "BOOLEAN")
        modifier.operation = "DIFFERENCE"
        modifier.solver = "EXACT"
        modifier.object = cutter
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        bpy.data.objects.remove(cutter, do_unlink=True)


def build_table() -> tuple[Path, dict]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE_BLEND))
    objects = isolate_gpl_table()
    for obj in objects:
        retain_source_tabletop(obj)
        normalize_gpl_object(obj)
        for polygon in obj.data.polygons:
            polygon.use_smooth = obj.name.lower() == "pockets"
    assign_gpl_materials(objects)

    pocket_lining = next(obj for obj in objects if obj.name.lower() == "pockets")
    pocket_bevel = pocket_lining.modifiers.new("Natural pocket lip rounding", "BEVEL")
    pocket_bevel.width = 0.85
    pocket_bevel.segments = 3
    pocket_bevel.limit_method = "ANGLE"

    depth_material = make_material("GPL model | black pocket depth", (0.001, 0.001, 0.002, 1), 1.0)
    sight_material = make_material("GPL model | pearl sight", (0.93, 0.95, 0.96, 1), 0.18, metallic=0.05, coat=0.5)
    line_material = make_material("GPL model | regulation head string", (0.61, 0.85, 0.94, 1), 0.72)
    for index, (x, y, corner) in enumerate(POCKETS, 1):
        add_flat_disc(f"GPL pocket {index} recessed black bottom", x, y, 14.0, 27.0 if corner else 25.0, 2.0, depth_material)

    add_head_string(line_material)

    for x in (208, 322, 436, 664, 778, 892):
        add_flat_disc(f"GPL top sight {x}", x, 51.5, 53.0, 2.5, 1.2, sight_material, 24)
        add_flat_disc(f"GPL bottom sight {x}", x, 588.5, 53.0, 2.5, 1.2, sight_material, 24)
    for y in (214, 320, 426):
        add_flat_disc(f"GPL left sight {y}", 49.5, y, 53.0, 2.5, 1.2, sight_material, 24)
        add_flat_disc(f"GPL right sight {y}", 1050.5, y, 53.0, 2.5, 1.2, sight_material, 24)

    opening_hits = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for index, (x, y, _) in enumerate(POCKETS, 1):
        hit, location, _, _, obj, _ = bpy.context.scene.ray_cast(depsgraph, Vector((x, y, 120)), Vector((0, 0, -1)), distance=200)
        opening_hits.append({"pocket": index, "hit": bool(hit), "first_hit": obj.name if obj else None, "z": round(location.z, 3) if hit else None})

    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.select_set(True)
    bpy.context.view_layer.objects.active = next(obj for obj in objects if obj.name.lower() == "pooltable")
    glb = OUTPUT_DIR / "pool-table.glb"
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True, export_apply=True, export_texcoords=True, export_normals=True, export_materials="EXPORT")
    blend = OUTPUT_DIR / "pool-table-open-model.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    return glb, {
        "opening_ray_tests": opening_hits,
        "source_sha256": sha256(SOURCE_BLEND),
        "source_page": SOURCE_PAGE,
        "license": "GPL 3.0; Billiard tables by dpapavas; modified for this game",
    }


def build_ball() -> Path:
    clear_scene()
    bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=96, radius=BALL_RADIUS, location=(0, 0, 0))
    ball = bpy.context.object
    ball.name = "GPL table rebuild | tournament phenolic ball | high resolution UV sphere"
    ball.data.materials.append(make_material("GPL table rebuild | polished phenolic", (0.98, 0.96, 0.89, 1), 0.075, coat=0.9))
    for polygon in ball.data.polygons:
        polygon.use_smooth = True
    bpy.ops.object.select_all(action="DESELECT")
    ball.select_set(True)
    bpy.context.view_layer.objects.active = ball
    glb = OUTPUT_DIR / "pool-ball.glb"
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True, export_apply=True, export_texcoords=True, export_normals=True, export_materials="EXPORT")
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_DIR / "pool-ball-open-model.blend"))
    return glb


table_glb, source_report = build_table()
ball_glb = build_ball()
manifest = {
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "blender": bpy.app.version_string,
    "generator": str(Path(__file__).resolve()),
    "source": source_report,
    "textures": {
        "cloth": {"path": str(TEXTURE_DIR / "reference-blue-cloth-fullsurface.png"), "sha256": sha256(TEXTURE_DIR / "reference-blue-cloth-fullsurface.png")},
        "wood": {"path": str(TEXTURE_DIR / "reference-mahogany-tile.png"), "sha256": sha256(TEXTURE_DIR / "reference-mahogany-tile.png")},
    },
    "table_glb": {"path": str(table_glb), "bytes": table_glb.stat().st_size, "sha256": sha256(table_glb)},
    "ball_glb": {"path": str(ball_glb), "bytes": ball_glb.stat().st_size, "sha256": sha256(ball_glb)},
}
(OUTPUT_DIR / "open-model-rebuild-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(json.dumps(manifest, indent=2))
